import {
  getActiveSeason,
  getCurrentRound,
  getSeasonRounds,
  getRoundMatches,
  getStandings,
  getPlayers,
  getSeasonChartData,
  getLiveMatches,
  getLivePointsByPlayer,
  getRoundLabels,
} from '@/lib/pageQueries';
import { getRoundPredictions } from '@/lib/queries';
import { RoundPanel } from '@/components/RoundPanel';
import { RoundSelector } from '@/components/RoundSelector';
import { roundLabel } from '@/lib/roundLabel';
import { CompetitionSwitcher } from '@/components/CompetitionSwitcher';
import { ComingSoonPanel } from '@/components/ComingSoonPanel';
import { getCompetition } from '@/lib/competitions';
import { StandingsTable } from '@/components/StandingsTable';
import { StandingsChart } from '@/components/StandingsChart';
import { Suspense } from 'react';
import { SeasonStatsSection, SeasonStatsSkeleton } from '@/components/SeasonStatsSection';
import { LiveRefresh } from '@/components/LiveRefresh';
import Link from 'next/link';
import { getSessionPlayer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ kolo?: string; soutez?: string }>;
}) {
  const sp = await searchParams;
  const competition = getCompetition(sp?.soutez);

  const season = competition.active ? await getActiveSeason(competition.key) : null;
  if (!season) {
    const players = await getPlayers();
    return (
      <main className="space-y-6">
        <CompetitionSwitcher current={competition.key} />
        <ComingSoonPanel competition={competition} players={players} />
      </main>
    );
  }

  const seasonId = season.id;
  const knockout = competition.kind === 'cup-knockout';
  const [rounds, currentRound, roundLabels] = await Promise.all([
    getSeasonRounds(seasonId),
    getCurrentRound(seasonId),
    getRoundLabels(seasonId),
  ]);

  const koloParam = sp?.kolo ? parseInt(sp.kolo, 10) : NaN;
  const selectedRound =
    !Number.isNaN(koloParam) && rounds.includes(koloParam) ? koloParam : currentRound;
  // Kritická cesta = jen to, co je vidět hned (zápasy, tabulka, graf).
  // Vše paralelně; dřív se 5 dotazů volalo za sebou a latence se sčítaly.
  const [matches, standings, players, chart, liveMatches, liveInc, sessionPlayer] =
    await Promise.all([
      selectedRound != null ? getRoundMatches(seasonId, selectedRound) : Promise.resolve([]),
      getStandings(seasonId),
      getPlayers(),
      getSeasonChartData(seasonId),
      getLiveMatches(seasonId),
      getLivePointsByPlayer(seasonId),
      getSessionPlayer(),
    ]);

  if (competition.key === 'evropa') {
    const sourceOrder = [
      'uefa.champions_qual', 'uefa.champions',
      'uefa.europa_qual', 'uefa.europa',
      'uefa.europa.conf_qual', 'uefa.europa.conf',
    ];
    const groupIndex = (source: string | null | undefined) => {
      const normalized = String(source ?? '').replace(/_qual$/, '');
      const first = sourceOrder.findIndex((item) => item.replace(/_qual$/, '') === normalized);
      return first < 0 ? 999 : first;
    };
    matches.sort((a, b) => {
      const sourceDiff = groupIndex(a.source_league) - groupIndex(b.source_league);
      return sourceDiff || new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
    });
  }

  // závisí na zápasech, proto až teď
  const predictions = await getRoundPredictions(matches.map((m) => m.id));

  const roundOpen = matches.some(
    (m) => m.status === 'scheduled' && new Date(m.kickoff).getTime() > Date.now()
  );
  const activeNames = players.map((p) => p.name);

  return (
    <main className="space-y-6">
      <CompetitionSwitcher current={competition.key} />
      <LiveRefresh hasLive={liveMatches.length > 0} />

      {/* hlavička přes celou šířku — horní hrany obou sloupců pak začínají ve stejné výšce */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-wide text-white sm:text-3xl">
          {selectedRound != null ? (roundLabels[selectedRound] ?? roundLabel(selectedRound, knockout)) : 'Aktuální kolo'}
          <span className="ml-2 hidden align-middle text-sm font-normal text-slate-300/50 sm:inline">
            {season.name}
          </span>
        </h1>
        {selectedRound != null && rounds.length > 0 && (
          <RoundSelector rounds={rounds} current={selectedRound} knockout={knockout} labels={roundLabels} />
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* ---------- LEVÝ SLOUPEC: ZÁPASY ---------- */}
        <div className="space-y-8 lg:col-span-2">
          <section className="space-y-3">
            {roundOpen && !sessionPlayer && (
              <p className="px-1 text-center text-[13px] text-slate-300/60">
                Pro tipování se <Link prefetch={false} href="/prihlaseni" className="font-semibold text-pitch-light underline-offset-2 hover:underline">přihlas</Link>.
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
                groupBySource={competition.key === 'evropa'}
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
        </aside>
      </div>

      {/* ---------- STATISTIKY SEZÓNY: pod zápasy, na celou šířku (desktop); na mobilu stejné pořadí ---------- */}
      <section className="mt-6 space-y-4 lg:mt-8">
        <h2 className="eyebrow">
          <span className="flag-chip" /> Statistiky sezóny
        </h2>
        <Suspense fallback={<SeasonStatsSkeleton />}>
          <SeasonStatsSection seasonId={seasonId} standings={standings} activeNames={activeNames} />
        </Suspense>
      </section>
    </main>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-100/50">{msg}</p>;
}
