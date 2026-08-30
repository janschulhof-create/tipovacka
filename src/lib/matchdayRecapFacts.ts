import { buildRoundRecapFacts, type RoundRecapFacts } from './roundRecap';
import { footballDayKey } from './matchday';
// ZÁMĚRNĚ ne `pageQueries`: ty jsou obalené `unstable_cache` a
// synchronizace invaliduje cache až PO generování. Autoritativní cesta
// by tak mohla vidět stav před vlastním zápisem.
import { getSeasonXbProjection as readSeasonXbProjection } from './queries';
import type { createAdminClient } from './supabase/server';

/**
 * Sestaví fakta pro automatické hodnocení uzavřeného dne.
 *
 * Používá TOTÉŽ `buildRoundRecapFacts` jako zobrazení na stránce, takže
 * deterministická eligibilita hlášek z fáze A platí beze změny.
 *
 * Navíc předává rozlišení `dayClosed` / `roundComplete`, aby model netvrdil,
 * že je kolo za námi, když čeká odložený zápas.
 */
export interface MatchdayFactsInput {
  seasonId: number;
  round: number;
  footballDay: string;
  roundComplete: boolean;
  completedMatchCount: number;
  activeRemainingMatchCount: number;
  postponedMatchCount: number;
  totalUnplayedMatchCount: number;
}

export async function buildMatchdayRecapFacts(
  admin: ReturnType<typeof createAdminClient>,
  input: MatchdayFactsInput,
): Promise<RoundRecapFacts | null> {
  const { data: matchRows } = await admin
    .from('matches')
    .select('*')
    .eq('season_id', input.seasonId)
    .eq('round', input.round)
    .order('kickoff', { ascending: true });

  const vsechny = matchRows ?? [];
  if (vsechny.length === 0) return null;

  /**
   * ŘEZ K FOTBALOVÉMU DNI.
   *
   * Bez něj by opakovaný pokus o sobotní hodnocení (po tom, co v neděli
   * selhalo) obsahoval i nedělní výsledky — sobotní verze by se změnila
   * zpětně. Model proto vidí jen zápasy dohrané do konce daného dne.
   *
   * Zápasy pozdějších dnů se z faktů vypouštějí, ale jejich existence se
   * promítá do počtů v `matchdayContext`, protože určuje `roundComplete`.
   */
  const matches = vsechny.filter((m: { kickoff: string; status: string }) => {
    const den = footballDayKey(m.kickoff);
    if (den == null) return false;
    if (den <= input.footballDay) return true;
    // Pozdější zápas se do faktů dostane jen tehdy, když ještě není dohraný
    // (drží kolo otevřené), a to bez výsledku.
    return m.status !== 'finished';
  }).map((m: Record<string, unknown>) => {
    const den = footballDayKey(String(m.kickoff));
    if (den != null && den > input.footballDay) {
      // Budoucí zápas nesmí nést výsledek ani vyhodnocené tipy.
      // Zrušený ale zůstává zrušený – překlopení na `scheduled` by
      // nafouklo počet zápasů a rozešlo fakta závislá na dohrání.
      const status = m.status === 'cancelled' ? 'cancelled' : 'scheduled';
      return { ...m, home_score: null, away_score: null, status };
    }
    return m;
  });

  const [{ data: players }, { data: predictions }, { data: season }] =
    await Promise.all([
      // ORDER BY je nutné: bez něj Postgres pořadí řádků negarantuje
      // a otisk faktů by se mezi běhy lišil, i když se nic nezměnilo.
      admin.from('players').select('*').eq('is_active', true).order('id', { ascending: true }),
      admin.from('predictions')
        .select('match_id, points, predicted_home, predicted_away, players(name)')
        .in('match_id', matches.map((m) => Number(m.id))),
      admin.from('seasons').select('name').eq('id', input.seasonId).maybeSingle(),
    ]);

  // Kumulativní hodnocení kola: xB k závěru tohoto kola, ne k dnešku.
  const xbRows = await readSeasonXbProjection(input.seasonId, {
    throughRound: input.round,
    throughFootballDay: input.footballDay,
  });

  /** Pořadí odvozené z xB řádků – ty už respektují mez fotbalového dne. */
  const standingsAtCutoff = xbRows.map((row) => ({
    name: row.name,
    points: row.actual_points,
  }));

  const facts = buildRoundRecapFacts({
    matches,
    players: players ?? [],
    predictions: (predictions ?? []).map((p: Record<string, unknown>) => ({
      ...p,
      name: Array.isArray(p.players)
        ? (p.players[0] as { name?: string } | undefined)?.name
        : (p.players as { name?: string } | null)?.name,
    })),
    // Pořadí k MEZI DNE, ne dnešní. `v_standings` vrací dnešní stav, takže
    // by dohraný odložený zápas 6. kola bral pořadí z 10. kola.
    // Řádky xB už mez respektují a nesou `actual_points`.
    standings: standingsAtCutoff,
    roundTitle: `${input.round}. kolo`,
    seasonName: (season as { name?: string } | null)?.name ?? '',
    previousSeasonName: null,
    previousSeasonStats: [],
    // Pohyb v celkovém pořadí dává smysl jen u dohraného kola.
    /**
     * DOČASNĚ VYPNUTO pro automatická hodnocení (v0.1.80).
     *
     * Stávající výpočet pohybu odečítá body hodnoceného kola od aktuálního
     * pořadí. U běžného posledního kola to sedí, ale u starého odloženého
     * zápasu dohraného ve chvíli, kdy se hrají další kola, ne — vyšel by
     * vymyšlený vzestup nebo pád.
     *
     * `biggestRise = null` je lepší než nepravdivé číslo. Interaktivní
     * zobrazení se nemění; přesný historický pohyb přijde později.
     */
    includeStandingMovement: false,
    // xB podle stavu k tomuto kolu – znovupoužívá existující as-of snapshot,
    // takže do staršího hodnocení nikdy neproteče budoucí xB.
    xbSnapshots: xbRows.map((row) => ({
      name: row.name,
      actualPoints: row.actual_points,
      expectedXb: row.expected_actual_xb,
    })),
  } as unknown as Parameters<typeof buildRoundRecapFacts>[0]);

  return {
    ...facts,
    matchdayContext: {
      footballDay: input.footballDay,
      dayClosed: true,
      roundComplete: input.roundComplete,
      activeRemainingMatchCount: input.activeRemainingMatchCount,
      postponedMatchCount: input.postponedMatchCount,
    },
    // `final` jen při skutečně dohraném kole. Uzavřený den sám o sobě
    // neznamená, že je kolo za námi — na to čeká odložený zápas.
    mode: input.roundComplete ? 'final' : 'progress',
    completedMatches: input.completedMatchCount,
    remainingMatches: input.totalUnplayedMatchCount,
  } as RoundRecapFacts;
}
