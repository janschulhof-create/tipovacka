'use client';

import { RoundPanel } from './RoundPanel';
import type { Match, Player, RoundPrediction } from '@/lib/types';

export type TipovatRound = {
  round: number;
  matches: Match[];
  predictions: RoundPrediction[];
};

export function TipovatRounds({
  rounds,
  players,
  playerId,
  playerName,
}: {
  rounds: TipovatRound[];
  players: Player[];
  playerId: number;
  playerName: string;
}) {
  if (rounds.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-slate-100/50">
        Žádné otevřené kolo — všechny zápasy už začaly. Mrkni na výsledky na úvodní stránce.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="panel sticky top-2 z-10 flex items-center gap-2 p-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pitch/15 text-pitch-light">🎯</span>
        <div className="leading-tight">
          <div className="text-[11px] uppercase tracking-wider text-slate-300/50">Tipuješ jako</div>
          <div className="font-display text-base font-semibold text-white">{playerName}</div>
        </div>
        <span className="ml-auto text-xs text-slate-100/45">
          {rounds.length} {rounds.length === 1 ? 'otevřené kolo' : 'otevřených kol'}
        </span>
      </div>

      {rounds.map((r) => (
        <section key={r.round} className="space-y-2">
          <h2 className="font-display text-lg font-semibold tracking-wide text-white">
            {r.round}. kolo
          </h2>
          <RoundPanel
            matches={r.matches}
            players={players}
            predictions={r.predictions}
            editable
            playerId={playerId}
            showSelector={false}
          />
        </section>
      ))}
    </div>
  );
}
