'use client';

import { useState } from 'react';
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
}: {
  rounds: TipovatRound[];
  players: Player[];
}) {
  const [playerId, setPlayerId] = useState<number | ''>('');

  if (rounds.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-slate-100/50">
        Žádné otevřené kolo — všechny zápasy už začaly. Mrkni na výsledky na úvodní stránce.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* jeden sdílený výběr hráče pro všechna kola */}
      <div className="panel sticky top-2 z-10 flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
        <label className="shrink-0 text-sm font-medium text-slate-100/70">🎯 Kdo tipuje?</label>
        <select
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value ? Number(e.target.value) : '')}
          className="w-full rounded-xl border border-terrain-600 bg-terrain-900 px-4 py-2.5 text-base text-white outline-none focus:border-pitch sm:max-w-xs"
        >
          <option value="">— vyber jméno —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className="text-xs text-slate-100/45 sm:ml-auto">
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
            onPlayerChange={setPlayerId}
            showSelector={false}
          />
        </section>
      ))}
    </div>
  );
}
