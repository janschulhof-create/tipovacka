import historie from '@/data/historie.json';
import type { RoundRecapPreviousSeasonStat } from './roundRecap';

/**
 * Statistiky minulé sezony pro hodnocení kola.
 *
 * ── PROČ SDÍLENÝ MODUL ──────────────────────────────────────────────────────
 * Interaktivní zobrazení tuhle mapu mělo, automatické generování ne — takže
 * uložené hodnocení přišlo o fakta `bestVsLastSeason`, `worstVsLastSeason`
 * a `previousBestBeaten` i o hlášky, které se o ně opírají.
 *
 * Jediná implementace pro obě cesty, aby se nemohly rozejít.
 */

/** Název minulé sezony, jak ho zná `historie.json`. */
export const PREVIOUS_SEASON_NAME: string = historie.season;

/**
 * Deterministické pořadí: řadí se podle jména, takže stejná data dají
 * stejné pole — a tedy i stejný otisk faktů.
 */
export function previousSeasonStats(): RoundRecapPreviousSeasonStat[] {
  const stats = historie.stats as Record<string, {
    avgPoints?: number;
    bestRound?: number;
    roundWins?: number;
    zeros?: number;
  }>;

  return Object.entries(stats)
    .map(([name, row]) => ({
      name,
      avgPoints: Number(row.avgPoints ?? 0),
      bestRound: Number(row.bestRound ?? 0),
      roundWins: Number(row.roundWins ?? 0),
      zeros: Number(row.zeros ?? 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
}
