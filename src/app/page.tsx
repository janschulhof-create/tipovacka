import {
  getActiveSeason,
  getCurrentRound,
  getSeasonRounds,
  getRoundMatches,
  getStandings,
  getGoalStats,
  getMisses,
  getPlayers,
  getRoundPredictions,
  getSeasonChartData,
  getStoppageStats,
  getSeasonTipRounds,
  getLiveMatches,
  getLivePointsByPlayer,
} from '@/lib/queries';
import { RoundPanel } from '@/components/RoundPanel';
import { RoundSelector } from '@/components/RoundSelector';
import { StandingsTable } from '@/components/StandingsTable';
import { StandingsChart } from '@/components/StandingsChart';
import { StatsCards } from '@/components/StatsCards';
import { SeasonStats } from '@/components/SeasonStats';
import { LiveBanner } from '@/components/LiveBanner';
import Link from 'next/link';
import { getSessionPlayer } from '@/lib/auth';

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
  const [matches, standings, goals, misses, players, chart, stoppage] = await Promise.all([
    selectedRound ? getRoundMatches(seasonId, selectedRound) : Promise.resolve([]),
    getStandings(seasonId),
    getGoalStats(seasonId),
    getMisses(seasonId),
    getPlayers(),
    getSeasonChartData(seasonId),
    getStoppageStats(seasonId),
  ]);

  const tipRounds = await getSeasonTipRounds(seasonId);
  const liveMatches = await getLiveMatches(seasonId);
  const liveInc = await getLivePointsByPlayer(seasonId);
  const sessionPlayer = await getSessionPlayer();
  const roundOpen = matches.some(
    (m) => m.status === 'scheduled' && new Date(m.kickoff).getTime() > Date.now()
  );
  const activeNames = players.map((p) => p.name);
  const hasResults = tipRounds.some((r) => r.matches.some((m) => m.hs != null));

  const predictions = await getRoundPredictions(matches.map((m) => m.id));

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
            {roundOpen && !sessionPlayer && (
              <p className="px-1 text-center text-[13px] text-slate-300/60">
                Pro tipování se <Link href="/prihlaseni" className="font-semibold text-pitch-light underline-offset-2 hover:underline">přihlas</Link>.
              </p>
            )}
            {matches.length ? (
              <RoundPanel
                matches={matches}
                players={players}
                predictions={predictions}
                editable={!!sessionPlayer}
                playerId={sessionPlayer?.id ?? ''}
                showSelector={false}
              />
            ) : (
              <div className="panel">
                <Empty msg="Rozpis se načte po synchronizaci." />
              </div>
            )}
          </section>
        </div>

        {/* ---------- PRAVÝ SLOUPEC: POŘADÍ / GRAF / STATISTIKY ---------- */}
        <aside className="space-y-6">
          <section>
            <StandingsTable rows={standings} liveInc={liveInc} hasLive={liveMatches.length > 0} />
          </section>

          {chart.matches.length > 0 && (
            <section className="space-y-3">
              <h2 className="eyebrow">
                <span className="flag-chip" /> Vývoj bodů
              </h2>
              <StandingsChart matches={chart.matches} players={chart.players} />
            </section>
          )}

          <section className="space-y-4">
            <h2 className="eyebrow">
              <span className="flag-chip" /> Statistiky sezóny
            </h2>
            <StatsCards standings={standings} goals={goals} misses={misses} />
            {hasResults && <SeasonStats rounds={tipRounds} players={activeNames} stoppage={stoppage} />}
          </section>
        </aside>
      </div>
    </main>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-100/50">{msg}</p>;
}
