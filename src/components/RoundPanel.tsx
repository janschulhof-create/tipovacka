'use client';

import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { Match, Player, RoundPrediction } from '@/lib/types';
import type { TeamStats, MatchDetail, MatchLineups, LineupPlayer } from '@/lib/espn';
import { pointsBadgeClass } from '@/lib/points';
import { calculatePoints } from '@/lib/scoring';
import { Flag } from './Flag';
import { Baroko, H2HContent, PredictionContent, XbContent, useInsight } from './MatchIntel';
import { sourceLabel } from '@/lib/espnCompetition';

type Scores = Record<number, { h: string; a: string }>;

function europeanCompetitionKey(source: string | null | undefined): string {
  return String(source ?? '').replace(/_qual$/, '');
}

function europeanCompetitionLabel(source: string | null | undefined): string {
  const key = europeanCompetitionKey(source);
  return sourceLabel(key);
}

function dt(iso: string) {
  // pevná TZ → shodný výstup na serveru i v prohlížeči (jinak hydration mismatch)
  return new Date(iso).toLocaleString('cs-CZ', {
    day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Prague',
  });
}


function scoresFromPredictions(
  matches: Match[],
  predictions: RoundPrediction[],
  selectedName: string | undefined,
): Scores {
  const next: Scores = {};
  for (const match of matches) next[match.id] = { h: '', a: '' };
  if (!selectedName) return next;
  for (const prediction of predictions) {
    if (prediction.name !== selectedName) continue;
    next[prediction.match_id] = {
      h: String(prediction.predicted_home),
      a: String(prediction.predicted_away),
    };
  }
  return next;
}

