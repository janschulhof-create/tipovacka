'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Match, Player, Prediction } from '@/lib/types';

// '' = prázdné (nezadáno)
type Scores = Record<number, { h: string; a: string }>;

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

  const loadPredictions = useCallback(
    async (pid: number) => {
      const { data } = await supabase
        .from('predictions')
        .select('match_id, predicted_home, predicted_away')
        .eq('player_id', pid);
      const next: Scores = {};
      for (const m of matches) next[m.id] = { h: '', a: '' }; // prázdné dokud není tip
      for (const p of (data as Prediction[]) ?? []) {
        next[p.match_id] = { h: String(p.predicted_home), a: String(p.predicted_away) };
      }
      setScores(next);
    },
    [matches, supabase]
  );

  useEffect(() => {
    if (playerId) loadPredictions(Number(playerId));
  }, [playerId, loadPredictions]);

  const setVal = (mid: number, side: 'h' | 'a', raw: string) => {
    // jen číslice, max 2, ořež na 0–99
    let v = raw.replace(/[^0-9]/g, '').slice(0, 2);
    if (v !== '') v = String(Math.min(99, parseInt(v, 10)));
    setScores((s) => ({ ...s, [mid]: { ...(s[mid] ?? { h: '', a: '' }), [side]: v } }));
  };

  async function save() {
    if (!playerId) return;
    setSaving(true);
    setMsg(null);

    // ukládej jen zápasy s OBĚMA vyplněnými poli a neuzamčené
    const rows = matches
      .filter((m) => !isLocked(m))
      .filter((m) => {
        const s = scores[m.id];
        return s && s.h !== '' && s.a !== '';
      })
      .map((m) => ({
        player_id: Number(playerId),
        match_id: m.id,
        predicted_home: parseInt(scores[m.id].h, 10),
        predicted_away: parseInt(scores[m.id].a, 10),
      }));

    if (rows.length === 0) {
      setSaving(false);
      setMsg('Nic k uložení — vyplň skóre u zápasů, které chceš tipnout.');
      return;
    }

    const { error } = await supabase
      .from('predictions')
      .upsert(rows, { onConflict: 'player_id,match_id' });

    setSaving(false);
    setMsg(error ? `Chyba: ${error.message}` : `✅ Uloženo (${rows.length} tipů)!`);
  }

  const openMatches = matches.filter((m) => !isLocked(m));

  return (
    <div>
      <div className="px-4 py-3">
        <label className="mb-1 block text-sm font-medium text-slate-300">Kdo tipuje?</label>
        <select
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value ? Number(e.target.value) : '')}
          className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-base"
        >
          <option value="">— vyber jméno —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {playerId && (
        <>
          <ul className="space-y-3 px-4">
            {matches.map((m) => {
              const locked = isLocked(m);
              const s = scores[m.id] ?? { h: '', a: '' };
              return (
                <li
                  key={m.id}
                  className={`rounded-xl border border-line bg-panel p-3 ${locked ? 'opacity-50' : ''}`}
                >
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                    <span className="truncate">{m.home_team} – {m.away_team}</span>
                    {locked && <span className="shrink-0">🔒 uzavřeno</span>}
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <ScoreInput value={s.h} disabled={locked} onChange={(v) => setVal(m.id, 'h', v)} label={`${m.home_team} góly`} />
                    <span className="text-xl text-slate-500">:</span>
                    <ScoreInput value={s.a} disabled={locked} onChange={(v) => setVal(m.id, 'a', v)} label={`${m.away_team} góly`} />
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

function ScoreInput({
  value,
  disabled,
  onChange,
  label,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      enterKeyHint="done"
      aria-label={label}
      placeholder="–"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
      className="h-14 w-16 rounded-xl border border-line bg-ink text-center text-3xl font-bold tabular-nums placeholder:text-slate-600 focus:border-brand focus:outline-none disabled:opacity-40"
    />
  );
}
