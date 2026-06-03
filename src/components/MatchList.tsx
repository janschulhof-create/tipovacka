'use client';

import { useState } from 'react';
import type { Match, Player, RoundPrediction } from '@/lib/types';
import { pointsTextClass } from '@/lib/points';

function fmt(iso: string) {
  return new Date(iso).toLocaleString('cs-CZ', {
    weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function MatchList({
  matches,
  players,
  predictions,
}: {
  matches: Match[];
  players: Player[];
  predictions: RoundPrediction[];
}) {
  return (
    <ul className="divide-y divide-line">
      {matches.map((m) => (
        <MatchRow
          key={m.id}
          match={m}
          players={players}
          preds={predictions.filter((p) => p.match_id === m.id)}
        />
      ))}
    </ul>
  );
}

function MatchRow({
  match: m,
  players,
  preds,
}: {
  match: Match;
  players: Player[];
  preds: RoundPrediction[];
}) {
  const [open, setOpen] = useState(false);
  const done = m.status === 'finished';
  const live = m.status === 'live';
  // tipy se odhalí až po výkopu (aby je nešlo opisovat)
  const revealed = m.status !== 'scheduled' || new Date(m.kickoff).getTime() <= Date.now();

  return (
    <li>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">
            <span className="font-medium">{m.home_team}</span>
            <span className="text-slate-500"> – </span>
            <span className="font-medium">{m.away_team}</span>
          </div>
          <div className="text-xs text-slate-400">{fmt(m.kickoff)}</div>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2 text-right">
          {done || live ? (
            <span className={`tabular-nums text-sm font-bold ${live ? 'text-brand' : ''}`}>
              {m.home_score ?? 0}:{m.away_score ?? 0}
            </span>
          ) : (
            <span className="text-xs text-slate-500">—</span>
          )}
          <span className="text-xs text-slate-500">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-line bg-ink/40 px-4 py-3">
          {!revealed ? (
            <p className="text-xs text-slate-500">🔒 Tipy se odhalí po výkopu.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {players.map((pl) => {
                const t = preds.find((p) => p.name === pl.name);
                return (
                  <div key={pl.id} className="flex items-center justify-between">
                    <span className="text-slate-400">{pl.name}</span>
                    <span className="tabular-nums">
                      {t ? `${t.predicted_home}:${t.predicted_away}` : <span className="text-slate-600">—</span>}
                      {t && t.points != null && (
                        <span className={`ml-1.5 font-bold ${pointsTextClass(t.points)}`}>{t.points}b</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