export function RoundPanel({
  matches,
  players,
  predictions,
  editable = false,
  playerId: playerIdProp,
  onPlayerChange,
  showSelector = true,
  groupBySource = false,
}: {
  matches: Match[];
  players: Player[];
  predictions: RoundPrediction[];
  editable?: boolean;
  // volitelně řízený výběr hráče zvenčí (sdílený napříč více koly)
  playerId?: number | '';
  onPlayerChange?: (v: number | '') => void;
  showSelector?: boolean;
  /** U evropského týdenního kola vloží výrazné předěly mezi poháry. */
  groupBySource?: boolean;
}) {
  // Supabase klient (~200 kB JS) se stáhne až ve chvíli, kdy je fakt potřeba
  // (načtení/uložení tipů) – ne při startu stránky. Výrazně zrychlí první vykreslení.
  const sbRef = useRef<Promise<import('@supabase/supabase-js').SupabaseClient> | null>(null);
  const getSupabase = useCallback(() => {
    if (!sbRef.current) {
      sbRef.current = import('@/lib/supabase/client').then((m) => m.createClient());
    }
    return sbRef.current;
  }, []);
  const [localPlayerId, setLocalPlayerId] = useState<number | ''>('');
  const playerId = playerIdProp !== undefined ? playerIdProp : localPlayerId;
  const setPlayerId = onPlayerChange ?? setLocalPlayerId;
  const selectedName = players.find((p) => p.id === playerId)?.name;

  const scoresFromServer = useMemo(
    () => scoresFromPredictions(matches, predictions, selectedName),
    [matches, predictions, selectedName],
  );
  const serverScoresKey = useMemo(() => JSON.stringify(scoresFromServer), [scoresFromServer]);
  const [scores, setScores] = useState<Scores>(() => scoresFromServer);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tipping, setTipping] = useState(false);
  // poslední stav, o kterém víme, že je v DB (na hlídání neuložených změn)
  const savedRef = useRef<Scores>(scoresFromServer);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Tipy už přišly v serverovém renderu. Načtení Supabase klienta a další API
  // dotaz proto odkládáme až na skutečné ukládání změn.
  useEffect(() => {
    if (dirtyCount > 0) return;
    setScores(scoresFromServer);
    savedRef.current = JSON.parse(JSON.stringify(scoresFromServer)) as Scores;
  }, [serverScoresKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [now, setNow] = useState(() => Date.now());
  // zámek musí "tikat" i bez reloadu – jinak by šlo vyplnit tip do zápasu,
  // který mezitím začal, a při uložení by tiše vypadl
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  const isLocked = (m: Match) =>
    m.status !== 'scheduled' || new Date(m.kickoff).getTime() <= now;

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

  // spočítá zápasy, které mají vyplněné skóre odlišné od toho, co je v DB
  const computeDirty = useCallback(
    (s: Scores) =>
      matches.filter((m) => {
        if (isLocked(m)) return false;
        const cur = s[m.id];
        if (!cur || cur.h === '' || cur.a === '') return false;
        const was = savedRef.current[m.id];
        return !was || was.h !== cur.h || was.a !== cur.a;
      }).length,
    // isLocked závisí na `now`, chceme přepočet i při tiknutí hodin
    [matches, now], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    setDirtyCount(computeDirty(scores));
  }, [scores, computeDirty]);

  const save = useCallback(
    async (silent = false) => {
      if (!playerId) return;
      setSaving(true);
      if (!silent) setMsg(null);
      // vyplněné zápasy si rozdělíme na otevřené (uložíme) a zamčené (nelze uložit)
      const filled = matches.filter((m) => {
        const s = scores[m.id];
        return s && s.h !== '' && s.a !== '';
      });
      const blocked = filled.filter((m) => isLocked(m));
      const rows = filled
        .filter((m) => !isLocked(m))
        .map((m) => ({
          player_id: Number(playerId),
          match_id: m.id,
          predicted_home: parseInt(scores[m.id].h, 10),
          predicted_away: parseInt(scores[m.id].a, 10),
        }));

      const blockedMsg =
        blocked.length > 0
          ? `⛔ Neuloženo (už začaly / jsou uzavřené): ${blocked.map((m) => `${m.home_team}–${m.away_team}`).join(', ')}.`
          : '';

      if (rows.length === 0) {
        setSaving(false);
        if (!silent) setMsg(blockedMsg || 'Nic k uložení — vyplň skóre u otevřených zápasů.');
        return;
      }
      const sb = await getSupabase();
      const { error } = await sb
        .from('predictions')
        .upsert(rows, { onConflict: 'player_id,match_id' });
      setSaving(false);
      if (error) {
        setMsg(`Chyba: ${error.message}`);
        return;
      }
      // ověř, že tipy v DB opravdu sedí (chytí i tiché odmítnutí zápisu)
      const { data: check } = await sb
        .from('predictions')
        .select('match_id, predicted_home, predicted_away')
        .eq('player_id', Number(playerId))
        .in('match_id', rows.map((r) => r.match_id));
      const inDb = new Map(
        ((check as { match_id: number; predicted_home: number; predicted_away: number }[]) ?? []).map((c) => [
          c.match_id,
          { h: String(c.predicted_home), a: String(c.predicted_away) },
        ]),
      );
      const missing = rows.filter((r) => {
        const d = inDb.get(r.match_id);
        return !d || d.h !== String(r.predicted_home) || d.a !== String(r.predicted_away);
      });

      // aktualizuj snapshot podle toho, co REÁLNĚ je v DB
      const nextSaved: Scores = { ...savedRef.current };
      for (const [mid, v] of inDb) nextSaved[mid] = v;
      savedRef.current = nextSaved;
      setDirtyCount(computeDirty(scores));
      setLastSavedAt(new Date());

      if (missing.length > 0) {
        setMsg(`⚠️ Část tipů se neuložila (${missing.length}). Zkus to prosím znovu. ${blockedMsg}`.trim());
        return;
      }
      // Úspěch NEhlásíme zvlášť – stav ("✅ Všechny tipy uložené ne 17:20")
      // ukazuje přímo lišta s tlačítkem. Necháme jen případné varování.
      setMsg(blockedMsg || null);
    },
    [playerId, matches, scores, getSupabase, computeDirty], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // AUTOSAVE: po 3 s nečinnosti ulož rozdělané tipy (tiše, bez zavření režimu)
  useEffect(() => {
    if (!editable || !tipping || !playerId || dirtyCount === 0 || saving) return;
    const t = setTimeout(() => {
      void save(true);
    }, 3000);
    return () => clearTimeout(t);
  }, [editable, tipping, playerId, dirtyCount, saving, save]);

  // POJISTKA: když tipér odchází (přepne appku / skryje záložku), ulož HNED.
  // Tohle chrání tipy nejvíc – nečeká se na doběhnutí odpočtu.
  useEffect(() => {
    if (!editable || !tipping || !playerId || dirtyCount === 0) return;
    const flush = () => {
      if (document.visibilityState === 'hidden') void save(true);
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [editable, tipping, playerId, dirtyCount, save]);

  // Pojistka: varuj při odchodu, když jsou neuložené tipy
  useEffect(() => {
    if (dirtyCount === 0) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirtyCount]);

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

      {/* zápasy */}
      <ul className="divide-y divide-terrain-700">
        {matches.map((m, index) => {
          const previous = matches[index - 1];
          const showGroup = groupBySource && (!previous || europeanCompetitionKey(previous.source_league) !== europeanCompetitionKey(m.source_league));
          return (
            <Fragment key={m.id}>
              {showGroup && (
                <li className="border-y border-terrain-600 bg-terrain-950/75 px-4 py-2.5 first:border-t-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/15 text-xs">🏆</span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.13em] text-blue-200/90">
                      {europeanCompetitionLabel(m.source_league)}
                    </span>
                  </div>
                </li>
              )}
              <MatchRow
                now={now}
                m={m}
                locked={isLocked(m)}
                canTip={editable && playerId !== ''}
                tipping={tipping}
                selectedName={selectedName}
                preds={predictions.filter((p) => p.match_id === m.id)}
                score={scores[m.id] ?? { h: '', a: '' }}
                onBump={bump}
                onChange={setVal}
              />
            </Fragment>
          );
        })}
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

      {/* spustit tipování — STEJNÉ místo jako Uložit (plovoucí lišta dole) */}
      {editable && openCount > 0 && !tipping && (
        <div className="sticky bottom-0 z-20 border-t border-terrain-700 bg-terrain-900/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-terrain-900/80">
          <button onClick={() => { setMsg(null); setTipping(true); }} className="btn-pitch w-full">
            🎯 Tipovat
          </button>
          <p className="mt-2 text-center text-xs text-slate-300/45">
            {openCount} {openCount === 1 ? 'zápas' : openCount < 5 ? 'zápasy' : 'zápasů'} k tipnutí
            {!playerId && ' — nejdřív vyber jméno'}
          </p>
        </div>
      )}

      {/* uložit — plovoucí lišta: drží se u spodní hrany, dokud tipuješ */}
      {editable && tipping && openCount > 0 && (
        <div className="sticky bottom-0 z-20 border-t border-terrain-700 bg-terrain-900/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-terrain-900/80">
          {/* jedno tlačítko, které se mění podle stavu:
              rozdělané tipy → Uložit; vše uložené → Hotovo (zavře tipování) */}
          {dirtyCount > 0 || saving ? (
            <button onClick={() => void save()} disabled={saving} className="btn-pitch w-full">
              {saving ? 'Ukládám…' : `💾 Uložit teď (${dirtyCount})`}
            </button>
          ) : (
            <button onClick={() => setTipping(false)} className="btn-pitch w-full">
              ✔️ Hotovo
            </button>
          )}
          <p className="mt-2 text-center text-xs">
            {saving ? (
              <span className="text-slate-300/60">Ukládám…</span>
            ) : dirtyCount > 0 ? (
              <span className="text-flag">● Uloží se samo za chvíli — nebo klikni</span>
            ) : lastSavedAt ? (
              <span className="text-pitch">
                ✅ Všechny tipy uložené{' '}
                {lastSavedAt.toLocaleString('cs-CZ', {
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            ) : (
              <span className="text-slate-300/45">Vyplň skóre — tipy se ukládají automaticky</span>
            )}
          </p>
        </div>
      )}

      {/* už jen chyby a varování — úspěch hlásí lišta s tlačítkem */}
      {msg && (
        <div className="px-4 py-3">
          <p
            className={`text-center text-sm ${
              msg.startsWith('Chyba') || msg.startsWith('⚠️') ? 'text-red-400' : 'text-flag'
            }`}
          >
            {msg}
          </p>
        </div>
      )}
    </div>
    </>
  );
}

/** "za 2 h 14 min" / "za 45 min" / "za 3 dny" – odpočet do uzávěrky (výkopu). */
function countdown(kickoff: string, now: number): string | null {
  const ms = new Date(kickoff).getTime() - now;
  if (ms <= 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 60) return `za ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    const rest = min % 60;
    return rest ? `za ${h} h ${rest} min` : `za ${h} h`;
  }
  const d = Math.floor(h / 24);
  return `za ${d} ${d === 1 ? 'den' : d < 5 ? 'dny' : 'dní'}`;
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
  now,
}: {
  m: Match;
  locked: boolean;
  canTip: boolean;
  tipping: boolean;
  now: number;
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
  const showSteppers = !locked && canTip && tipping;

  const StatusLine = (
    <div className="mb-2 flex items-start justify-between text-[11px] uppercase tracking-wide text-slate-100/45">
      <span className="flex items-center gap-1.5">
        {m.source_league?.startsWith('uefa.') && (
          <span className="rounded bg-terrain-800 px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-slate-200/70">
            {sourceLabel(m.source_league)}
          </span>
        )}
        {live ? (
          <><span className="live-dot" /> <span className="text-flag">živě{m.clock ? ` ${m.clock}` : m.minute != null ? ` ${m.minute}\u2032` : ''}</span></>
        ) : done ? 'konec' : locked ? '🔒 uzavřeno' : '🟢 otevřeno'}
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <span>{dt(m.kickoff)}</span>
        {!locked && !live && !done && countdown(m.kickoff, now) && (
          <span className="normal-case text-[10px] font-semibold text-flag">
            ⏳ uzávěrka {countdown(m.kickoff, now)}
          </span>
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
      {!showSteppers && (myTip || (score.h !== '' && score.a !== '')) && (
        <div className="mt-2 text-center text-xs text-slate-100/60">
          tvůj tip {myTip ? `${myTip.predicted_home}:${myTip.predicted_away}` : `${score.h}:${score.a}`}
          {myTip?.points != null && (
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

      {/* rozbalený detail: záložky Tipy | Statistiky | Sestavy */}
      {open && <MatchExpanded m={m} locked={locked} live={live} preds={preds} selectedName={selectedName} />}
    </li>
  );
}

function MatchExpanded({
  m,
  locked,
  live,
  preds,
  selectedName,
}: {
  m: Match;
  locked: boolean;
  live: boolean;
  preds: RoundPrediction[];
  selectedName?: string;
}) {
  const myTip = selectedName ? preds.find((p) => p.name === selectedName) : undefined;
  const d = m.detail;
  const hasProgress = !!d && ((d.goals?.length ?? 0) > 0 || (d.cards?.length ?? 0) > 0);
  const hasStats = !!d && (!!d.stats || !!d.venue || !!d.attendance);
  const lu = d?.lineups ?? null;
  const hasLineups = !!lu && lu.home.starters.length + lu.away.starters.length > 0;
  const hasRoast = m.status === 'finished' && (!!m.roast || (locked && preds.some((p) => p.points != null)));

  // Predikce dává smysl hlavně PŘED zápasem. U Chance ligy je H2H součástí xB predikce.
  // Jakmile se hraje / je dohráno, mají přednost Průběh, Statistiky a Hodnocení.
  const showPrediction = m.status === 'scheduled';

  const isChanceLeague = m.source_league === 'cze.1' && Number(m.round) > 0;

  type TabId = 'tipy' | 'hodnoceni' | 'h2h' | 'predikce' | 'xb' | 'prubeh' | 'staty' | 'sestavy';
  const tabs = (
    [
      { id: 'tipy' as const, label: 'Tipy' },
      hasRoast ? { id: 'hodnoceni' as const, label: 'Hodnocení' } : null,
      showPrediction && !isChanceLeague ? { id: 'h2h' as const, label: 'H2H' } : null,
      showPrediction && isChanceLeague ? { id: 'xb' as const, label: 'xB predikce' } : null,
      showPrediction && !isChanceLeague ? { id: 'predikce' as const, label: 'Predikce' } : null,
      hasProgress ? { id: 'prubeh' as const, label: 'Průběh' } : null,
      hasStats ? { id: 'staty' as const, label: 'Statistiky' } : null,
      hasLineups ? { id: 'sestavy' as const, label: 'Sestavy' } : null,
    ] as ({ id: TabId; label: string } | null)[]
  ).filter((t): t is { id: TabId; label: string } => t !== null);

  const [tab, setTab] = useState<TabId>('tipy');
  const active = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  // Data pro H2H / xB / predikci se načtou až při otevření příslušné záložky.
  const { data: intel, loading: intelLoading } = useInsight(m.id, active === 'h2h' || active === 'predikce' || active === 'xb');

  return (
    <div className="min-w-0 overflow-hidden border-t border-terrain-800/60 bg-terrain-950/40">
      {tabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto px-2 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={(e) => {
                e.stopPropagation();
                setTab(t.id);
              }}
              className={`shrink-0 whitespace-nowrap rounded-t-md px-3 py-1.5 text-xs font-semibold transition ${
                active === t.id
                  ? 'bg-terrain-800 text-white'
                  : 'text-slate-300/50 hover:text-slate-100/80'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className={tabs.length > 1 ? 'bg-terrain-800/40 px-3 py-3 sm:px-4' : 'px-3 py-3 sm:px-4'}>
        {active === 'tipy' && (
          <div className="space-y-3">
            <TipsContent m={m} locked={locked} live={live} preds={preds} />
            {showPrediction && (
              <Baroko
                seed={m.id}
                myTip={myTip ? { h: myTip.predicted_home, a: myTip.predicted_away } : undefined}
                preds={preds.filter((p) => p.name !== selectedName)}
                home={m.home_team}
                away={m.away_team}
              />
            )}
          </div>
        )}
        {active === 'hodnoceni' && <RoastContent m={m} preds={preds} />}
        {active === 'h2h' && <H2HContent data={intel} loading={intelLoading} />}
        {active === 'xb' && <XbContent data={intel} loading={intelLoading} />}
        {active === 'predikce' && (
          <PredictionContent data={intel} loading={intelLoading} home={m.home_team} away={m.away_team} />
        )}
        {active === 'prubeh' && d && <ProgressContent d={d} />}
        {active === 'staty' && d && <StatsContent d={d} />}
        {active === 'sestavy' && lu && <FormationView lineups={lu} homeTeam={m.home_team} awayTeam={m.away_team} />}
      </div>
    </div>
  );
}

function TipsContent({
  m,
  locked,
  live,
  preds,
}: {
  m: Match;
  locked: boolean;
  live: boolean;
  preds: RoundPrediction[];
}) {
  if (!locked) {
    return (
      <div className="text-xs">
        <p className="text-slate-100/60">🔒 Tipy se zobrazí po výkopu zápasu.</p>
        {preds.length > 0 ? (
          <p className="mt-1 text-[11px] text-slate-300/50">
            Už tipli ({preds.length}): {preds.map((t) => t.name).join(', ')}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-slate-300/40">Zatím nikdo netipoval.</p>
        )}
      </div>
    );
  }
  const effPts = (t: RoundPrediction): number | null =>
    t.points != null
      ? t.points
      : live && m.home_score != null && m.away_score != null
        ? calculatePoints(m.home_score, m.away_score, t.predicted_home, t.predicted_away)
        : null;
  const sorted = [...preds].sort(
    (a, b) => (effPts(b) ?? -1) - (effPts(a) ?? -1) || a.name.localeCompare(b.name, 'cs'),
  );
  return (
    <>
      {live && m.home_score != null && m.away_score != null && (
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-flag">
          <span className="live-dot" /> Live body z aktuálního skóre {m.home_score}:{m.away_score}
        </p>
      )}
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {preds.length === 0 && <span className="text-xs text-slate-300/30">Nikdo netipoval.</span>}
        {sorted.map((t) => {
          const pts = effPts(t);
          return (
            <div key={t.name} className="flex items-center justify-between border-b border-terrain-800/60 py-1 last:border-0">
              <span className="text-slate-100/60">{t.name}</span>
              <span className="flex items-center gap-1.5 tabular-nums">
                <span className="font-medium text-white">{t.predicted_home}:{t.predicted_away}</span>
                {pts != null ? (
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${pointsBadgeClass(pts)}`}>{pts} b</span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </>
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
  // ESPN posílá "90'+8'" (apostrof před +), proto bereme čísla zvlášť.
  const nums = ((disp ?? '').match(/\d+/g) ?? []).map(Number);
  if (!nums.length) return 9999;
  const plus = (disp ?? '').includes('+') && nums.length > 1 ? nums[1] : 0;
  return nums[0] + plus / 100;
}

function matchRoast(m: Match, preds: RoundPrediction[]): string[] {
  if (m.status !== 'finished' || m.home_score == null || m.away_score == null) return [];
  const H = m.home_score;
  const A = m.away_score;
  const score = `${H}:${A}`;
  const tipped = preds.filter((p) => p.points != null);

  // deterministický RNG dle id zápasu (text stálý, ale u každého zápasu jiný)
  let seed = (m.id * 48271 + 12345) % 2147483647;
  if (seed <= 0) seed += 2147483646;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

  if (tipped.length === 0)
    return [pick([
      'Tenhle zápas nikdo netipnul — kolektivní alibismus, nula odvahy. 🙈',
      'Prázdný tipovací lístek. Buď byla ponorka, nebo strach z ostudy.',
    ])];

  const winner = H > A ? m.home_team : m.away_team;
  const loserTeam = H > A ? m.away_team : m.home_team;
  const realWin = Math.sign(H - A);
  const reg = m.reg_home != null && m.reg_away != null ? `${m.reg_home}:${m.reg_away}` : score;

  type F = RoundPrediction & { tip: string; dist: number; predWin: number; total: number };
  const facts: F[] = tipped.map((p) => ({
    ...p,
    tip: `${p.predicted_home}:${p.predicted_away}`,
    dist: Math.abs(p.predicted_home - H) + Math.abs(p.predicted_away - A),
    predWin: Math.sign(p.predicted_home - p.predicted_away),
    total: p.predicted_home + p.predicted_away,
  }));

  const byBest = [...facts].sort((a, b) => b.points! - a.points! || a.dist - b.dist || a.name.localeCompare(b.name, 'cs'));
  const byWorst = [...facts].sort((a, b) => a.points! - b.points! || b.dist - a.dist || a.name.localeCompare(b.name, 'cs'));
  const hero = byBest[0];
  let loser = byWorst[0];
  if (loser.name === hero.name && byWorst.length > 1) loser = byWorst[1];

  const lines: string[] = [];

  // ── 1) charakter výsledku ──
  const diff = Math.abs(H - A);
  if (H + A === 0)
    lines.push(pick([
      'Nula od nuly — obě defenzivy zabetonovány, gólmani si stihli dát kafe. 🥱',
      'Bezgólová šachovnice: čistá konta a diváci v limbu.',
      'Vrchol antifotbalu, 0:0. Někdo měl vypnout přenos v poločase.',
    ]));
  else if (H + A >= 6)
    lines.push(pick([
      `Kanonáda ${score}! Obrany na dovolené, síť rudá jak Messiho tváře po penaltě. 🔥`,
      `Přestřelka jak na Divokém západě — ${score}, balóny v síti na běžícím pásu.`,
      `${score} — brankáři si dnes sáhli na dno pohárku hanby.`,
    ]));
  else if (diff >= 3)
    lines.push(pick([
      `${winner} přejelo ${loserTeam} parním válcem, ${score}. Debakl jak vyšitý.`,
      `Jednosměrka: ${winner} ${score}, ${loserTeam} si sáhlo na dno. Výprask jak řemen.`,
      `${loserTeam} dostalo lekci ze základů fotbalu, ${score}. Bolestivé.`,
    ]));
  else if (diff === 0)
    lines.push(pick([
      `Dělba bodů ${score} — každý domů s bodem a čistým svědomím.`,
      `Remíza jako řemen ${score}: nikdo nevyhrál, všichni naštvaní.`,
      `${score}, spravedlivě rozdělené nervy. Klasická plichta.`,
    ]));
  else
    lines.push(pick([
      `Těsňák ${score} — rozhodl jediný balón, zbytek nervy nadranc.`,
      `O gól, o nervy, o všechno — ${score} až do posledního hvizdu.`,
      `${score} na jeden mizerný odraz. Fotbal je krutý.`,
    ]));

  // ── 2) hrdina kola (nejvíc bodů) ──
  const hn = hero.name;
  const hp = hero.points!;
  if (hp === 10)
    lines.push(pick([
      `🎯 ${hn} napálil ${score} přímo do šibenice — 10 bodů a klid mistra. Ostatní ať se jdou zahrabat.`,
      `Prorok kola ${hn} (10 b). Nabízí kurzy věštění, první hodina zdarma, ostatní beznadějně vyprodáno.`,
      `${hn} tipl ${score} na chlup — 10 bodů. Sázkovky mu už ruší účet, tohle je podezřelé.`,
      `${hn} to přečetl líp než VAR — přesných 10 bodů. Klobouk dolů, kouzelníku.`,
    ]));
  else if (hp >= 4)
    lines.push(pick([
      `Nejblíž mušce byl ${hn} (${hp} b) — kanonýr kola, i když do vinklu netrefil.`,
      `${hn} bere ${hp} bodů a bude se s tím chlubit do dalšího kola. Zaslouženě, chvíli.`,
      `Ze šlamastyky vyválel nejvíc ${hn} (${hp} b). Král jednookých mezi slepými.`,
      `${hn} (${hp} b) měl aspoň nakročeno správně. Zbytek partičky spíš klopýtal.`,
    ]));
  else
    lines.push(pick([
      `„Vítěz" kola ${hn} s bídnými ${hp} body — a to je ten nejlepší z vás. Panečku. 😅`,
      `Nejvíc posbíral ${hn} (${hp} b). Když tohle je špička, tak dobrou noc.`,
      `Bramborová pro ${hn} (${hp} b), zlatá zůstala v trezoru — nikdo si ji nezasloužil.`,
    ]));

  // ── 3) chudák kola (nejmíň bodů) ──
  if (loser.name !== hero.name) {
    const ln = loser.name;
    const lp = loser.points!;
    if (lp === 0)
      lines.push(pick([
        `${ln} tipl ${loser.tip}, přišlo ${score} — vedle jak ta jedle, 0 bodů. Radši ať zůstane u fantasy. 🙈`,
        `${ln} (${loser.tip}) mířil do úplně jiného zápasu. Nula bodů a koktejl ostudy.`,
        `Cena útěchy pro ${ln}: tip ${loser.tip}, realita ${score}. Aut, roh, nic. 🥴`,
        `${ln} tipoval ${loser.tip} — analytik roku to teda nebude. Kulaťoučká nula.`,
        `${ln} poslal balón do autu i s tipem ${loser.tip}. 0 bodů, hlava v dlaních.`,
      ]));
    else
      lines.push(pick([
        `Na chvostu ${ln} (${loser.tip} → ${score}, ${lp} b). Věštecká koule mu praskla. 🔮`,
        `${ln} zase tahal za kratší konec — ${lp} b za tip ${loser.tip}. Chce to trénink.`,
        `${ln} (${lp} b) s tipem ${loser.tip} zůstal v šatně, když se rozdávaly body.`,
      ]));
  }

  // ── 4) perlička (vybraná z toho, co se reálně stalo) ──
  const perlicky: string[] = [];
  const wrongWin = facts.filter((p) => realWin !== 0 && p.predWin !== 0 && p.predWin !== realWin);
  const drawTippers = facts.filter((p) => p.predWin === 0);
  const overshoot = [...facts].sort((a, b) => b.total - a.total)[0];
  const undershoot = [...facts].sort((a, b) => a.total - b.total)[0];

  if (m.duration === 'EXTRA_TIME' || m.duration === 'PENALTY_SHOOTOUT')
    perlicky.push(pick([
      `Perlička: body jen za 90′ (${reg}). Kdo slavil gól v prodloužení, slavil do prázdna — Pán nastavení góly po devadesátce nebere. 😈`,
      `${m.duration === 'PENALTY_SHOOTOUT' ? 'Rozhodly až penalty' : 'Rozhodlo prodloužení'}, do tabulky jen 90′ (${reg}). Drama pro žaludek, ne pro body.`,
    ]));
  if (m.reg_home != null && m.reg_away != null && (m.reg_home !== H || m.reg_away !== A))
    perlicky.push(pick([
      `Perlička: gól v nastavení (${reg} → ${score}) přepsal body. Někomu spadl bod z kopaček rovnou do autu. ⏱️`,
      `V nastavení se ještě skórovalo a body se sesypaly. Kdo věřil stavu z 90. minuty, kousal se do rtu.`,
    ]));
  if (realWin !== 0 && wrongWin.length >= Math.max(2, Math.ceil(facts.length * 0.6)))
    perlicky.push(`Perlička: na ${winner} vsadila jen hrstka — ${wrongWin.map((p) => p.name).join(', ')} tipli špatný tým. Stádo se mýlilo svorně. 🐑`);
  else if (wrongWin.length === 1)
    perlicky.push(`Perlička: ${wrongWin[0].name} jako jediný vsadil na špatný tým (${wrongWin[0].tip}). Odvaha, nebo zoufalství?`);
  if (H + A === 0 && drawTippers.length === 0)
    perlicky.push(`Perlička: všichni čekali góly, přišla nula. Kolektivní facka od reality. 😂`);
  if (H + A >= 5 && undershoot.total <= 1)
    perlicky.push(`Perlička: ${undershoot.name} sázel na nudu (${undershoot.tip}), přišla přestřelka ${score}. Vedle jak to jde.`);
  if (diff >= 3 && overshoot && facts.some((p) => p.predWin === 0))
    perlicky.push(`Perlička: někdo čekal plichtu, ${winner} přitom válcovalo ${score}. Fotbalový jasnovidec v akci to nebyl.`);
  if (byBest[0].points! > 0 && byWorst[0].points === 0)
    perlicky.push(`Perlička: rozpětí od ${hero.name} po ${byWorst[0].name} — jak od Ligy mistrů k okresnímu přeboru. 📉`);

  if (perlicky.length) lines.push(pick(perlicky));

  return lines;
}

function RoastContent({ m, preds }: { m: Match; preds: RoundPrediction[] }) {
  const llm = (m.roast ?? '').trim();
  const paras = llm ? llm.split(/\n+/).filter(Boolean) : matchRoast(m, preds);
  if (paras.length === 0) return <p className="text-xs text-slate-300/40">Hodnocení se objeví po skončení zápasu.</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-flag">
        🎙️ Zhodnocení zápasu
      </div>
      {paras.map((l, i) => (
        <p key={i} className="text-sm leading-snug text-slate-100/80">
          {l}
        </p>
      ))}
    </div>
  );
}

function ProgressContent({ d }: { d: MatchDetail }) {
  // góly + karty v časové posloupnosti, jak šly po sobě
  const feed = [
    ...(d.goals ?? []).map((g) => ({ min: g.min, sort: clockNum(g.min), side: g.side, type: 'goal' as const, player: g.player, gkind: g.kind })),
    ...(d.cards ?? []).map((c) => ({ min: c.min, sort: clockNum(c.min), side: c.side, type: 'card' as const, player: c.player, color: c.color })),
    ...(d.substitutions ?? []).map((sub) => ({ min: sub.min, sort: clockNum(sub.min), side: sub.side, type: 'sub' as const, player: sub.playerIn, playerOut: sub.playerOut })),
  ].sort((a, b) => a.sort - b.sort);

  if (feed.length === 0) return <p className="text-xs text-slate-300/40">Zatím žádné události.</p>;

  return (
    <ul className="space-y-0.5 text-xs">
      {feed.map((e, i) => {
        const icon =
          e.type === 'goal' ? (
            <span>⚽</span>
          ) : e.type === 'sub' ? (
            <span className="text-emerald-300">↔</span>
          ) : (
            <span className={e.color === 'red' ? 'text-red-400' : 'text-yellow-400'}>▮</span>
          );
        const suffix =
          e.type === 'goal' && e.gkind === 'penalty' ? ' (pen.)'
            : e.type === 'goal' && e.gkind === 'own' ? ' (vl.)'
              : e.type === 'sub' && e.playerOut ? ` za ${e.playerOut}` : '';
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
  );
}

function StatsContent({ d }: { d: MatchDetail }) {
  const meta = [
    d.venue ? `${d.venue}${d.city ? `, ${d.city}` : ''}` : null,
    d.attendance ? `${d.attendance.toLocaleString('cs-CZ')} diváků` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      {meta.length > 0 && <div className="text-[11px] text-slate-300/50">🏟️ {meta.join(' · ')}</div>}
      {d.stats ? (
        <StatBars home={d.stats.home} away={d.stats.away} />
      ) : (
        meta.length === 0 && <p className="text-xs text-slate-300/40">Statistiky nejsou k dispozici.</p>
      )}
    </div>
  );
}

const AWAY_ROWS: LineupPlayer['row'][] = ['gk', 'def', 'mid', 'am', 'fwd']; // shora dolů (útok ke středu)
const HOME_ROWS: LineupPlayer['row'][] = ['fwd', 'am', 'mid', 'def', 'gk']; // od středu dolů k brankáři

/** Silueta hřiště na pozadí (čáry, kruhy, vápna). */
function PitchLines() {
  const s = { fill: 'none', stroke: 'rgba(255,255,255,0.14)', strokeWidth: 0.5 };
  return (
    <svg viewBox="0 0 100 140" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect x="2" y="2" width="96" height="136" {...s} />
      <line x1="2" y1="70" x2="98" y2="70" {...s} />
      <circle cx="50" cy="70" r="11" {...s} />
      <circle cx="50" cy="70" r="0.8" fill="rgba(255,255,255,0.2)" stroke="none" />
      {/* horní vápno (hosté) */}
      <rect x="28" y="2" width="44" height="16" {...s} />
      <rect x="40" y="2" width="20" height="6" {...s} />
      {/* dolní vápno (domácí) */}
      <rect x="28" y="122" width="44" height="16" {...s} />
      <rect x="40" y="132" width="20" height="6" {...s} />
    </svg>
  );
}

function PlayerChip({ p, accent }: { p: LineupPlayer; accent: string }) {
  return (
    <span className="flex w-14 flex-col items-center gap-0.5 text-center sm:w-16">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold tabular-nums text-white shadow sm:h-8 sm:w-8 ${accent}`}>
        {p.jersey ?? '·'}
      </span>
      <span className="max-w-[56px] truncate text-[9px] leading-tight text-white/90 sm:max-w-[64px] sm:text-[10px]" title={p.name}>
        {p.name}
      </span>
    </span>
  );
}

function PitchRow({ players, accent }: { players: LineupPlayer[]; accent: string }) {
  if (players.length === 0) return null;
  return (
    <div className="flex items-center justify-evenly px-1">
      {players.map((p, i) => (
        <PlayerChip key={`${p.name}-${i}`} p={p} accent={accent} />
      ))}
    </div>
  );
}

function FormationView({ lineups, homeTeam, awayTeam }: { lineups: MatchLineups; homeTeam: string; awayTeam: string }) {
  const homeAccent = 'bg-flag ring-1 ring-white/30';
  const awayAccent = 'bg-pitch ring-1 ring-white/30';

  const TeamLabel = ({ team, formation, accent }: { team: string; formation?: string; accent: string }) => (
    <div className="flex items-center gap-2 text-xs font-semibold text-white">
      <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
      <Flag team={team} /> {team}
      {formation && <span className="tabular-nums text-slate-300/50">{formation}</span>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <TeamLabel team={awayTeam} formation={lineups.away.formation} accent="bg-pitch" />
      </div>

      {/* jedno hřiště: hosté shora (brankář nahoře), domácí zdola (brankář dole), útoky se potkávají u středu */}
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-emerald-300/10"
        style={{ aspectRatio: '3 / 4', background: 'linear-gradient(180deg, rgba(18,96,58,.55), rgba(12,66,42,.5) 50%, rgba(18,96,58,.55))' }}
      >
        <PitchLines />
        <div className="absolute inset-0 flex flex-col py-2">
          <div className="flex flex-1 flex-col justify-around">
            {AWAY_ROWS.map((r) => (
              <PitchRow key={`a-${r}`} players={lineups.away.starters.filter((p) => p.row === r)} accent={awayAccent} />
            ))}
          </div>
          <div className="flex flex-1 flex-col justify-around">
            {HOME_ROWS.map((r) => (
              <PitchRow key={`h-${r}`} players={lineups.home.starters.filter((p) => p.row === r)} accent={homeAccent} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <TeamLabel team={homeTeam} formation={lineups.home.formation} accent="bg-flag" />
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
    { label: 'xG', h: home.xg, a: away.xg, hd: home.xg ?? '–', ad: away.xg ?? '–' },
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
