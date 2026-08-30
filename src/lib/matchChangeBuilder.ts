import type { MatchChange, MatchdayMatch } from './matchday';

/**
 * Sestavení událostí o změně zápasu pro automatické hodnocení dne.
 *
 * ── PROČ SAMOSTATNÝ MODUL ───────────────────────────────────────────────────
 * `sync-football/route.ts` má přes 1600 řádků. Předchozí pokus zasáhnout do
 * něj rozsáhleji skončil nepárovou závorkou. Logika je proto tady, čistá
 * a testovatelná, a v routě zbývají jen krátká volání.
 *
 * ── KONTRAKT ────────────────────────────────────────────────────────────────
 * `MatchChange` znamená: **databáze se opravdu změnila**. Událost proto
 * vzniká až PO úspěšném zápisu a z hodnot, které databáze vrátila —
 * nikdy z optimistického odhadu ani z payloadu bez `id`.
 */

/** Sloupce, které se musí načíst zpět po zápisu. */
export const MATCH_CHANGE_COLUMNS = 'id, round, kickoff, status, home_score, away_score';

/**
 * Převod řádku z databáze na tvar pro vyhodnocení dne.
 * Vrací `null`, když chybí `id` nebo `round` — bez nich nelze určit den.
 */
export function toMatchdayMatch(row: Record<string, unknown> | null | undefined): MatchdayMatch | null {
  if (!row) return null;
  const id = Number(row.id);
  const round = Number(row.round);
  if (!Number.isFinite(id) || !Number.isFinite(round)) return null;

  const kickoff = String(row.kickoff ?? '');
  if (!kickoff) return null;

  return {
    id,
    round,
    kickoff,
    status: String(row.status ?? 'scheduled') as MatchdayMatch['status'],
    home_score: row.home_score == null ? null : Number(row.home_score),
    away_score: row.away_score == null ? null : Number(row.away_score),
  };
}

/**
 * Události pro vložené zápasy.
 *
 * Vstupem jsou řádky, které vrátila databáze — teprve ty mají `id`.
 * Payload před zápisem ho nemá, takže by z něj událost nešla sestavit.
 */
export function changesFromInserted(rows: Record<string, unknown>[] | null | undefined): MatchChange[] {
  return (rows ?? [])
    .map((row) => toMatchdayMatch(row))
    .filter((m): m is MatchdayMatch => m !== null)
    .map((after) => ({ before: null, after }));
}

/**
 * Událost pro aktualizovaný zápas.
 *
 * `after` musí pocházet z databáze, ne ze sloučení `{...existing, ...payload}` —
 * to by událost vytvořilo i pro zápis, který selhal.
 */
export function changeFromUpdated(
  before: Record<string, unknown> | null | undefined,
  persistedAfter: Record<string, unknown> | null | undefined,
): MatchChange | null {
  const po = toMatchdayMatch(persistedAfter);
  if (!po) return null;
  return { before: toMatchdayMatch(before), after: po };
}

/**
 * Události pro hromadnou opravu zaseknutého živého stavu na `finished`,
 * sestavené z hodnot ULOŽENÝCH V DATABÁZI.
 *
 * Páruje se podle neměnného `id`. Řádek, který se v uloženém výsledku
 * neobjeví, událost nevytvoří — zápis u něj neprošel.
 *
 * Proti `changesFromForcedFinish` je tohle přesnější: `after` není odhad,
 * ale skutečný stav po zápisu. Používají to obě produkční cesty.
 */
export function changesFromPersistedFinish(
  beforeRows: Record<string, unknown>[] | null | undefined,
  persistedRows: Record<string, unknown>[] | null | undefined,
): MatchChange[] {
  const predPodleId = new Map<number, Record<string, unknown>>();
  for (const row of beforeRows ?? []) {
    const id = Number(row.id);
    if (Number.isFinite(id)) predPodleId.set(id, row);
  }

  return (persistedRows ?? [])
    .map((po): MatchChange | null => {
      const id = Number(po.id);
      const pred = Number.isFinite(id) ? predPodleId.get(id) : undefined;
      return changeFromUpdated(pred ?? null, po);
    })
    .filter((z): z is MatchChange => z !== null);
}

/*
 * POZNÁMKA: dřívější `changesFromForcedFinish()` byla odstraněna.
 * Sestavovala `after` odhadem (`{...pred, status: 'finished'}`), zatímco
 * produkční kontrakt vyžaduje stav skutečně uložený v databázi.
 * Nahradila ji `changesFromPersistedFinish()` výše.
 */
