import { StatsCards } from '@/components/StatsCards';
import { SeasonXbTable } from '@/components/StandingsTable';
import { SeasonStats } from '@/components/SeasonStats';
import {
  getGoalStats,
  getMisses,
  getSeasonTipRounds,
  getSeasonXbProjection,
  getStoppageStats,
  getWizardAndContinentStats,
} from '@/lib/pageQueries';
import type { StandingRow } from '@/lib/types';
import { LEAGUE_REGIONS } from '@/lib/leagueRegions';

/**
 * Statistiky sezóny = nejtěžší dotazy na stránce (načítají VŠECHNY zápasy
 * i tipy sezóny). Jsou pod ohybem, takže je streamujeme zvlášť přes <Suspense>
 * — zápasy a tabulka se tak zobrazí okamžitě a nečeká se na tohle.
 */
export async function SeasonStatsSection({
  seasonId,
  standings,
  activeNames,
  showLeagueRegions = false,
}: {
  seasonId: number;
  standings: StandingRow[];
  activeNames: string[];
  showLeagueRegions?: boolean;
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
      <SeasonStats
        rounds={tipRounds}
        players={hasResults ? activeNames : []}
        stoppage={hasResults ? stoppage : []}
        wizard={hasResults ? wizCont.wizard : []}
        spodina={hasResults ? wizCont.spodina : []}
        misses={hasResults ? misses : []}
        continents={hasResults ? wizCont.continents : []}
        regions={showLeagueRegions ? (wizCont.regions.length ? wizCont.regions : LEAGUE_REGIONS.map((region) => ({ ...region, rows: [] }))) : []}
      />
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


/** Projekci konce sezony streamujeme samostatně, aby nezpomalovala první vykreslení zápasů. */
export async function SeasonXbSection({
  seasonId,
  currentPlayerId,
  compact = false,
}: {
  seasonId: number;
  currentPlayerId?: number;
  compact?: boolean;
}) {
  const rows = await getSeasonXbProjection(seasonId);
  return <SeasonXbTable rows={rows} currentPlayerId={currentPlayerId} compact={compact} />;
}

export function SeasonXbSkeleton() {
  return (
    <div className="panel-flush overflow-hidden">
      <div className="h-16 animate-pulse border-b border-line-subtle bg-surface-2/60" />
      <div className="space-y-2 p-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-xl bg-surface-2/55" />
        ))}
      </div>
    </div>
  );
}
