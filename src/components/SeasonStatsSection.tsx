import { StatsCards } from '@/components/StatsCards';
import { SeasonStats } from '@/components/SeasonStats';
import {
  getGoalStats,
  getMisses,
  getSeasonTipRounds,
  getStoppageStats,
  getWizardAndContinentStats,
} from '@/lib/queries';
import type { StandingRow } from '@/lib/types';

/**
 * Statistiky sezóny = nejtěžší dotazy na stránce (načítají VŠECHNY zápasy
 * i tipy sezóny). Jsou pod ohybem, takže je streamujeme zvlášť přes <Suspense>
 * — zápasy a tabulka se tak zobrazí okamžitě a nečeká se na tohle.
 */
export async function SeasonStatsSection({
  seasonId,
  standings,
  activeNames,
}: {
  seasonId: number;
  standings: StandingRow[];
  activeNames: string[];
}) {
  const [goals, misses, stoppage, wizCont, tipRounds] = await Promise.all([
    getGoalStats(seasonId),
    getMisses(seasonId),
    getStoppageStats(seasonId),
    getWizardAndContinentStats(seasonId),
    getSeasonTipRounds(seasonId),
  ]);

  const hasResults = tipRounds.some((r) => r.matches.some((m) => m.hs != null));

  return (
    <>
      <StatsCards standings={standings} goals={goals} />
      {hasResults && (
        <SeasonStats
          rounds={tipRounds}
          players={activeNames}
          stoppage={stoppage}
          wizard={wizCont.wizard}
          spodina={wizCont.spodina}
          misses={misses}
          continents={wizCont.continents}
        />
      )}
    </>
  );
}

/** Kostra, kterou vidí uživatel, než statistiky dorazí. */
export function SeasonStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl border border-terrain-700 bg-terrain-900/40" />
      ))}
    </div>
  );
}
