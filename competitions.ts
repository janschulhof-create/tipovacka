'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Obnovení dat bez zavírání appky:
 *  - Pull-to-refresh: vědomé stažení palcem dolů z úplného vrchu stránky (mobil i myš/trackpad).
 *  - Auto-refresh: když běží živý zápas (hasLive), tiše obnovuje každých `intervalMs`.
 * Používá router.refresh() – server komponenty se přenačtou z DB bez plného reloadu.
 */
export function LiveRefresh({ hasLive, intervalMs = 90000 }: { hasLive: boolean; intervalMs?: number }) {
  const router = useRouter();
  const [pull, setPull] = useState(0); // aktuální vzdálenost stažení (px)
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false); // začali jsme tahat z úplného vrchu?
  const lastRefreshAt = useRef(Date.now());

  const THRESHOLD = 70; // px – kolik je potřeba stáhnout pro spuštění
  const MAX = 110;

  const doRefresh = useCallback(async () => {
    setBusy(true);
    lastRefreshAt.current = Date.now();
    router.refresh();
    // krátká vizuální odezva, ať uživatel vidí, že se něco stalo
    window.setTimeout(() => {
      setBusy(false);
      setPull(0);
    }, 700);
  }, [router]);

  // ── auto-refresh při živém zápasu ──
  useEffect(() => {
    if (!hasLive) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      lastRefreshAt.current = Date.now();
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [hasLive, intervalMs, router]);

  // Návrat do aplikace obnoví data jen během živých zápasů a pouze tehdy,
  // když od posledního obnovení uběhl celý interval. Dříve se plný serverový
  // render spouštěl při každém přepnutí aplikace, i když se nic nehrálo.
  useEffect(() => {
    if (!hasLive) return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshAt.current < intervalMs) return;
      lastRefreshAt.current = Date.now();
      router.refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [hasLive, intervalMs, router]);

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
