import type { Match, Player, RoundPrediction, StandingRow } from '@/lib/types';
import historie from '@/data/historie.json';
import { getStoredRoundRecap, getSeasonXbProjection, getSeasonXbSnapshotAtRound } from '@/lib/pageQueries';
import {
  buildRoundRecapFacts,
  type RoundRecapPreviousSeasonStat,
} from '@/lib/roundRecap';
import { getRoundRecapText } from '@/lib/roundRecapAI';

function signed(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}

function previousSeasonStats(): RoundRecapPreviousSeasonStat[] {
  const stats = historie.stats as Record<string, {
    avgPoints?: number;
    bestRound?: number;
    roundWins?: number;
    zeros?: number;
  }>;
  return Object.entries(stats).map(([name, row]) => ({
    name,
    avgPoints: Number(row.avgPoints ?? 0),
    bestRound: Number(row.bestRound ?? 0),
    roundWins: Number(row.roundWins ?? 0),
    zeros: Number(row.zeros ?? 0),
  }));
}

export async function RoundRecapSection({
  seasonId,
  matches,
  players,
  predictions,
  standings,
  roundTitle,
  seasonName,
  includeStandingMovement = true,
  selectedRound,
}: {
  seasonId: number;
  matches: Match[];
  players: Player[];
  predictions: RoundPrediction[];
  standings: StandingRow[];
  roundTitle: string;
  seasonName: string;
  includeStandingMovement?: boolean;
  /** Kolo, které se právě zobrazuje. U staršího kola se načte historický snapshot. */
  selectedRound?: number;
}) {
  // xB se načítá VŽDY. U aktuálního kola plná projekce, u staršího historický
  // as-of snapshot. Dřív se řídilo `includeStandingMovement`, což starší kola
  // bezdůvodně připravilo o data.
  const xbRows = includeStandingMovement || selectedRound == null
    ? await getSeasonXbProjection(seasonId)
    : await getSeasonXbSnapshotAtRound(seasonId, selectedRound);
  const facts = buildRoundRecapFacts({
    matches,
    players,
    predictions,
    standings,
    roundTitle,
    seasonName,
    includeStandingMovement,
    previousSeasonName: historie.season,
    previousSeasonStats: previousSeasonStats(),
    xbSnapshots: xbRows.map((row) => ({
      name: row.name,
      actualPoints: row.actual_points,
      expectedXb: row.expected_actual_xb,
    })),
  });
  /**
   * Uložené hodnocení má přednost.
   *
   * Vzniklo automaticky po uzavřeném fotbalovém dni a je to nejnovější
   * ÚSPĚŠNÁ verze. Rozdělaná ani selhaná ji nikdy nezakryje — filtruje se
   * v dotazu. Když uložené není, zůstává dosavadní chování beze změny.
   */
  const ulozeny = selectedRound != null
    ? await getStoredRoundRecap(seasonId, 'liga', selectedRound)
    : null;

  const recap = ulozeny?.text
    ? { text: ulozeny.text, source: 'ai' as const }
    : await getRoundRecapText(facts);

  /** Nenápadný popisek dne, dokud kolo není dohrané. */
  const matchdayLabel = ulozeny && !ulozeny.round_complete && ulozeny.matchday_date
    ? `Po programu ${new Date(ulozeny.matchday_date).toLocaleDateString('cs-CZ', {
      day: 'numeric', month: 'numeric',
    })}`
    : null;
  const progress = facts.totalMatches > 0
    ? Math.round((facts.completedMatches / facts.totalMatches) * 100)
    : 0;
  const stateLabel = matchdayLabel ?? (facts.mode === 'final'
    ? 'Závěrečný verdikt kola'
    : facts.mode === 'progress'
      ? 'Průběžné studio kola'
      : 'Studio čeká na první dohraný zápas');

  const realityCheck = facts.xbOverperformer && facts.xbUnderperformer
    ? `${facts.xbOverperformer.name} ${signed(facts.xbOverperformer.delta)} proti xB · ${facts.xbUnderperformer.name} ${signed(facts.xbUnderperformer.delta)}`
    : facts.xbOverperformer
      ? `${facts.xbOverperformer.name} ${signed(facts.xbOverperformer.delta)} proti xB`
      : 'xB zatím bez vyhodnocených dat';

  const lastSeasonCheck = facts.previousBestBeaten
    ? `${facts.previousBestBeaten.name}: ${facts.previousBestBeaten.points} b · loni max ${facts.previousBestBeaten.previousBest}`
    : facts.bestVsLastSeason
      ? `${facts.bestVsLastSeason.name}: Ø ${facts.bestVsLastSeason.roundAverage.toFixed(1)} · loni Ø ${facts.bestVsLastSeason.previousAverage.toFixed(1)}`
      : `Historie ${facts.previousSeasonName ?? 'minulé sezony'} zatím bez přímého srovnání`;

  const drama = facts.cinemaCandidate
    ? `${facts.cinemaCandidate.match} ${facts.cinemaCandidate.score}`
    : facts.consensusShock
      ? `${facts.consensusShock.match} ${facts.consensusShock.score}`
      : facts.mostMissedMatch
        ? `${facts.mostMissedMatch.label} · ${facts.mostMissedMatch.count} nul`
        : 'Zatím bez jasného dramatu kola';

  const verdict = facts.blamageCandidate
    ? `${facts.blamageCandidate.label} · ${facts.blamageCandidate.detail}`
    : facts.snowman
      ? `${facts.snowman.name} · ${facts.snowman.points} b · ${facts.snowman.zeros} nul`
      : facts.dominantLeader
        ? `${facts.dominantLeader.name} vede o ${facts.dominantLeader.gap} bodů`
        : 'Komise zatím bez mimořádného nálezu';

  return (
    <section id="kudy-bezi-zajic" className="mt-6 space-y-3 lg:mt-8">
      <h2 className="eyebrow"><span className="flag-chip" /> Kudy běží zajíc</h2>
      <article className="panel-premium overflow-hidden">
        <div className="border-b border-line-subtle bg-app-deep/35 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-300">Velké hodnocení kola</div>
              <h3 className="mt-1 font-display text-xl font-bold text-copy-primary sm:text-2xl">{roundTitle}</h3>
              <p className="mt-1 text-[11px] text-copy-muted">{seasonName} · {stateLabel}</p>
            </div>
            <div className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-[10px] font-semibold text-violet-200">
              {facts.completedMatches}/{facts.totalMatches} dohráno
            </div>
          </div>
          {facts.totalMatches > 0 && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-label={`Dohráno ${progress} % kola`}>
              <div className="h-full rounded-full bg-violet-400/80 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-line-subtle bg-surface-2/55 px-3 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-violet-300">Kdo utíká se zajícem</div>
              <div className="mt-1 text-[12px] font-semibold leading-snug text-copy-primary">
                {facts.leader ? `${facts.leader.name} · ${facts.leader.points} b` : 'Pořadí se teprve kreslí'}
              </div>
              {facts.dominantLeader && <div className="mt-1 text-[9px] text-copy-muted">náskok {facts.dominantLeader.gap} b · to se nebavíme</div>}
            </div>

            <div className="rounded-xl border border-line-subtle bg-surface-2/55 px-3 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-state-success">
                xB reality check{!includeStandingMovement && selectedRound != null ? ` po ${selectedRound}. kole` : ''}
              </div>
              <div className="mt-1 text-[11px] font-semibold leading-snug text-copy-primary">{realityCheck}</div>
              <div className="mt-1 text-[9px] text-copy-muted">
                {!includeStandingMovement && selectedRound != null
                  ? 'skutečné body vs xBody podle dat dostupných do konce kola'
                  : 'skutečné sezonní body vs očekávané xBody'}
              </div>
            </div>

            <div className="rounded-xl border border-line-subtle bg-surface-2/55 px-3 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-state-info">Loni vs. dnes</div>
              <div className="mt-1 text-[11px] font-semibold leading-snug text-copy-primary">{lastSeasonCheck}</div>
              <div className="mt-1 text-[9px] text-copy-muted">srovnání s archivem {facts.previousSeasonName ?? 'minulé sezony'}</div>
            </div>

            <div className="rounded-xl border border-line-subtle bg-surface-2/55 px-3 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-state-warning">Cinema / blamáž</div>
              <div className="mt-1 text-[11px] font-semibold leading-snug text-copy-primary">{drama}</div>
              <div className="mt-1 text-[9px] leading-snug text-copy-muted">{verdict}</div>
            </div>
          </div>

          <p className="whitespace-pre-line text-[13.5px] leading-7 text-copy-secondary sm:text-[14.5px] sm:leading-7">
            {recap.text}
          </p>

          {facts.mode !== 'waiting' && (
            <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold">
              {facts.totalExactHits > 0 && (
                <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-violet-200">
                  přesné desítky: {facts.totalExactHits}
                </span>
              )}
              <span className="rounded-full border border-line-subtle bg-surface-2 px-2.5 py-1 text-copy-secondary">
                nuly: {facts.totalZeros}
              </span>
              {facts.snowman && (
                <span className="rounded-full border border-state-danger/20 bg-state-danger/10 px-2.5 py-1 text-state-danger">
                  sněhulák: {facts.snowman.name}
                </span>
              )}
              {facts.biggestRise && (
                <span className="rounded-full border border-line-subtle bg-surface-2 px-2.5 py-1 text-copy-secondary">
                  skokan: {facts.biggestRise.name} +{facts.biggestRise.places}
                </span>
              )}
              {facts.divizeCandidate && (
                <span className="rounded-full border border-state-warning/25 bg-state-warning/10 px-2.5 py-1 text-state-warning">
                  divize: {facts.divizeCandidate.team}
                </span>
              )}
              {facts.lastMatchSwing && (
                <span className="rounded-full border border-line-subtle bg-surface-2 px-2.5 py-1 text-copy-secondary">
                  rozhodovačka: {facts.lastMatchSwing.match}
                </span>
              )}
              {facts.remainingMatches > 0 && (
                <span className="rounded-full border border-line-subtle bg-surface-2 px-2.5 py-1 text-copy-secondary">
                  zbývá: {facts.remainingMatches}
                </span>
              )}
            </div>
          )}

          {recap.source === 'fallback' && facts.mode !== 'waiting' && (
            <p className="mt-3 text-[9px] leading-relaxed text-copy-muted">
              Claude studio se právě nepodařilo načíst; zobrazený verdikt je bezpečný faktický fallback z výsledků, xB a historických dat.
            </p>
          )}
        </div>
      </article>
    </section>
  );
}

export function RoundRecapSkeleton() {
  return (
    <section className="mt-6 space-y-3 lg:mt-8" aria-hidden="true">
      <h2 className="eyebrow"><span className="flag-chip" /> Kudy běží zajíc</h2>
      <div className="panel-premium overflow-hidden">
        <div className="h-24 animate-pulse border-b border-line-subtle bg-surface-2/60" />
        <div className="space-y-3 p-5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="h-20 animate-pulse rounded-xl bg-surface-2/60" />
            <div className="h-20 animate-pulse rounded-xl bg-surface-2/60" />
            <div className="h-20 animate-pulse rounded-xl bg-surface-2/60" />
            <div className="h-20 animate-pulse rounded-xl bg-surface-2/60" />
          </div>
          <div className="h-4 w-full animate-pulse rounded bg-surface-2/60" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-surface-2/60" />
          <div className="h-4 w-8/12 animate-pulse rounded bg-surface-2/60" />
        </div>
      </div>
    </section>
  );
}
