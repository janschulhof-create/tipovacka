'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createLivePoller, createSingleFlight, LIVE_POLL_BASE_MS, type SyncOutcome } from '@/lib/livePoller';

/**
 * Klientem spouštěná synchronizace — stav od v0.1.82.
 *
 * Prohlížeč spouští synchronizaci s poskytovatelem při prvním načtení,
 * v pravidelném rytmu, při návratu do aplikace a při stažení dolů.
 *
 * Ochrana proti souběhu má DVĚ vrstvy:
 *   1) V záložce: všechny spouštěče jdou přes `createSingleFlight`, takže
 *      z jedné záložky nikdy neodejdou dva dotazy současně.
 *   2) Mezi záložkami, prohlížeči a cronem: databázový zámek
 *      `claim_sync_lease` (migrace 06). Poskytovatele se ptá vždy jen jeden
 *      vlastník; ostatní dostanou aktuální stav z databáze.
 *
 * Rytmus řídí `createLivePoller`: 90 s, po chybách postupně až 10 min,
 * skrytá záložka nedotazuje. Stránka se vykreslí jen při skutečné změně.
 *
 * ZBÝVAJÍCÍ DLUH: data se aktualizují i z cronu (každých 20 min), ale
 * živé minuty závisí na tom, že má někdo aplikaci otevřenou. Cílový stav
 * je, aby prohlížeč pouze četl.
 *
 * POSTUP VYPNUTÍ (záměrně až po ověření serverového cronu):
 *   1) nasadit a ověřit serverový cron,
 *   2) nastavit `NEXT_PUBLIC_CLIENT_SYNC=0` → klientský trigger se vypne,
 *      pull-to-refresh i auto-refresh dál fungují (jen bez volání syncu),
 *   3) po ověření odstranit tento blok úplně.
 * ROLLBACK: smazat proměnnou nebo nastavit `NEXT_PUBLIC_CLIENT_SYNC=1`.
 *
 * Výchozí hodnota je ZAPNUTO, aby se současné chování nezměnilo.
 * Regresní test `test/regression/r7-klient-nespousti-sync.test.ts` zůstává
 * záměrně červený, dokud tento blok existuje.
 */
const CLIENT_SYNC_ENABLED = process.env.NEXT_PUBLIC_CLIENT_SYNC !== '0';

export const __technicalDebt_clientSync = {
  enabled: CLIENT_SYNC_ENABLED,
  removeInStage: 6,
  reason: 'Synchronizace nesmí záviset na otevřené aplikaci ani běžet bez zámku.',
} as const;

/**
 * Obnovení dat bez zavírání appky:
 *  - Pull-to-refresh: vědomé stažení palcem dolů z úplného vrchu stránky (mobil i myš/trackpad).
 *  - Auto-refresh: když běží živý zápas (hasLive), tiše obnovuje přes `createLivePoller`.
 * Používá router.refresh() – server komponenty se přenačtou z DB bez plného reloadu.
 */
/**
 * `intervalMs` se už nepoužívá – rytmus řídí `createLivePoller` (90 s
 * normálně, delší po chybách). Ponecháno v typu kvůli zpětné kompatibilitě.
 */
