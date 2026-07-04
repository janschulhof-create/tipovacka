'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Match, Player, Prediction, RoundPrediction } from '@/lib/types';
import type { TeamStats } from '@/lib/espn';
import { pointsBadgeClass } from '@/lib/points';
import { calculatePoints } from '@/lib/scoring';
import { Flag } from './Flag';
import { MatchInsight } from './MatchInsight';

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
  const [tipping, setTipping] = useState(false);
  const [insightMatch, setInsightMatch] = useState<number | null>(null);

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
    if (error) {
      setMsg(`Chyba: ${error.message}`);
    } else {
      setMsg(`✅ Tipy uložené (${rows.length})`);
      setTipping(false);
    }
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
    <>
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

      {/* vědomá akce: spustit tipování */}
      {editable && openCount > 0 && !tipping && (
        <div className="p-4">
          <button onClick={() => { setMsg(null); setTipping(true); }} className="btn-pitch">
            🎯 Tipovat
          </button>
          <p className="mt-2 text-center text-xs text-slate-300/45">
            {openCount} {openCount === 1 ? 'zápas' : openCount < 5 ? 'zápasy' : 'zápasů'} k tipnutí — klikni, vyplň skóre a ulož
          </p>
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
            tipping={tipping}
            selectedName={selectedName}
            preds={predictions.filter((p) => p.match_id === m.id)}
            score={scores[m.id] ?? { h: '', a: '' }}
            onBump={bump}
            onChange={setVal}
            onInsight={() => setInsightMatch(m.id)}
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

      {/* uložit (jen v režimu tipování) */}
      {editable && tipping && openCount > 0 && (
        <div className="p-4">
          <button onClick={save} disabled={saving} className="btn-pitch">
            {saving ? 'Ukládám…' : '💾 Uložit tipy'}
          </button>
        </div>
      )}

      {/* potvrzení / chyba */}
      {msg && (
        <div className="px-4 py-3">
          <p className={`text-center text-sm ${msg.startsWith('Chyba') ? 'text-red-400' : 'text-pitch-light'}`}>
            {msg}
          </p>
        </div>
      )}
    </div>
    {insightMatch != null && <MatchInsight matchId={insightMatch} onClose={() => setInsightMatch(null)} />}
    </>
  );
}

