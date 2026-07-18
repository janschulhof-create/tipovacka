'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Match, Player, RoundPrediction } from '@/lib/types';
import { DesktopMatchDetail, RoundPanel } from '@/components/RoundPanel';
import { RoundSelector } from '@/components/RoundSelector';

 type MatchFilter = 'all' | 'open' | 'closed';

function isOpen(match: Match, now: number) {
  return match.status === 'scheduled' && new Date(match.kickoff).getTime() > now;
}

export function LigaDesktopBoard({
  matches,
  players,
  predictions,
  editable,
  playerId,
  roundTitle,
  seasonName,
  rounds,
  selectedRound,
  knockout,
  roundLabels,
}: {
  matches: Match[];
  players: Player[];
  predictions: RoundPrediction[];
  editable: boolean;
  playerId: number | '';
  roundTitle: string;
  seasonName: string;
  rounds: number[];
  selectedRound: number;
  knockout: boolean;
  roundLabels: Record<number, string>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<MatchFilter>('all');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const openIds = useMemo(
    () => new Set(matches.filter((match) => isOpen(match, now)).map((match) => match.id)),
    [matches, now],
  );
  const closedIds = useMemo(
    () => new Set(matches.filter((match) => !openIds.has(match.id)).map((match) => match.id)),
    [matches, openIds],
  );

  const visibleMatchIds = useMemo(() => {
    if (filter === 'open') return matches.filter((match) => openIds.has(match.id)).map((match) => match.id);
    if (filter === 'closed') return matches.filter((match) => closedIds.has(match.id)).map((match) => match.id);
    return matches.map((match) => match.id);
  }, [filter, matches, openIds, closedIds]);

  const visibleSet = useMemo(() => new Set(visibleMatchIds), [visibleMatchIds]);
  const preferred = useMemo(
    () =>
      matches.find((match) => visibleSet.has(match.id) && isOpen(match, now))
      ?? matches.find((match) => visibleSet.has(match.id))
      ?? matches.find((match) => isOpen(match, now))
      ?? matches[0],
    [matches, now, visibleSet],
  );
  const [selectedMatchId, setSelectedMatchId] = useState<number | undefined>(preferred?.id);

  useEffect(() => {
    if (!matches.some((match) => match.id === selectedMatchId && visibleSet.has(match.id))) {
      setSelectedMatchId(preferred?.id);
    }
  }, [matches, preferred?.id, selectedMatchId, visibleSet]);

  const selected = matches.find((match) => match.id === selectedMatchId) ?? preferred;
  const selectedName = players.find((player) => player.id === playerId)?.name;

  const filters: { id: MatchFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Všechny', count: matches.length },
    { id: 'open', label: 'Otevřené', count: openIds.size },
    { id: 'closed', label: 'Uzavřené', count: closedIds.size },
  ];

  return (
    <div className="chance-board-grid min-w-0">
      <section className="desktop-match-list panel-flush min-w-0 overflow-hidden">
        <header className="border-b border-line-subtle bg-app-deep/30 px-3.5 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate font-display text-[19px] font-bold tracking-wide text-copy-primary">
                {roundTitle}
              </h1>
              <p className="mt-0.5 truncate text-[11px] text-copy-muted">{seasonName}</p>
            </div>
            <RoundSelector
              rounds={rounds}
              current={selectedRound}
              knockout={knockout}
              labels={roundLabels}
              compact
            />
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            {filters.map((item) => {
              const active = item.id === filter;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-semibold transition ${
                    active
                      ? 'border-violet-400/35 bg-violet-500/15 text-violet-100 shadow-[0_8px_20px_-15px_rgba(164,106,247,.9)]'
                      : 'border-line-subtle bg-surface-1/70 text-copy-muted hover:border-line-strong hover:text-copy-primary'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[9px] tabular-nums ${active ? 'bg-violet-400/20 text-violet-200' : 'bg-surface-3 text-copy-muted'}`}>
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        </header>

        <RoundPanel
          matches={matches}
          players={players}
          predictions={predictions}
          editable={editable}
          playerId={playerId}
          showSelector={false}
          desktopListOnly
          embedded
          visibleMatchIds={visibleMatchIds}
          selectedMatchId={selected?.id}
          onMatchSelect={setSelectedMatchId}
        />
      </section>

      <div className="xb-detail-container min-w-0 xl:sticky xl:top-[74px]">
        {selected ? (
          <DesktopMatchDetail
            key={selected.id}
            match={selected}
            predictions={predictions}
            selectedName={selectedName}
          />
        ) : (
          <div className="panel px-6 py-16 text-center text-sm text-copy-muted">V tomto filtru není žádný zápas.</div>
        )}
      </div>
    </div>
  );
}
