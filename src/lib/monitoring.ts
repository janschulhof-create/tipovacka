import type { ExpectedCategory } from './monitoringConfig';

/**
 * Monitoring – jediné místo, přes které aplikace hlásí chyby.
 *
 * ── PROČ VRSTVA NAD SENTRY ──────────────────────────────────────────────────
 * 1. Selhání monitoringu NESMÍ shodit požadavek. Každé volání je v try/catch.
 * 2. Očekávané stavy (429, timeout, cizí zámek) se nehlásí jako problém,
 *    jen jako drobečková stopa. Rozhodnutí je na jednom místě.
 * 3. SDK jde v testech nahradit – testy nesahají na síť.
 */

export interface MonitoringSink {
  captureException(error: unknown, context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }): void;
  captureMessage(message: string, level: 'warning' | 'error', context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }): void;
  addBreadcrumb(crumb: { category: string; message: string; level: 'info' | 'warning'; data?: Record<string, unknown> }): void;
}

/** Monitoring vypnutý (bez DSN). */
const NIC: MonitoringSink = {
  captureException() {}, captureMessage() {}, addBreadcrumb() {},
};

/**
 * Než se SDK v prohlížeči načte (odloženě), chyby se drží tady a odešlou
 * se po napojení. Fronta je malá a omezená – žádné hromadění paměti.
 */
const FRONTA_MAX = 20;
type Zaznam = (s: MonitoringSink) => void;
let fronta: Zaznam[] = [];

const CEKAJICI: MonitoringSink = {
  captureException: (e, c) => { if (fronta.length < FRONTA_MAX) fronta.push((s) => s.captureException(e, c)); },
  captureMessage: (m, l, c) => { if (fronta.length < FRONTA_MAX) fronta.push((s) => s.captureMessage(m, l, c)); },
  addBreadcrumb: (b) => { if (fronta.length < FRONTA_MAX) fronta.push((s) => s.addBreadcrumb(b)); },
};

let sink: MonitoringSink = CEKAJICI;

/** Napojí SDK a odešle, co čekalo. Testy sem dávají napodobeninu. */
export function setMonitoringSink(next: MonitoringSink | null): void {
  sink = next ?? NIC;
  const cekalo = fronta;
  fronta = [];
  if (!next) return;
  for (const z of cekalo) {
    try { z(next); } catch { /* monitoring nesmí shodit aplikaci */ }
  }
}

/** Jen pro testy: kolik záznamů čeká na SDK. */
export function pendingForTests(): number {
  return fronta.length;
}

/** Jen pro testy: návrat do stavu před napojením SDK. */
export function resetMonitoringForTests(): void {
  sink = CEKAJICI;
  fronta = [];
}

/** Skutečná, akční chyba → issue v Sentry. */
export function reportError(
  error: unknown,
  context: { area: string; tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  try {
    sink.captureException(error, {
      tags: { area: context.area, ...context.tags },
      extra: context.extra,
    });
  } catch {
    // Monitoring nesmí nikdy shodit požadavek.
  }
}

/** Očekávaný, obnovitelný stav → jen drobečková stopa, žádné issue. */
export function reportExpected(category: ExpectedCategory, data?: Record<string, unknown>): void {
  try {
    sink.addBreadcrumb({ category: 'expected', message: category, level: 'info', data });
  } catch {
    // ignorovat
  }
}

/**
 * Konfigurační problém, který se hlásí NEJVÝŠ JEDNOU za běh procesu.
 *
 * Typicky chybějící migrace nebo oprávnění — akční, ale opakoval by se při
 * každém požadavku a zbytečně by plnil kvótu.
 */
const nahlaseno = new Set<string>();
export function reportOnce(key: string, message: string, extra?: Record<string, unknown>): void {
  if (nahlaseno.has(key)) return;
  nahlaseno.add(key);
  try {
    sink.captureMessage(message, 'warning', { tags: { area: 'config', key }, extra });
  } catch {
    // ignorovat
  }
}

/** Jen pro testy. */
export function resetReportOnceForTests(): void {
  nahlaseno.clear();
}
