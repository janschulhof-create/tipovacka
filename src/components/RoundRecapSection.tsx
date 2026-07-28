import type { Match, Player, RoundPrediction, StandingRow } from '@/lib/types';
import { buildRoundRecapFacts } from '@/lib/roundRecap';
import { getRoundRecapText } from '@/lib/roundRecapAI';

export async function RoundRecapSection({
  matches,
  players,
  predictions,
  standings,
  roundTitle,
  seasonName,
  includeStandingMovement = true,
}: {
  matches: Match[];
  players: Player[];
  predictions: RoundPrediction[];
  standings: StandingRow[];
  roundTitle: string;
  seasonName: string;
  includeStandingMovement?: boolean;
}) {
  const facts = buildRoundRecapFacts({ matches, players, predictions, standings, roundTitle, seasonName, includeStandingMovement });
  const recap = await getRoundRecapText(facts);
  const progress = facts.totalMatches > 0
    ? Math.round((facts.completedMatches / facts.totalMatches) * 100)
    : 0;
  const stateLabel = facts.mode === 'final'
    ? 'Finální hodnocení kola'
    : facts.mode === 'progress'
      ? 'Průběžné hodnocení kola'
      : 'Čekáme na první dohraný zápas';

  return (
    <section id="dohrano" className="mt-6 space-y-3 lg:mt-8">
      <h2 className="eyebrow"><span className="flag-chip" /> Dohráno</h2>
      <article className="panel-premium overflow-hidden">
        <div className="border-b border-line-subtle bg-app-deep/35 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-300">Baroko celého kola</div>
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
          <p className="whitespace-pre-line text-[13px] leading-7 text-copy-secondary sm:text-[14px]">
            {recap.text}
          </p>

          {facts.mode !== 'waiting' && (
            <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold">
              {facts.leader && (
                <span className="rounded-full border border-state-success/20 bg-state-success/10 px-2.5 py-1 text-state-success">
                  lídr kola: {facts.leader.name} · {facts.leader.points} b
                </span>
              )}
              <span className="rounded-full border border-line-subtle bg-surface-2 px-2.5 py-1 text-copy-secondary">
                přesné desítky: {facts.totalExactHits}
              </span>
              <span className="rounded-full border border-line-subtle bg-surface-2 px-2.5 py-1 text-copy-secondary">
                nuly: {facts.totalZeros}
              </span>
              {facts.biggestRise && (
                <span className="rounded-full border border-line-subtle bg-surface-2 px-2.5 py-1 text-copy-secondary">
                  skokan: {facts.biggestRise.name} +{facts.biggestRise.places}
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
              AI Baroko se právě nepodařilo načíst; zobrazené hodnocení je bezpečný faktický fallback z aktuálních výsledků.
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
      <h2 className="eyebrow"><span className="flag-chip" /> Dohráno</h2>
      <div className="panel-premium overflow-hidden">
        <div className="h-24 animate-pulse border-b border-line-subtle bg-surface-2/60" />
        <div className="space-y-3 p-5">
          <div className="h-4 w-full animate-pulse rounded bg-surface-2/60" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-surface-2/60" />
          <div className="h-4 w-8/12 animate-pulse rounded bg-surface-2/60" />
        </div>
      </div>
    </section>
  );
}
