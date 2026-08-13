'use client';

import { useEffect, useMemo, useState } from 'react';
import { isTippingLocked } from '@/lib/postponed';
import type { Match, Player, RoundPrediction } from '@/lib/types';
import { DesktopMatchDetail, RoundPanel } from '@/components/RoundPanel';
import { RoundSelector } from '@/components/RoundSelector';

/** Otevřený = jde na něj tipovat. Odložený zápas je otevřený do nového výkopu. */
function isOpen(match: Match, now: number) {
  return !isTippingLocked(match, now);
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
  initialMatchId,
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
  initialMatchId?: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Vždy zobrazujeme celé vybrané kolo. Jako výchozí detail preferujeme
  // nejbližší otevřený zápas, jinak první zápas v pořadí.
  const preferred = useMemo(
    () => matches.find((match) => match.id === initialMatchId) ?? matches.find((match) => isOpen(match, now)) ?? matches[0],
    [initialMatchId, matches, now],
  );
  const [selectedMatchId, setSelectedMatchId] = useState<number | undefined>(preferred?.id);

  useEffect(() => {
    if (!matches.some((match) => match.id === selectedMatchId)) {
      setSelectedMatchId(preferred?.id);
    }
  }, [matches, preferred?.id, selectedMatchId]);

  const selected = matches.find((match) => match.id === selectedMatchId) ?? preferred;
  const selectedName = players.find((player) => player.id === playerId)?.name;

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
          selectedMatchId={selected?.id}
          onMatchSelect={setSelectedMatchId}
        />
      </section>

      <div id="xb-predikce" className="xb-detail-container min-w-0 scroll-mt-4">
        {selected ? (
          <DesktopMatchDetail
            key={selected.id}
            match={selected}
            predictions={predictions}
            selectedName={selectedName}
          />
        ) : (
          <div className="panel px-6 py-16 text-center text-sm text-copy-muted">V tomto kole není žádný zápas.</div>
        )}
      </div>
    </div>
  );
}
