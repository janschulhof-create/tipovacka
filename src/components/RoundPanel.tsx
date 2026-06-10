'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Match, Player, Prediction, RoundPrediction } from '@/lib/types';
import { pointsBadgeClass } from '@/lib/points';

type Scores = Record<number, { h: string; a: string }>;

function dt(iso: string) {
  // pevná TZ → shodný výstup na serveru i v prohlížeči (jinak hydration mismatch)
  return new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Prague',
  });
}

export function RoundPanel({
  matches,
  players,
  predictions,
  editable = false,
  playerId: playerIdProp,
  onPlayerChange,
  showSelector = true,
}: {
  matches: Match[];
  players: Player[];
  predictions: RoundPrediction[];
  editable?: boolean;
  // volitelně řízený výběr hráče zvenčí (sdílený napříč více koly)
  playerId?: number | '';
  onPlayerChange?: (v: number | '') => void;
  showSelector?: boolean;
}) {
  const supabase = createClient();
  const [localPlayerId, setLocalPlayerId] = useState<number | ''>('');
  const playerId = playerIdProp !== undefined ? playerIdProp : localPlayerId;
  const setPlayerId = onPlayerChange ?? setLocalPlayerId;
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
        .eq('player_id', pid)
        .in('match_id', matches.map((m) => m.id));
      const next: Scores = {};
      for (const m of matches) next[m.id] = { h: '', a: '' };
      for (const p of (data as Prediction[]) ?? []) {
        next[p.match_id] = { h: String(p.predicted_home), a: String(p.predicted_away) };
      }
      setScores(next);
    },
    [matches, supabase]
  );

  useEffect(() => {
    if (editable && playerId) loadPredictions(Number(playerId));
  }, [editable, playerId, loadPredictions]);

  const setVal = (mid: number, side: 'h' | 'a', raw: string) => {
    let v = raw.replace(/[^0-9]/g, '').slice(0, 2);
    if (v !== '') v = String(Math.min(99, parseInt(v, 10)));
    setScores((s) => ({ ...s, [mid]: { ...(s[mid] ?? { h: '', a: '' }), [side]: v } }));
  };
  const bump = (mid: number, side: 'h' | 'a', delta: number) => {
    const cur = scores[mid]?.[side];
    const base = cur === '' || cur == null ? 0 : parseInt(cur, 10);
    setVal(mid, side, String(Math.max(0, Math.min(99, base + delta))));
  };

  async function save() {
    if (!playerId) return;
    setSaving(true);
    setMsg(null);
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
      setMsg('Nic k uložení — vyplň skóre u otevřených zápasů.');
      return;
    }
    const { error } = await supabase
      .from('predictions')
      .upsert(rows, { onConflict: 'player_id,match_id' });
    setSaving(false);
    setMsg(error ? `Chyba: ${error.message}` : `✅ Uloženo (${rows.length} tipů)!`);
  }

  const selectedName = players.find((p) => p.id === playerId)?.name;
  const openCount = matches.filter((m) => !isLocked(m)).length;
  const anyPlayed = matches.some((m) => m.status === 'finished' || m.status === 'live');

  // bodování za kolo
  const roundScores = players
    .map((p) => ({
      name: p.name,
      pts: predictions
        .filter((x) => x.name === p.name)
        .reduce((s, x) => s + (x.points ?? 0), 0),
    }))
    .sort((a, b) => b.pts - a.pts);

  return (
    <div className="panel-flush divide-y divide-terrain-700">
      {/* výběr hráče (jen editovatelné kolo) */}
      {editable && showSelector && (
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <label className="shrink-0 text-sm font-medium text-slate-100/70">
            🎯 Kdo tipuje?
          </label>
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
          {openCount > 0 && (
            <span className="text-xs text-slate-100/45 sm:ml-auto">
              {playerId ? `${openCount} zápasů k tipnutí` : `${openCount} otevřených — vyber jméno`}
            </span>
          )}
        </div>
      )}

      {/* zápasy */}
      <ul className="divide-y divide-terrain-700">
        {matches.map((m) => (
          <MatchRow
            key={m.id}
            m={m}
            locked={isLocked(m)}
            canTip={editable && playerId !== ''}
            selectedName={selectedName}
            preds={predictions.filter((p) => p.match_id === m.id)}
            score={scores[m.id] ?? { h: '', a: '' }}
            onBump={bump}
            onChange={setVal}
          />
        ))}
      </ul>

      {/* bodování za kolo */}
      {anyPlayed && (
        <div className="p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300/60">
            🏁 Body za kolo
          </div>
          <div className="flex flex-wrap gap-1.5">
            {roundScores.map((r, i) => (
              <span
                key={r.name}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                  i === 0 && r.pts > 0
                    ? 'border-gold/50 bg-gold/10 text-gold'
                    : 'border-terrain-600 bg-terrain-900/60 text-slate-100/80'
                }`}
              >
                {r.name}
                <span className="font-display font-bold tabular-nums">{r.pts}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* uložit (jen editovatelné a je co tipovat) */}
      {editable && playerId !== '' && openCount > 0 && (
        <div className="p-4">
          <button onClick={save} disabled={saving} className="btn-pitch">
            {saving ? 'Ukládám…' : '💾 Uložit tipy'}
          </button>
          {msg && <p className="mt-2 text-center text-sm text-slate-100/80">{msg}</p>}
        </div>
      )}
    </div>
  );
}

function MatchRow({
  m,
  locked,
  canTip,
  selectedName,
  preds,
  score,
  onBump,
  onChange,
}: {
  m: Match;
  locked: boolean;
  canTip: boolean;
  selectedName?: string;
  preds: RoundPrediction[];
  score: { h: string; a: string };
  onBump: (mid: number, side: 'h' | 'a', d: number) => void;
  onChange: (mid: number, side: 'h' | 'a', v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const live = m.status === 'live';
  const done = m.status === 'finished';
  const myTip = selectedName ? preds.find((p) => p.name === selectedName) : undefined;
  const showSteppers = !locked && canTip;

  const StatusLine = (
    <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-100/45">
      <span className="flex items-center gap-1.5">
        {live ? (
          <><span className="live-dot" /> <span className="text-flag">živě{m.minute != null ? ` ${m.minute}\u2032` : ''}</span></>
        ) : done ? 'konec' : locked ? '🔒 uzavřeno' : '🟢 otevřeno'}
      </span>
      <span>{dt(m.kickoff)}</span>
    </div>
  );

  const Center = showSteppers ? (
    <div className="flex items-center gap-1.5">
      <Stepper value={score.h} onBump={(d) => onBump(m.id, 'h', d)} onChange={(v) => onChange(m.id, 'h', v)} label={`${m.home_team} góly`} />
      <span className="font-display text-lg text-slate-300/40">:</span>
      <Stepper value={score.a} onBump={(d) => onBump(m.id, 'a', d)} onChange={(v) => onChange(m.id, 'a', v)} label={`${m.away_team} góly`} />
    </div>
  ) : locked ? (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-1 font-display text-xl font-bold tabular-nums ${live ? 'bg-flag/15 text-flag' : 'bg-terrain-900/70 text-white'}`}>
      <span>{m.home_score ?? 0}</span>
      <span className="text-slate-300/40">:</span>
      <span>{m.away_score ?? 0}</span>
    </div>
  ) : (
    <span className="text-sm text-slate-300/30">vs</span>
  );

  const Body = (
    <>
      {StatusLine}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="truncate text-right text-sm font-medium text-white">{m.home_team}</span>
        {Center}
        <span className="truncate text-left text-sm font-medium text-white">{m.away_team}</span>
      </div>
      {locked && myTip && (
        <div className="mt-2 text-center text-xs text-slate-100/60">
          tvůj tip {myTip.predicted_home}:{myTip.predicted_away}
          {myTip.points != null && (
            <span className={`ml-1.5 rounded px-1.5 py-0.5 font-bold ${pointsBadgeClass(myTip.points)}`}>
              {myTip.points} b
            </span>
          )}
        </div>
      )}
    </>
  );

  return (
    <li>
      {/* odehraný/živý zápas → celý řádek klikací, odhalí tipy (chevron vpravo) */}
      {locked ? (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-terrain-900/40 sm:px-4"
        >
          <div className="min-w-0 flex-1">{Body}</div>
          <span
            className={`shrink-0 text-slate-300/40 transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden
          >
            ›
          </span>
        </button>
      ) : (
        <div className="px-3 py-3 sm:px-4">{Body}</div>
      )}

      {/* odhalené tipy ostatních */}
      {locked && open && (
        <div className="border-t border-terrain-800/60 bg-terrain-950/40 px-3 py-3 sm:px-4">
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {preds.length === 0 && <span className="text-xs text-slate-300/30">Nikdo netipoval.</span>}
            {preds.map((t) => (
              <div key={t.name} className="flex items-center justify-between border-b border-terrain-800/60 py-1 last:border-0">
                <span className="text-slate-100/60">{t.name}</span>
                <span className="flex items-center gap-1.5 tabular-nums">
                  <span className="font-medium text-white">{t.predicted_home}:{t.predicted_away}</span>
                  {t.points != null && (
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${pointsBadgeClass(t.points)}`}>
                      {t.points} b
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

function Stepper({
  value,
  onBump,
  onChange,
  label,
}: {
  value: string;
  onBump: (delta: number) => void;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={`${label} +1`}
        onClick={() => onBump(1)}
        className="flex h-6 w-8 items-center justify-center rounded-md border border-terrain-600 bg-terrain-900 text-sm font-bold text-pitch-light active:scale-95"
      >
        ＋
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="done"
        aria-label={label}
        placeholder="–"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        className="h-10 w-11 rounded-md border border-terrain-600 bg-terrain-950 text-center font-display text-xl font-bold tabular-nums text-white placeholder:text-slate-300/25 focus:border-pitch focus:outline-none"
      />
      <button
        type="button"
        aria-label={`${label} −1`}
        onClick={() => onBump(-1)}
        className="flex h-6 w-8 items-center justify-center rounded-md border border-terrain-600 bg-terrain-900 text-sm font-bold text-slate-100/70 active:scale-95"
      >
        －
      </button>
    </div>
  );
}