function MatchRow({
  m,
  locked,
  canTip,
  tipping,
  selectedName,
  preds,
  score,
  onBump,
  onChange,
  onInsight,
}: {
  m: Match;
  locked: boolean;
  canTip: boolean;
  tipping: boolean;
  selectedName?: string;
  preds: RoundPrediction[];
  score: { h: string; a: string };
  onBump: (mid: number, side: 'h' | 'a', d: number) => void;
  onChange: (mid: number, side: 'h' | 'a', v: string) => void;
  onInsight: () => void;
}) {
  const [open, setOpen] = useState(false);
  const live = m.status === 'live';
  const done = m.status === 'finished';
  const myTip = selectedName ? preds.find((p) => p.name === selectedName) : undefined;
  const showSteppers = !locked && canTip && tipping;

  const StatusLine = (
    <div className="mb-2 flex items-start justify-between text-[11px] uppercase tracking-wide text-slate-100/45">
      <span className="flex items-center gap-1.5">
        {live ? (
          <><span className="live-dot" /> <span className="text-flag">živě{m.clock ? ` ${m.clock}` : m.minute != null ? ` ${m.minute}\u2032` : ''}</span></>
        ) : done ? 'konec' : locked ? '🔒 uzavřeno' : '🟢 otevřeno'}
      </span>
      <span className="flex flex-col items-end gap-1.5">
        <span>{dt(m.kickoff)}</span>
        {tipping && (
          <button
            onClick={(e) => { e.stopPropagation(); onInsight(); }}
            className="flex items-center gap-1 rounded-md bg-terrain-900 px-2 py-1 text-[10px] font-semibold normal-case text-slate-300/70 transition hover:text-white"
            aria-label="Vzájemné zápasy a tvoje forma"
          >
            📊 H2H
          </button>
        )}
      </span>
    </div>
  );

  const Center = showSteppers ? (
    <div
      className="flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Stepper value={score.h} onBump={(d) => onBump(m.id, 'h', d)} onChange={(v) => onChange(m.id, 'h', v)} label={`${m.home_team} góly`} />
      <span className="font-display text-lg text-slate-300/40">:</span>
      <Stepper value={score.a} onBump={(d) => onBump(m.id, 'a', d)} onChange={(v) => onChange(m.id, 'a', v)} label={`${m.away_team} góly`} />
    </div>
  ) : locked ? (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-1 font-display text-xl font-bold tabular-nums ${live ? 'bg-flag/15 text-flag' : 'bg-terrain-900/70 text-white'}`}>
      <span>{m.home_score ?? '–'}</span>
      <span className="text-slate-300/40">:</span>
      <span>{m.away_score ?? '–'}</span>
    </div>
  ) : (
    <span className="text-sm text-slate-300/30">vs</span>
  );

  const Body = (
    <>
      {StatusLine}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-sm font-medium text-white">{m.home_team}</span>
          <Flag team={m.home_team} />
        </span>
        {Center}
        <span className="flex min-w-0 items-center justify-start gap-2">
          <Flag team={m.away_team} />
          <span className="truncate text-sm font-medium text-white">{m.away_team}</span>
        </span>
      </div>
      {done && (m.duration === 'EXTRA_TIME' || m.duration === 'PENALTY_SHOOTOUT') && (
        <div className="mt-1.5 text-center text-[11px] leading-tight text-slate-300/45">
          {m.duration === 'PENALTY_SHOOTOUT'
            ? `po prodl. ${m.extra_home ?? '?'}:${m.extra_away ?? '?'}, na penalty ${m.pen_home ?? '?'}:${m.pen_away ?? '?'}`
            : `po prodloužení ${m.extra_home ?? '?'}:${m.extra_away ?? '?'}`}
          <span className="text-slate-300/30"> · body za stav po 90′</span>
        </div>
      )}
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
      {/* celý box klikací (mobil-friendly) — políčka na tipování mají stopPropagation */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Detail zápasu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition hover:bg-terrain-900/40 sm:px-4"
      >
        <div className="min-w-0 flex-1">{Body}</div>
        <span
          className={`shrink-0 text-slate-300/40 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        >
          ›
        </span>
      </div>

      {/* bohatý detail zápasu (ESPN): stadion, střelci, karty, statistiky, sestavy */}
      {open && m.detail && <MatchDetailView m={m} />}

      {/* odhalené tipy ostatních */}
      {locked && open && (
        <div className="border-t border-terrain-800/60 bg-terrain-900/40 px-3 py-3 sm:px-4">
          <SectionHead icon="🎯" title="Tipy hráčů" accent="bg-pitch" />
          {live && m.home_score != null && m.away_score != null && (
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-flag">
              <span className="live-dot" /> Live body z aktuálního skóre {m.home_score}:{m.away_score}
            </p>
          )}
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {preds.length === 0 && <span className="text-xs text-slate-300/30">Nikdo netipoval.</span>}
            {preds.map((t) => {
              const livePts =
                live && m.home_score != null && m.away_score != null
                  ? calculatePoints(m.home_score, m.away_score, t.predicted_home, t.predicted_away)
                  : null;
              return (
                <div key={t.name} className="flex items-center justify-between border-b border-terrain-800/60 py-1 last:border-0">
                  <span className="text-slate-100/60">{t.name}</span>
                  <span className="flex items-center gap-1.5 tabular-nums">
                    <span className="font-medium text-white">{t.predicted_home}:{t.predicted_away}</span>
                    {t.points != null ? (
                      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${pointsBadgeClass(t.points)}`}>
                        {t.points} b
                      </span>
                    ) : livePts != null ? (
                      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${pointsBadgeClass(livePts)}`}>
                        {livePts} b
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* před výkopem → tipy skryté, jen kdo už tipoval (bez hodnot) */}
      {!locked && open && (
        <div className="border-t border-terrain-800/60 bg-terrain-950/40 px-3 py-3 text-xs sm:px-4">
          <p className="text-slate-100/60">🔒 Tipy se zobrazí po výkopu zápasu.</p>
          {preds.length > 0 ? (
            <p className="mt-1 text-[11px] text-slate-300/50">
              Už tipli ({preds.length}): {preds.map((t) => t.name).join(', ')}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-slate-300/40">Zatím nikdo netipoval.</p>
          )}
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

// ─── Bohatý detail zápasu (data z ESPN) ─────────────────────────────
// Minuta ("45'+2'") → číslo pro řazení (45.02), aby nastavení šlo správně za základní čas.
function clockNum(disp: string): number {
  const m = /(\d+)(?:\s*\+\s*(\d+))?/.exec(disp ?? '');
  if (!m) return 9999;
  return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 100 : 0);
}

function SectionHead({ icon, title, accent }: { icon: string; title: string; accent: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className={`h-3.5 w-1 rounded-full ${accent}`} />
      <span aria-hidden className="text-[12px] leading-none">{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300/60">{title}</span>
    </div>
  );
}

function MatchDetailView({ m }: { m: Match }) {
  const d = m.detail;
  if (!d) return null;
  const meta = [
    d.venue ? `${d.venue}${d.city ? `, ${d.city}` : ''}` : null,
    d.attendance ? `${d.attendance.toLocaleString('cs-CZ')} diváků` : null,
  ].filter(Boolean);

  // góly + karty v časové posloupnosti, jak šly po sobě
  const feed = [
    ...(d.goals ?? []).map((g) => ({ min: g.min, sort: clockNum(g.min), side: g.side, type: 'goal' as const, player: g.player, gkind: g.kind })),
    ...(d.cards ?? []).map((c) => ({ min: c.min, sort: clockNum(c.min), side: c.side, type: 'card' as const, player: c.player, color: c.color })),
  ].sort((a, b) => a.sort - b.sort);

  return (
    <div className="border-t border-terrain-800/60 bg-terrain-950/40 px-3 py-3 sm:px-4">
      <SectionHead icon="📊" title="Statistiky zápasu" accent="bg-flag" />
      <div className="space-y-3">
      {meta.length > 0 && <div className="text-[11px] text-slate-300/50">🏟️ {meta.join(' · ')}</div>}

      {feed.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-300/40">Průběh</p>
          <ul className="space-y-0.5 text-xs">
            {feed.map((e, i) => {
              const icon =
                e.type === 'goal' ? (
                  <span>⚽</span>
                ) : (
                  <span className={e.color === 'red' ? 'text-red-400' : 'text-yellow-400'}>▮</span>
                );
              const suffix =
                e.type === 'goal' && e.gkind === 'penalty' ? ' (pen.)' : e.type === 'goal' && e.gkind === 'own' ? ' (vl.)' : '';
              return (
                <li key={i} className={e.side === 'home' ? 'text-left' : 'text-right'}>
                  <span className="text-slate-100/75">
                    {e.side === 'away' && <span className="text-slate-300/40">{e.min} </span>}
                    {icon} {e.player}
                    {suffix}
                    {e.side === 'home' && <span className="text-slate-300/40"> {e.min}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {d.stats && <StatBars home={d.stats.home} away={d.stats.away} />}
      </div>
    </div>
  );
}

function StatBars({ home, away }: { home: TeamStats; away: TeamStats }) {
  // logické pořadí: kvalita šancí → kontrola hry → disciplína
  const num = (v?: string) => {
    const n = parseFloat((v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const pct = (v?: string) => (v == null ? '–' : /%/.test(v) ? v : `${v}%`);
  const rows: { label: string; h?: string; a?: string; hd: string; ad: string }[] = [
    { label: 'Očekávané góly (xG)', h: home.xg, a: away.xg, hd: home.xg ?? '–', ad: away.xg ?? '–' },
    { label: 'Velké šance', h: home.bigChances, a: away.bigChances, hd: home.bigChances ?? '–', ad: away.bigChances ?? '–' },
    { label: 'Střely', h: home.shots, a: away.shots, hd: home.shots ?? '–', ad: away.shots ?? '–' },
    { label: 'Střely na branku', h: home.sot, a: away.sot, hd: home.sot ?? '–', ad: away.sot ?? '–' },
    { label: 'Rohy', h: home.corners, a: away.corners, hd: home.corners ?? '–', ad: away.corners ?? '–' },
    { label: 'Držení míče', h: home.possession, a: away.possession, hd: pct(home.possession), ad: pct(away.possession) },
    { label: 'Přesné přihrávky', h: home.passes, a: away.passes, hd: home.passes ?? '–', ad: away.passes ?? '–' },
    { label: 'Fauly', h: home.fouls, a: away.fouls, hd: home.fouls ?? '–', ad: away.fouls ?? '–' },
    { label: 'Karty', h: home.cards, a: away.cards, hd: home.cards ?? '–', ad: away.cards ?? '–' },
  ];
  const shown = rows.filter((r) => r.h != null || r.a != null);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {shown.map((r) => {
        const hn = num(r.h);
        const an = num(r.a);
        const tot = hn + an || 1;
        return (
          <div key={r.label} className="text-[11px]">
            <div className="flex items-center justify-between">
              <span className="w-14 tabular-nums text-white">{r.hd}</span>
              <span className="text-slate-300/45">{r.label}</span>
              <span className="w-14 text-right tabular-nums text-white">{r.ad}</span>
            </div>
            <div className="mt-0.5 flex h-1 overflow-hidden rounded-full bg-terrain-900">
              <div className="bg-flag/60" style={{ width: `${(hn / tot) * 100}%` }} />
              <div className="ml-auto bg-slate-400/40" style={{ width: `${(an / tot) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
