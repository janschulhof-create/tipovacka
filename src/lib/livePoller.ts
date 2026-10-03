/**
 * Plánovač automatického obnovování živých dat v prohlížeči.
 *
 * ── CO ŘEŠÍ ─────────────────────────────────────────────────────────────────
 * 1. PŘEKRYV. `setInterval(async …)` spustí další dotaz, i když předchozí
 *    ještě běží. Pomalý server tak dostal z jedné záložky dva i víc dotazů
 *    naráz. Tady se další kolo plánuje až PO dokončení předchozího.
 *
 * 2. VÝPADEK. Dřív se při chybě obnovila stránka — každý prohlížeč tak při
 *    výpadku zdroje dál spouštěl drahé serverové vykreslení, ačkoli žádná
 *    čerstvá data nebyla. Teď se zachová poslední stav a interval se
 *    prodlouží.
 *
 * 3. BOUŘE. Když se po výpadku vrátí spojení všem naráz, nesmí všichni
 *    udeřit v tutéž chvíli. Proto náhodný rozptyl.
 *
 * Čistý modul: čas, časovače i náhoda se předávají zvenku, takže chování
 * jde ověřit falešnými hodinami.
 */

/** Výsledek jednoho automatického dotazu. */
export type SyncOutcome = 'changed' | 'unchanged' | 'error';

/** Normální interval během živého zápasu. */
export const LIVE_POLL_BASE_MS = 90_000;

/** Prodlužování po chybách. Poslední hodnota je strop. */
export const LIVE_POLL_BACKOFF_MS = [90_000, 180_000, 300_000, 600_000] as const;

/** Rozptyl ±10 %, aby se prohlížeče po výpadku nesešly v jedné chvíli. */
export const LIVE_POLL_JITTER = 0.1;

/** Interval po N po sobě jdoucích chybách (0 = žádná chyba). */
export function backoffDelay(consecutiveErrors: number, random: () => number): number {
  const index = Math.min(consecutiveErrors, LIVE_POLL_BACKOFF_MS.length - 1);
  const zaklad = LIVE_POLL_BACKOFF_MS[index];
  // random() ∈ [0, 1) → rozptyl ∈ [−10 %, +10 %)
  const rozptyl = 1 + (random() * 2 - 1) * LIVE_POLL_JITTER;
  return Math.round(zaklad * rozptyl);
}

export interface PollerDeps {
  sync(): Promise<SyncOutcome>;
  refresh(): void;
  isVisible(): boolean;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  random(): number;
}

export interface LivePoller {
  start(): void;
  stop(): void;
  /** Kolik dotazů z této záložky právě běží. Nikdy víc než 1. */
  inFlight(): number;
  /** Počet chyb v řadě – pro diagnostiku a testy. */
  consecutiveErrors(): number;
}

export function createLivePoller(deps: PollerDeps): LivePoller {
  let handle: unknown = null;
  let bezi = 0;
  let chyby = 0;
  let aktivni = false;

  const naplanuj = () => {
    if (!aktivni) return;
    handle = deps.setTimeout(kolo, backoffDelay(chyby, deps.random));
  };

  const kolo = async () => {
    handle = null;
    if (!aktivni) return;

    // Skrytá záložka nedotazuje, jen si naplánuje další pokus.
    if (!deps.isVisible() || bezi > 0) { naplanuj(); return; }

    bezi += 1;
    try {
      const vysledek = await deps.sync().catch((): SyncOutcome => 'error');
      if (vysledek === 'error') {
        // Poslední známý stav zůstává. Žádné vykreslení naprázdno.
        chyby += 1;
      } else {
        chyby = 0;
        if (vysledek === 'changed') deps.refresh();
      }
    } finally {
      bezi -= 1;
      naplanuj();
    }
  };

  return {
    start() {
      if (aktivni) return;
      aktivni = true;
      naplanuj();
    },
    stop() {
      aktivni = false;
      if (handle != null) deps.clearTimeout(handle);
      handle = null;
    },
    inFlight: () => bezi,
    consecutiveErrors: () => chyby,
  };
}

/**
 * Jeden společný běh synchronizace pro celou záložku.
 *
 * ── PROČ ────────────────────────────────────────────────────────────────────
 * Plánovač brání překryvu jen svých vlastních kol. Záložka ale má i další
 * spouštěče — první načtení, návrat do aplikace a ruční stažení — a ty
 * dřív běžely nezávisle. Návrat do aplikace tak mohl odeslat druhý dotaz
 * ve chvíli, kdy první ještě visel.
 *
 * Tady se všechny spouštěče sejdou: když už dotaz běží, další volající
 * dostane TENTÝŽ slib a nový dotaz nevznikne. Ruční stažení tedy počká
 * na probíhající běh a zobrazí jeho výsledek.
 */
export interface SingleFlight<T> {
  run(): Promise<T>;
  /** Kolik dotazů právě běží. Nikdy víc než 1. */
  inFlight(): number;
}

export function createSingleFlight<T>(fn: () => Promise<T>): SingleFlight<T> {
  let probiha: Promise<T> | null = null;

  return {
    run() {
      if (probiha) return probiha;
      probiha = (async () => {
        try {
          return await fn();
        } finally {
          probiha = null;
        }
      })();
      return probiha;
    },
    inFlight: () => (probiha ? 1 : 0),
  };
}
