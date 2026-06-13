import {
  getActiveSeason,
  getCurrentRound,
  getPreviousRound,
  getSeasonRounds,
  getRoundMatches,
  getStandings,
  getGoalStats,
  getMisses,
  getPlayers,
  getRoundPredictions,
  getSeasonChartData,
  getSeasonTipRounds,
  getLiveMatches,
} from '@/lib/queries';
import { RoundPanel } from '@/components/RoundPanel';
import { RoundSelector } from '@/components/RoundSelector';
import { StandingsTable } from '@/components/StandingsTable';
import { StandingsChart } from '@/components/StandingsChart';
import { StatsCards } from '@/components/StatsCards';
import { SeasonStats } from '@/components/SeasonStats';
import { LiveBanner } from '@/components/LiveBanner';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ kolo?: string }>;
}) {
  const season = await getActiveSeason();
  if (!season) return <Empty msg="Není nastavená aktivní sezóna." />;
  const seasonId = season.id;

  const [rounds, currentRound] = await Promise.all([
    getSeasonRounds(seasonId),
    getCurrentRound(seasonId),
  ]);

  const sp = await searchParams;
  const koloParam = sp?.kolo ? parseInt(sp.kolo, 10) : NaN;
  const selectedRound =
    !Number.isNaN(koloParam) && rounds.includes(koloParam) ? koloParam : currentRound;
  const prevRound = selectedRound ? await getPreviousRound(seasonId, selectedRound) : null;

  const [matches, prevMatches, standings, goals, misses, players, chart] = await Promise.all([
    selectedRound ? getRoundMatches(seasonId, selectedRound) : Promise.resolve([]),
    prevRound ? getRoundMatches(seasonId, prevRound) : Promise.resolve([]),
    getStandings(seasonId),
    getGoalStats(seasonId),
    getMisses(seasonId),
    getPlayers(),
    getSeasonChartData(seasonId),
  ]);

  const tipRounds = await getSeasonTipRounds(seasonId);
  const liveMatches = await getLiveMatches(seasonId);
  const activeNames = players.map((p) => p.name);
  const hasResults = tipRounds.some((r) => r.matches.some((m) => m.hs != null));

  const [predictions, prevPredictions] = await Promise.all([
    getRoundPredictions(matches.map((m) => m.id)),
    getRoundPredictions(prevMatches.map((m) => m.id)),
  ]);

  return (
    <main className="space-y-6">
      <LiveBanner matches={liveMatches} />

      {/* hlavička přes celou šířku — horní hrany obou sloupců pak začínají ve stejné výšce */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-wide text-white sm:text-3xl">
          {selectedRound ? `${selectedRound}. kolo` : 'Aktuální kolo'}
          <span className="ml-2 hidden align-middle text-sm font-normal text-slate-300/50 sm:inline">
            {season.name}
          </span>
        </h1>
        {selectedRound != null && rounds.length > 0 && (
          <RoundSelector rounds={rounds} current={selectedRound} />
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* ---------- LEVÝ SLOUPEC: ZÁPASY ---------- */}
        <div className="space-y-8 lg:col-span-2">
          <section className="space-y-3">
            {matches.length ? (
              <RoundPanel
                matches={matches}
                players={players}
                predictions={predictions}
                editable={selectedRound === currentRound}
              />
            ) : (
              <div className="panel">
                <Empty msg="Rozpis se načte po synchronizaci." />
              </div>
            )}
          </section>

          {prevMatches.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold tracking-wide text-slate-100/80">
                {prevRound}. kolo{' '}
                <span className="text-sm font-normal text-slate-300/40">— výsledky</span>
              </h2>
              <RoundPanel matches={prevMatches} players={players} predictions={prevPredictions} />
            </section>
          )}
        </div>

        {/* ---------- PRAVÝ SLOUPEC: POŘADÍ / GRAF / STATISTIKY ---------- */}
        <aside className="space-y-6">
          <section className="space-y-3">
            <h2 className="eyebrow">
              <span className="flag-chip" /> Průběžné pořadí
            </h2>
            <div className="panel-flush">
              <StandingsTable rows={standings} />
            </div>
          </section>

          {chart.rounds.length > 0 && (
            <section className="space-y-3">
              <h2 className="eyebrow">
                <span className="flag-chip" /> Vývoj bodů
              </h2>
              <StandingsChart rounds={chart.rounds} players={chart.players} />
            </section>
          )}

          <section className="space-y-4">
            <h2 className="eyebrow">
              <span className="flag-chip" /> Statistiky sezóny
            </h2>
            <StatsCards standings={standings} goals={goals} misses={misses} />
            {hasResults && <SeasonStats rounds={tipRounds} players={activeNames} />}
          </section>
        </aside>
      </div>
    </main>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-100/50">{msg}</p>;
}
