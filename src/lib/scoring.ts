/**
 * Bodování přesně podle pravidel Tipsport Megatipovačky.
 *
 * Vstup: skutečný výsledek (ah:aa) a tip (ph:pa).
 * Výstup: 0 | 2 | 4 | 6 | 10 bodů.
 *
 * Hierarchie (vyhrává nejvyšší splněné pravidlo):
 *  10 b – přesný výsledek
 *   6 b – správný vítěz/tendence A ZÁROVEŇ:
 *          a) správný gólový rozdíl, NEBO
 *          b) přesný počet gólů vítěze, NEBO
 *          c) nepřesně trefená remíza (tip remíza & výsledek remíza, ale jiné skóre)
 *   4 b – pouze správný vítěz/tendence (žádná z podmínek pro 6 b)
 *   2 b – ŠPATNÝ vítěz, ale přesný počet gólů jednoho z týmů
 *   0 b – ostatní
 *
 * Tato funkce je referenční (TS) a je 1:1 zrcadlena v SQL funkci
 * `calculate_points` v supabase/schema.sql. SQL je v produkci kanonická
 * (počítá se triggerem při doplnění skóre), TS slouží pro testy a náhled v UI.
 */
export function calculatePoints(
  actualHome: number,
  actualAway: number,
  predHome: number,
  predAway: number
): 0 | 2 | 4 | 6 | 10 {
  // 10 b – přesný výsledek
  if (predHome === actualHome && predAway === actualAway) return 10;

  const actualTendency = Math.sign(actualHome - actualAway); // 1 / 0 / -1
  const predTendency = Math.sign(predHome - predAway);
  const tendencyCorrect = actualTendency === predTendency;

  if (tendencyCorrect) {
    // Nepřesně trefená remíza (přesnou už řeší 10 b výše)
    if (actualTendency === 0) return 6;

    const diffCorrect = predHome - predAway === actualHome - actualAway;
    const winnerGoalsCorrect =
      actualTendency === 1 ? predHome === actualHome : predAway === actualAway;

    if (diffCorrect || winnerGoalsCorrect) return 6;
    return 4; // jen vítěz
  }

  // Špatný vítěz – ale sedí přesný počet gólů jednoho týmu
  if (predHome === actualHome || predAway === actualAway) return 2;

  return 0;
}
