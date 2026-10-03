/**
 * Co se při dotazu na poskytovatele opravdu změnilo.
 *
 * ── PROČ ────────────────────────────────────────────────────────────────────
 * Highlightly cesta dřív zapsala celý řádek pokaždé, když byl dotaz „na
 * řadě“ — i když vrátil přesně totéž. Každý takový zápis pak vypadal jako
 * změna, takže se invalidovala cache a prohlížeče znovu vykreslily stránku.
 *
 * Rozlišují se tři úrovně:
 *   semantic – skóre, stav, regulérní skóre, penalty → mění body i hodnocení
 *   visible  – navíc minuta, čas, délka a obsah detailu → mění, co parta vidí
 *   žádná    – jen časová značka poskytovatele → NEZAPISOVAT řádek
 */

export interface LiveRowFields {
  home_score?: number | null;
  away_score?: number | null;
  status?: string | null;
  reg_home?: number | null;
  reg_away?: number | null;
  pen_home?: number | null;
  pen_away?: number | null;
  minute?: number | string | null;
  clock?: string | null;
  duration?: string | number | null;
  detail?: unknown;
}

export interface LiveRowDiff {
  /** Mění body tipérů nebo hodnocení kola. */
  semantic: boolean;
  /** Mění cokoli, co parta na stránce vidí. Zahrnuje `semantic`. */
  visible: boolean;
}

const SEMANTICKA_POLE = [
  'home_score', 'away_score', 'status', 'reg_home', 'reg_away', 'pen_home', 'pen_away',
] as const;

const VIDITELNA_POLE = ['minute', 'clock', 'duration'] as const;

/** `null` a `undefined` jsou pro porovnání totéž. */
function stejne(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

/**
 * Kanonický obsah detailu BEZ metadat poskytovatele.
 *
 * `_highlightly` nese časové značky dotazů (`listFetchedAt`, …). Ty se mění
 * při každém dotazu, ale parta je nevidí — nesmí proto vypadat jako změna.
 */
export function detailContent(detail: unknown): string {
  if (!detail || typeof detail !== 'object') return 'null';
  const bezMetadat = { ...(detail as Record<string, unknown>) };
  delete bezMetadat._highlightly;
  return stabilni(bezMetadat);
}

/** Stabilní serializace – pořadí klíčů nerozhoduje. */
function stabilni(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stabilni).join(',')}]`;
  if (value && typeof value === 'object') {
    const zaznam = value as Record<string, unknown>;
    return `{${Object.keys(zaznam).sort()
      .filter((k) => zaznam[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stabilni(zaznam[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function diffLiveRow(before: LiveRowFields, next: LiveRowFields): LiveRowDiff {
  const semantic = SEMANTICKA_POLE.some((pole) => !stejne(before[pole], next[pole]));
  const viditelnaPole = VIDITELNA_POLE.some((pole) => !stejne(before[pole], next[pole]));
  const detail = detailContent(before.detail) !== detailContent(next.detail);

  return { semantic, visible: semantic || viditelnaPole || detail };
}
