'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Match, Player, RoundPrediction } from '@/lib/types';
import { DesktopMatchDetail, RoundPanel } from '@/components/RoundPanel';

export function LigaDesktopBoard({
  matches,
  players,
  predictions,
  editable,
  playerId,
}: {
  matches: Match[];
  players: Player[];
  predictions: RoundPrediction[];
  editable: boolean;
  playerId: number | '';
}) {
  const preferred = useMemo(
    () => matches.find((match) => match.status === 'scheduled' && Number(match.round) > 0) ?? matches[0],
    [matches],
  );
  const [selectedMatchId, setSelectedMatchId] = useState<number | undefined>(preferred?.id);

  useEffect(() => {
    if (!matches.some((match) => match.id === selectedMatchId)) setSelectedMatchId(preferred?.id);
  }, [matches, preferred?.id, selectedMatchId]);

  const selected = matches.find((match) => match.id === selectedMatchId) ?? preferred;
  const selectedName = players.find((player) => player.id === playerId)?.name;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(310px,.78fr)_minmax(520px,1.35fr)] items-start gap-4">
      <div className="min-w-0">
        <RoundPanel
          matches={matches}
          players={players}
          predictions={predictions}
          editable={editable}
          playerId={playerId}
          showSelector={false}
          desktopListOnly
          selectedMatchId={selected?.id}
          onMatchSelect={setSelectedMatchId}
        />
      </div>
      <div className="min-w-0 xl:sticky xl:top-20">
        {selected ? (
          <DesktopMatchDetail match={selected} predictions={predictions} selectedName={selectedName} />
        ) : (
          <div className="panel px-6 py-16 text-center text-sm text-copy-muted">Vyber zápas z rozpisu.</div>
        )}
      </div>
    </div>
  );
}
