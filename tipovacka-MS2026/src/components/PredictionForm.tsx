'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Match, Player, Prediction } from '@/lib/types';

type Scores = Record<number, { h: number; a: number }>;

export function PredictionForm({
  players,
  matches,
}: {
  players: Player[];
  matches: Match[];
}) {
  const supabase = createClient();
  const [playerId, setPlayerId] = useState<number | ''>('');
  const [scores, setScores] = useState<Scores>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const isLocked = (m: Match) =>
    m.status !== 'scheduled' || new Date(m.kickoff).getTime() <= Date.now();

  // Načti existující tipy zvoleného hráče a předvyplň
  const loadPredictions = useCallback(
    async (pid: number) => {
      const { data } = await supabase
        .from('predictions')
        .select('match_id, predicted_home, predicted_away')
        .eq('player_id', pid);
      const next: Scores = {};
      for (const m of matches) next[m.id] = { h: 0, a: 0 };
      for (const p of (data as Prediction[]) ?? []) {
        next[p.match_id] = { h: p.predicted_home, a: p.predicted_away };
      }
      setScores(next);
    },
    [matches, supabase]
  );

  useEffect(() => {
    if (playerId) loadPredictions(Number(playerId));
  }, [playerId, loadPredictions]);

  const bump = (mid: number, side: 'h' | 'a', delta: number) =>
    setScores((s) => {
      const cur = s[mid] ?? { h: 0, a: 0 };
      const v = Math.max(0, Math.min(20, cur[side] + delta));
      return { ...s, [mid]: { ...cur, [side]: v } };
    });

  async function save() {
    if (!playerId) return;
    setSaving(true);
    setMsg(null);

    const rows = matches
      .filter((m) => !isLocked(m))
      .map((m) => ({
        player_id: Number(playerId),
        match_id: m.id,
        predicted_home: scores[m.id]?.h ?? 0,
        predicted_away: scores[m.id]?.a ?? 0,
      }));

    const { error } = await supabase
      .from('predictions')
      .upsert(rows, { onConflict: 'player_id,match_id' });

    setSaving(false);
    setMsg(error ? `Chyba: ${error.message}` : '✅ Tipy uloženy!');
  }

  const openMatches = matches.filter((m) => !isLocked(m));

  return (
    <div>
      {/* Výběr hráče */}
      <div className="px-4 py-3">
        <label className="mb-1 block text-sm font-medium text-slate-300">Kdo tipuje?</label>
        <select
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value ? Number(e.target.value) : '')}
          className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-base"
        >
          <option value="">— vyber jméno —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {playerId && (
        <>
          <ul className="space-y-3 px-4">
            {matches.map((m) => {
              const locked = isLocked(m);
              const s = scores[m.id] ?? { h: 0, a: 0 };
              return (
                <li
                  key={m.id}
                  className={`rounded-xl border border-line bg-panel p-3 ${locked ? 'opacity-50' : ''}`}
                >
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                    <span className="truncate">
                      {m.home_team} – {m.away_team}
                    </span>
                    {locked && <span className="shrink-0">🔒 uzavřeno</span>}
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <Stepper value={s.h} disabled={locked} onChange={(d) => bump(m.id, 'h', d)} />
                    <span className="text-lg text-slate-500">:</span>
                    <Stepper value={s.a} disabled={locked} onChange={(d) => bump(m.id, 'a', d)} />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="sticky bottom-20 z-10 px-4 py-4">
            <button
              onClick={save}
              disabled={saving || openMatches.length === 0}
              className="w-full rounded-2xl bg-brand py-4 text-lg font-bold text-ink disabled:opacity-50 active:scale-[0.99]"
            >
              {openMatches.length === 0 ? 'Vše uzavřeno' : saving ? 'Ukládám…' : 'ULOŽIT TIPY'}
            </button>
            {msg && <p className="mt-2 text-center text-sm text-slate-300">{msg}</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Stepper({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (delta: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(-1)}
        className="h-10 w-10 rounded-full border border-line bg-ink text-xl font-bold disabled:opacity-40"
      >
        −
      </button>
      <span className="w-8 text-center text-2xl font-bold tabular-nums">{value}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(1)}
        className="h-10 w-10 rounded-full border border-line bg-ink text-xl font-bold disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
