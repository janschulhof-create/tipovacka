import {
  getActiveSeason,
  getCurrentChanceRound,
  getCurrentRound,
  getSeasonRounds,
  getRoundMatches,
  getStandings,
  getPlayers,
  getSeasonChartData,
  getPostponedMatches,
  getLiveMatches,
  getLivePointsByPlayer,
  getRoundLabels,
  getRoundPredictions,
} from '@/lib/pageQueries';
import { RoundPanel } from '@/components/RoundPanel';
import { POSTPONED_ROUND, POSTPONED_ROUND_LABEL, isTippingLocked } from '@/lib/postponed';
import { LigaDesktopBoard } from '@/components/LigaDesktopBoard';
import { RoundSelector } from '@/components/RoundSelector';
import { roundLabel } from '@/lib/roundLabel';
import { CompetitionSwitcher } from '@/components/CompetitionSwitcher';
import { ComingSoonPanel } from '@/components/ComingSoonPanel';
import { getDashboardCompetition } from '@/lib/competitions';
import { StandingsTable } from '@/components/StandingsTable';
import { StandingsChart } from '@/components/StandingsChart';
import { Suspense } from 'react';
import { SeasonStatsSection, SeasonStatsSkeleton, UnifiedStandingsSection, UnifiedStandingsSkeleton } from '@/components/SeasonStatsSection';
import { LiveRefresh } from '@/components/LiveRefresh';
import { RoundRecapSection, RoundRecapSkeleton } from '@/components/RoundRecapSection';
import Link from 'next/link';
import { getSessionPlayer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ kolo?: string; soutez?: string; zapas?: string }>;
}) {
  const sp = await searchParams;
  const competition = getDashboardCompetition(sp?.soutez);

  const season = competition.active ? await getActiveSeason(competition.key) : null;
  if (!season) {
    const players = await getPlayers();
    return (
      <main className={competition.key === 'liga' ? 'chance-page space-y-4' : 'space-y-6'}>
        <CompetitionSwitcher current={competition.key} />
        <ComingSoonPanel competition={competition} players={players} />
      </main>
    );
  }

  const seasonId = season.id;
  const knockout = competition.kind === 'cup-knockout';
  const [allRounds, currentRound, roundLabels] = await Promise.all([
    getSeasonRounds(seasonId),
    competition.key === 'liga' ? getCurrentChanceRound(seasonId) : getCurrentRound(seasonId),
    getRoundLabels(seasonId),
  ]);

  // Přípravné zápasy (kolo 0) zůstávají pouze v databázi jako technický archiv.
  // V Chance lize je nezobrazujeme ani nenabízíme v přepínači kol.
  const baseRounds = competition.key === 'liga'
    ? allRounds.filter((round) => round > 0)
    : allRounds;
  // Odložené zápasy potřebujeme znát dřív, než se rozhodne o výběru kola.
  // Dotaz je levný – vrací jen zápasy se stavem `postponed`.
  const postponedMatches = await getPostponedMatches(seasonId);

  // Pohled „Odložené zápasy“ se do výběru přidá jen tehdy, když nějaký
  // odložený zápas existuje. Body zůstávají v původních kolech.
  const rounds = postponedMatches.length > 0 ? [...baseRounds, POSTPONED_ROUND] : baseRounds;
  const roundLabelsWithPostponed = postponedMatches.length > 0
    ? { ...roundLabels, [POSTPONED_ROUND]: POSTPONED_ROUND_LABEL }
    : roundLabels;

  const fallbackRound = currentRound != null && rounds.includes(currentRound)
    ? currentRound
    : rounds[0] ?? null;
  const koloParam = sp?.kolo ? parseInt(sp.kolo, 10) : NaN;
  const zapasParam = sp?.zapas ? parseInt(sp.zapas, 10) : NaN;
  const selectedRound =
    !Number.isNaN(koloParam) && rounds.includes(koloParam) ? koloParam : fallbackRound;
  // Kritická cesta = jen to, co je vidět hned (zápasy, tabulka, graf).
  // Vše paralelně; dřív se 5 dotazů volalo za sebou a latence se sčítaly.
  const [matches, standings, players, chart, liveMatches, liveInc, sessionPlayer] =
    await Promise.all([
      selectedRound === POSTPONED_ROUND
        ? Promise.resolve(postponedMatches)
        : selectedRound != null
          ? getRoundMatches(seasonId, selectedRound)
          : Promise.resolve([]),
      getStandings(seasonId),
      getPlayers(),
      competition.key === 'liga' ? Promise.resolve({ matches: [], players: [] }) : getSeasonChartData(seasonId),
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
  const selectedRoundTitle = selectedRound != null
    ? (roundLabelsWithPostponed[selectedRound] ?? roundLabel(selectedRound, knockout))
    : 'Aktuální kolo';

  // Sdílené pravidlo – odložený zápas je otevřený do svého nového výkopu.
  const roundOpen = matches.some((m) => !isTippingLocked(m));
  const activeNames = players.map((p) => p.name);

  return (
    <main className={competition.key === 'liga' ? 'chance-page space-y-4' : 'space-y-6'}>
      <CompetitionSwitcher current={competition.key} />
      <LiveRefresh hasLive={liveMatches.length > 0} />

      {/* hlavička přes celou šířku — horní hrany obou sloupců pak začínají ve stejné výšce */}
      <header className={`flex items-center justify-between gap-3 ${competition.key === 'liga' ? 'min-[1200px]:hidden' : ''}`}>
        <h1 className="font-display text-2xl font-bold tracking-wide text-white sm:text-3xl">
          {selectedRound != null ? (roundLabelsWithPostponed[selectedRound] ?? roundLabel(selectedRound, knockout)) : 'Aktuální kolo'}
          <span className="ml-2 hidden align-middle text-sm font-normal text-slate-300/50 sm:inline">
            {season.name}
          </span>
        </h1>
        {selectedRound != null && rounds.length > 0 && (
          <RoundSelector rounds={rounds} current={selectedRound} knockout={knockout} labels={roundLabelsWithPostponed} />
        )}
      </header>

      {competition.key === 'liga' ? (
        <>
          {/* Chance liga: desktopové třísloupcové rozložení podle schváleného návrhu. */}
          <div className="chance-desktop-layout hidden min-w-0 items-start min-[1200px]:grid">
            <LigaDesktopBoard
              matches={matches}
              players={players}
              predictions={predictions}
              editable={!!sessionPlayer}
              playerId={sessionPlayer?.id ?? ''}
              roundTitle={selectedRoundTitle}
              seasonName={season.name}
              rounds={rounds}
              selectedRound={selectedRound ?? currentRound ?? rounds[0] ?? 0}
              knockout={knockout}
              roundLabels={roundLabelsWithPostponed}
              initialMatchId={!Number.isNaN(zapasParam) ? zapasParam : undefined}
            />

            <aside className="chance-right-rail min-w-0 space-y-3">
              <Suspense fallback={<UnifiedStandingsSkeleton />}>
                <UnifiedStandingsSection
                  seasonId={seasonId}
                  liveInc={liveInc}
                  hasLive={liveMatches.length > 0}
                  currentPlayerId={sessionPlayer?.id}
                  compact
                />
              </Suspense>
            </aside>
          </div>

          {/* Mobilní Chance liga zůstává funkčně i prostorově stejná. */}
          <div className="space-y-6 min-[1200px]:hidden">
            <section className="space-y-3">
              {roundOpen && !sessionPlayer && (
                <p className="px-1 text-center text-[13px] text-slate-300/60">
                  Pro tipování se <Link prefetch={false} href="/prihlaseni" className="font-semibold text-pitch-light underline-offset-2 hover:underline">přihlas</Link>.
                </p>
              )}
              {selectedRound === POSTPONED_ROUND && (
                <p className="rounded-lg border border-state-warning/30 bg-state-warning/5 px-3 py-2 text-[11.5px] leading-snug text-copy-muted">
                  Zápasy odložené na pozdější termín. Body se po dohrání připočtou
                  do <b className="text-copy-primary">původního kola</b>, takže se
                  jeho pořadí může zpětně změnit. Tipovat lze až do nového výkopu.
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
                  initialMatchId={!Number.isNaN(zapasParam) ? zapasParam : undefined}
                />
              ) : (
                <div className="panel"><Empty msg="Rozpis se načte po synchronizaci." /></div>
              )}
            </section>
            <Suspense fallback={<UnifiedStandingsSkeleton />}>
              <UnifiedStandingsSection
                seasonId={seasonId}
                liveInc={liveInc}
                hasLive={liveMatches.length > 0}
                currentPlayerId={sessionPlayer?.id}
              />
            </Suspense>
          </div>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
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
                  initialMatchId={!Number.isNaN(zapasParam) ? zapasParam : undefined}
                />
              ) : (
                <div className="panel"><Empty msg="Rozpis se načte po synchronizaci." /></div>
              )}
            </section>
          </div>
          <aside className="space-y-6">
            <StandingsTable rows={standings} liveInc={liveInc} hasLive={liveMatches.length > 0} />
            {chart.matches.length > 0 && (
              <section className="space-y-3">
                <h2 className="eyebrow"><span className="flag-chip" /> Vývoj bodů</h2>
                <StandingsChart matches={chart.matches} players={chart.players} />
              </section>
            )}
          </aside>
        </div>
      )}

      {competition.key === 'liga' && (
        <Suspense fallback={<RoundRecapSkeleton />}>
          <RoundRecapSection
            seasonId={seasonId}
            matches={matches}
            players={players}
            predictions={predictions}
            standings={standings}
            roundTitle={selectedRoundTitle}
            seasonName={season.name}
            includeStandingMovement={selectedRound === currentRound}
            selectedRound={selectedRound}
          />
        </Suspense>
      )}

      {/* ---------- STATISTIKY SEZÓNY: pod zápasy, na celou šířku (desktop); na mobilu stejné pořadí ---------- */}
      <section id="statistiky-sezony" className="mt-6 space-y-4 lg:mt-8">
        <h2 className="eyebrow">
          <span className="flag-chip" /> Statistiky sezóny
        </h2>
        <Suspense fallback={<SeasonStatsSkeleton />}>
          <SeasonStatsSection seasonId={seasonId} standings={standings} activeNames={activeNames} showLeagueRegions={competition.key === 'liga'} />
        </Suspense>
      </section>
    </main>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-100/50">{msg}</p>;
}
