/**
 * Pojmenování kol.
 *
 * Vyřazovací názvy (Osmifinále, Čtvrtfinále, …) dávají smysl JEN u pohárových
 * soutěží typu MS. U ligy (Chance liga) je kolo prostě „N. kolo" — proto se
 * knockout názvy nikdy nesmí použít pro ligu, jinak by se 8. kolo ligy
 * omylem přejmenovalo na „Zápas o bronz".
 */

/** Pozná pohárovou soutěž podle názvu sezóny (MS 2026 = knockout; „2025/26" = liga). */
export function isKnockoutSeason(seasonName: string | null | undefined): boolean {
  const n = (seasonName ?? '').toLowerCase();
  return n.startsWith('ms') || n.includes('world') || n.includes('mistrovství světa');
}

const KNOCKOUT: Record<number, string> = {
  4: 'Šestnáctifinále',
  5: 'Osmifinále',
  6: 'Čtvrtfinále',
  7: 'Semifinále',
  8: 'Zápas o bronz',
  9: 'Finále',
};

/** Krátký název kola pro odpočet/výběr. `knockout=false` → vždy „N. kolo". */
export function roundLabel(round: number, knockout: boolean): string {
  if (knockout && KNOCKOUT[round]) return KNOCKOUT[round];
  return `${round}. kolo`;
}

/** Varianta „po N. kole" / „po semifinále" pro průběžné pořadí. */
export function afterRoundLabel(round: number, knockout: boolean): string {
  if (knockout && KNOCKOUT[round]) return `po ${KNOCKOUT[round].toLowerCase()}`;
  return `po ${round}. kole`;
}