export function LiveRefresh({ hasLive }: { hasLive: boolean; intervalMs?: number }) {
  const router = useRouter();
  const [pull, setPull] = useState(0); // aktuální vzdálenost stažení (px)
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false); // začali jsme tahat z úplného vrchu?
  const lastRefreshAt = useRef(Date.now());
  const initialSyncDone = useRef(false);

  const THRESHOLD = 70; // px – kolik je potřeba stáhnout pro spuštění
  const MAX = 110;

  /**
   * Stáhne čerstvá data. Vrací, jestli se v databázi něco změnilo.
   *
   * Při chybě vrací `true` – lepší jednou zbytečně obnovit, než nechat
   * uživatele dívat se na zastaralý stav.
   */
  /**
   * Stáhne čerstvá data.
   *
   * `error` = nepodařilo se. Automatické obnovování pak NEVYKRESLÍ stránku
   * naprázdno, jen prodlouží interval; poslední známý stav zůstává.
   */
  const syncLiveData = useCallback(async (): Promise<SyncOutcome> => {
    // Viz TECHNICKÝ DLUH výše – vypínatelné přes NEXT_PUBLIC_CLIENT_SYNC=0.
    if (!CLIENT_SYNC_ENABLED || !hasLive) return 'unchanged';
    try {
      const res = await fetch('/api/sync-football?competition=liga&live_only=1', { method: 'POST', cache: 'no-store' });
      if (!res.ok) return 'error';
      const body = await res.json().catch(() => null) as { changed?: unknown } | null;
      // Starší server pole nevrací → chovat se jako dřív a obnovit.
      if (typeof body?.changed !== 'boolean') return 'changed';
      return body.changed ? 'changed' : 'unchanged';
    } catch {
      return 'error';
    }
  }, [hasLive]);


  /**
   * Jediný běh synchronizace pro celou záložku. Všechny spouštěče – plánovač,
   * první načtení, návrat do aplikace i ruční stažení – jdou přes něj, takže
   * ze záložky nikdy neodejdou dva dotazy současně. Kdo přijde během běhu,
   * dostane jeho výsledek.
   */
  const sdilenySync = useMemo(() => createSingleFlight(syncLiveData), [syncLiveData]);

  const doRefresh = useCallback(async () => {
    setBusy(true);
    lastRefreshAt.current = Date.now();
    // Když už běží jiný dotaz, počká na něj – druhý se neodešle.
    await sdilenySync.run();
    // Ruční obnovení obnoví stránku vždy – i při chybě. Uživatel o to požádal.
    router.refresh();
    // krátká vizuální odezva, ať uživatel vidí, že se něco stalo
    window.setTimeout(() => {
      setBusy(false);
      setPull(0);
    }, 700);
  }, [router, sdilenySync]);

  // První otevření živého zápasu musí skutečně dotáhnout zdrojová data;
  // samotný router.refresh() by jen znovu přečetl starý stav z databáze.
  useEffect(() => {
    if (!hasLive || initialSyncDone.current) return;
    initialSyncDone.current = true;
    void (async () => {
      const vysledek = await sdilenySync.run();
      lastRefreshAt.current = Date.now();
      // Jen při změně. Beze změny i při chybě zůstává aktuální vykreslení.
      if (vysledek === 'changed') router.refresh();
    })();
  }, [hasLive, router, sdilenySync]);

  // ── auto-refresh při živém zápasu ──
  useEffect(() => {
    if (!hasLive) return;
    // Plánovač místo setInterval: další kolo až PO dokončení předchozího,
    // takže pomalý server nikdy nedostane z jedné záložky dva dotazy naráz.
    // Stránka se vykreslí jen při změně; chyba prodlouží interval.
    const poller = createLivePoller({
      sync: async () => {
        lastRefreshAt.current = Date.now();
        return sdilenySync.run();
      },
      refresh: () => router.refresh(),
      isVisible: () => document.visibilityState === 'visible',
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (h) => window.clearTimeout(h as number),
      random: Math.random,
    });
    poller.start();
    return () => poller.stop();
  }, [hasLive, router, sdilenySync]);

  // Návrat do aplikace obnoví data jen během živých zápasů a pouze tehdy,
  // když od posledního obnovení uběhl celý interval. Dříve se plný serverový
  // render spouštěl při každém přepnutí aplikace, i když se nic nehrálo.
  useEffect(() => {
    if (!hasLive) return;
    const onVis = async () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshAt.current < LIVE_POLL_BASE_MS) return;
      lastRefreshAt.current = Date.now();
      // Návrat do aplikace: vykreslit jen při změně, chyba stav nemaže.
      const vysledek = await sdilenySync.run();
      if (vysledek === 'changed') router.refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [hasLive, router, sdilenySync]);

  // ── pull-to-refresh (touch) ──
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY <= 0 && !busy) {
        startY.current = e.touches[0].clientY;
        armed.current = true;
      } else {
        armed.current = false;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!armed.current || startY.current === null || busy) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && window.scrollY <= 0) {
        // odpor: čím dál, tím pomaleji
        const dist = Math.min(MAX, dy * 0.5);
        setPull(dist);
        if (dist > 6 && e.cancelable) e.preventDefault();
      }
    };
    const onEnd = () => {
      if (!armed.current) return;
      armed.current = false;
      startY.current = null;
      if (pull >= THRESHOLD) doRefresh();
      else setPull(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [pull, busy, doRefresh]);

  // ── pull-to-refresh (myš/trackpad na PC): vědomé tažení z vrchu dolů ──
  useEffect(() => {
    let downY: number | null = null;
    let mArmed = false;
    const onDown = (e: MouseEvent) => {
      if (window.scrollY <= 0 && !busy && e.button === 0) {
        downY = e.clientY;
        mArmed = true;
      }
    };
    const onMoveM = (e: MouseEvent) => {
      if (!mArmed || downY === null || busy) return;
      if ((e.buttons & 1) === 0) {
        mArmed = false;
        downY = null;
        setPull(0);
        return;
      }
      const dy = e.clientY - downY;
      if (dy > 0 && window.scrollY <= 0) setPull(Math.min(MAX, dy * 0.5));
    };
    const onUp = () => {
      if (!mArmed) return;
      mArmed = false;
      downY = null;
      if (pull >= THRESHOLD) doRefresh();
      else setPull(0);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMoveM);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMoveM);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pull, busy, doRefresh]);

  const active = pull > 0 || busy;
  const ready = pull >= THRESHOLD;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center overflow-hidden transition-[height] duration-150"
      style={{ height: active ? Math.max(pull, busy ? 48 : 0) : 0 }}
    >
      <div className="mt-2 flex items-center gap-2 rounded-full bg-terrain-800/90 px-3 py-1.5 text-xs font-medium text-slate-100 shadow-lg ring-1 ring-white/10">
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full border-2 border-flag border-t-transparent ${
            busy ? 'animate-spin' : ''
          }`}
          style={{ transform: busy ? undefined : `rotate(${Math.min(180, (pull / THRESHOLD) * 180)}deg)` }}
        />
        {busy ? 'Aktualizuji…' : ready ? 'Pusť pro obnovení' : 'Stáhni pro obnovení'}
      </div>
    </div>
  );
}
