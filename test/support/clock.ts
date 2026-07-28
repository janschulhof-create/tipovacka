/**
 * Deterministický čas pro testy.
 *
 * Testy nesmí záviset na reálném `Date.now()` ani na časovém pásmu stroje.
 * Všechny doménové funkce musí přijímat čas jako parametr – kde to nejde,
 * je to samo o sobě defekt návrhu.
 */

export const PRAGUE = 'Europe/Prague';

/** Vytvoří UTC timestamp z pražského lokálního času (řeší i letní/zimní čas). */
export function pragueTime(iso: string): number {
  // `iso` bez zóny, např. '2026-07-25T18:00:00'
  const asUtc = new Date(`${iso}Z`).getTime();
  // posun pásma v daném okamžiku
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: PRAGUE,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(asUtc)).map((p) => [p.type, p.value]));
  const local = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  const offset = local - asUtc;
  return asUtc - offset;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
