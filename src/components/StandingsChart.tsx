'use client';

import { useEffect, useRef, useState } from 'react';
import {
  buildCumulativeSeries,
  buildRankSeries,
  buildRoundSnapshot,
  hasEnoughRounds,
  movementLabel,
  resolveLabelCollisions,
  roundIndexFromRatio,
  shouldSelectOnPointerMove,
} from '@/lib/seasonRace';
import { qualityColor } from '@/lib/points';

type MatchPoint = { round: number; kickoff?: string; pts: Record<string, number> };
type View = 'lineDay' | 'lineRound' | 'bar';

// pevná TZ (shodná s výpisem zápasů) → stejné dny jako v seznamu a žádný hydration mismatch
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' });

const WD_SHORT = ['', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const WD_LONG = ['', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
// ISO den v týdnu (1=Po … 7=Ne) v Europe/Prague
const wdIdxOf = (iso: string) => {
  const ds = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
  const [Y, M, D] = ds.split('-').map(Number);
  const dow = new Date(Date.UTC(Y, M - 1, D)).getUTCDay();
  return dow === 0 ? 7 : dow;
};

// barevná škála dle pořadí: nejlepší fialová → zelená → modrá → žlutá → červená.
const rankColor = (i: number, n: number) => qualityColor(n - 1 - i, 0, Math.max(1, n - 1));

/**
 * Sdílený graf průběhu sezony.
 *
 * Tenký přepínač mezi dvěma konfiguracemi téhož grafu — obě sdílejí datový
 * tvar (`MatchPoint`), barevnou škálu (`rankColor`) i výpočty ze
 * `@/lib/seasonRace`. Jedna implementace, dvě použití.
 *
 * `history`    – původní chování na /historie (dny / kola / sloupce, skrývání).
 * `seasonRace` – tabulka pořadí (Body / Pořadí, scrubber, detail kola, focus).
 */
export function StandingsChart({
  matches,
  players,
  variant = 'history',
  interactionMode,
}: {
  matches: MatchPoint[];
  players: string[];
  variant?: 'history' | 'seasonRace';
  /** `hide` = klik skryje čáru (historie), `focus` = klik zvýrazní (Season Race). */
  interactionMode?: 'hide' | 'focus';
}) {
  return variant === 'seasonRace'
    ? <SeasonRace matches={matches} players={players} interactionMode={interactionMode ?? 'focus'} />
    : <HistoryChart matches={matches} players={players} />;
}

/** Původní graf z /historie – chování beze změny. */
function HistoryChart({ matches, players }: { matches: MatchPoint[]; players: string[] }) {
  const canDay = matches.length > 0 && matches.every((m) => !!m.kickoff);
  const [view, setView] = useState<View>(canDay ? 'lineDay' : 'lineRound');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const [barSel, setBarSel] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const effView: View = view === 'lineDay' && !canDay ? 'lineRound' : view;

  // celkové body (pořadí + barvy)
  const totals: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  for (const m of matches) for (const p of players) totals[p] += m.pts[p] ?? 0;
  const order = players.slice().sort((a, b) => totals[b] - totals[a]);
  const rankOf: Record<string, number> = Object.fromEntries(order.map((p, i) => [p, i]));
  const colorOf = (p: string) => rankColor(rankOf[p], players.length);
  const finals = order.map((p) => ({ p, total: totals[p] }));

  const isVisible = (p: string) => !hidden.has(p);
  const toggle = (p: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  // seskupení po dnech / kolech (čárový graf)
  const buildLine = (gmode: 'day' | 'round') => {
    const gs: { label: string; pts: Record<string, number> }[] = [];
    const idx = new Map<string, number>();
    for (const m of matches) {
      const key = gmode === 'day' ? dayKey(m.kickoff as string) : `r${m.round}`;
      const label = gmode === 'day' ? dayLabel(m.kickoff as string) : `${m.round}.`;
      let gi = idx.get(key);
      if (gi == null) { gi = gs.length; idx.set(key, gi); gs.push({ label, pts: {} }); }
      for (const p of players) gs[gi].pts[p] = (gs[gi].pts[p] ?? 0) + (m.pts[p] ?? 0);
    }
    return gs;
  };

  // seskupení po dnech v týdnu (sloupcový graf) – součet přes celé MS
  const buildWeekday = () => {
    const gs: { label: string; long: string; pts: Record<string, number> }[] = [];
    const idx = new Map<number, number>();
    for (const m of matches) {
      const wi = wdIdxOf(m.kickoff as string);
      let gi = idx.get(wi);
      if (gi == null) { gi = gs.length; idx.set(wi, gi); gs.push({ label: WD_SHORT[wi], long: WD_LONG[wi], pts: {} }); }
      for (const p of players) gs[gi].pts[p] = (gs[gi].pts[p] ?? 0) + (m.pts[p] ?? 0);
    }
    // seřadit Po → Ne
    return gs
      .map((g) => ({ g, wi: WD_SHORT.indexOf(g.label) }))
      .sort((a, b) => a.wi - b.wi)
      .map((x) => x.g);
  };

  const tabCls = (active: boolean) =>
    `whitespace-nowrap rounded-md px-2.5 py-1 transition ${active ? 'bg-terrain-700 font-semibold text-white' : 'text-slate-300/60 hover:text-slate-200'}`;

  const tabs: { id: View; label: string }[] = canDay
    ? [
        { id: 'lineDay', label: 'Vývoj — dny' },
        { id: 'lineRound', label: 'Vývoj — kola' },
        { id: 'bar', label: 'Denní zisk' },
      ]
    : [
        { id: 'lineRound', label: 'Vývoj — kola' },
        { id: 'bar', label: 'Zisk po kolech' },
      ];

  return (
    <div className="px-4">
      <div className="mb-2 flex gap-0.5 overflow-x-auto rounded-lg border border-line bg-panel p-0.5 text-[11px]">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setView(t.id); setHover(null); }} className={tabCls(effView === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {effView === 'bar'
        ? (() => {
            const byWeekday = canDay;
            const groups = byWeekday ? buildWeekday() : buildLine('round');
            if (groups.length === 0) return null;
            const totalsByGroup = groups.map((g) => players.reduce((s, p) => s + (g.pts[p] ?? 0), 0));
            const def = byWeekday ? totalsByGroup.indexOf(Math.max(...totalsByGroup)) : groups.length - 1;
            const sel = Math.min(Math.max(barSel ?? def, 0), groups.length - 1);
            const g = groups[sel] as { label: string; long?: string; pts: Record<string, number> };
            const rows = players.map((p) => ({ p, v: g.pts[p] ?? 0 })).sort((a, b) => b.v - a.v);
            const maxV = Math.max(1, ...rows.map((r) => r.v));

            const W = 360, H = 210, padL = 24, padR = 10, padT = 16, padB = 34;
            const plotW = W - padL - padR, plotH = H - padT - padB;
            const slot = plotW / rows.length, bw = Math.min(34, slot * 0.62), yB = padT + plotH;
            const niceMax = Math.max(2, Math.ceil(maxV / 2) * 2);
            const gy = (v: number) => padT + (1 - v / niceMax) * plotH;

            return (
              <>
                <div className="mb-2 flex gap-1 overflow-x-auto pb-0.5">
                  {groups.map((gg, i) => (
                    <button
                      key={i}
                      onClick={() => setBarSel(i)}
                      className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                        i === sel
                          ? 'border-pitch/60 bg-pitch/20 font-semibold text-pitch-light'
                          : 'border-line bg-panel text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {byWeekday ? gg.label : `${gg.label} kolo`}
                    </button>
                  ))}
                </div>

                <div className="rounded-xl border border-line bg-panel p-2">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bodový zisk podle dne v týdnu">
                    {[0, niceMax / 2, niceMax].map((v) => (
                      <g key={v}>
                        <line x1={padL} y1={gy(v)} x2={W - padR} y2={gy(v)} stroke="#173324" strokeWidth="1" />
                        <text x={padL - 4} y={gy(v) + 3} textAnchor="end" fontSize="8" fill="#64748b">{v}</text>
                      </g>
                    ))}
                    {rows.map((r, i) => {
                      const cx = padL + slot * (i + 0.5);
                      const h = (r.v / niceMax) * plotH;
                      return (
                        <g key={r.p}>
                          <rect x={cx - bw / 2} y={yB - h} width={bw} height={h} rx="2" fill={rankColor(i, rows.length)} />
                          <text x={cx} y={yB - h - 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#e2e8f0">{r.v}</text>
                          <text x={cx} y={yB + 6} textAnchor="end" fontSize="8" fill="#94a3b8" transform={`rotate(-35 ${cx} ${yB + 6})`}>{r.p}</text>
                        </g>
                      );
                    })}
                  </svg>
                  <div className="mt-1 px-1 text-center text-[10px] text-slate-500">
                    {byWeekday ? `${g.long} · součet bodů za celé MS` : `Body získané v ${g.label} kole`}
                  </div>
                </div>
              </>
            );
          })()
        : (() => {
            const groups = buildLine(effView === 'lineRound' ? 'round' : 'day');
            const series: Record<string, number[]> = {};
            for (const p of players) series[p] = [];
            const running: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
            for (const g of groups) for (const p of players) { running[p] += g.pts[p] ?? 0; series[p].push(running[p]); }

            const n = groups.length;
            const yMax = Math.ceil(Math.max(1, ...players.map((p) => running[p])) / 100) * 100 || 100;
            const W = 360, H = 220, padL = 30, padR = 34, padT = 12, padB = 22;
            const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
            const y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB);
            const gridY: number[] = [];
            for (let v = 0; v <= yMax; v += 200) gridY.push(v);
            const tickIdxs =
              n <= 6
                ? groups.map((_, i) => i)
                : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1].filter((v, i, a) => a.indexOf(v) === i);

            const onMove = (e: React.MouseEvent) => {
              const svg = svgRef.current;
              if (!svg || n === 0) return;
              const rect = svg.getBoundingClientRect();
              const px = ((e.clientX - rect.left) / rect.width) * W;
              let best = 0, bd = Infinity;
              for (let i = 0; i < n; i++) { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } }
              setHover(best);
            };
            const hoverList =
              hover == null ? [] : players.filter(isVisible).map((p) => ({ p, v: series[p][hover] })).sort((a, b) => b.v - a.v);

            return (
              <>
                <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {finals.map((f) => (
                    <button key={f.p} onClick={() => toggle(f.p)} className={`flex items-center gap-1.5 transition ${isVisible(f.p) ? '' : 'opacity-35'}`}>
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorOf(f.p) }} />
                      <span className="text-slate-200">{f.p}</span>
                      <span className="tabular-nums text-slate-400">{f.total}</span>
                    </button>
                  ))}
                </div>

                <div className="rounded-xl border border-line bg-panel p-2">
                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${W} ${H}`}
                    className="w-full touch-none"
                    role="img"
                    aria-label={effView === 'lineDay' ? 'Vývoj bodů po hracích dnech' : 'Vývoj bodů po kolech'}
                    onMouseMove={onMove}
                    onMouseLeave={() => setHover(null)}
                  >
                    {gridY.map((v) => (
                      <g key={v}>
                        <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#173324" strokeWidth="1" />
                        <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize="8" fill="#64748b">{v}</text>
                      </g>
                    ))}
                    {tickIdxs.map((i) => (
                      <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="#64748b">{groups[i]?.label}</text>
                    ))}
                    {hover != null && (
                      <line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB} stroke="#2f6b49" strokeWidth="1" strokeDasharray="3 3" />
                    )}
                    {players.map((p) => (
                      <polyline
                        key={p}
                        fill="none"
                        stroke={colorOf(p)}
                        strokeWidth={isVisible(p) ? 2 : 1}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        opacity={isVisible(p) ? 1 : 0.12}
                        points={series[p].map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                      />
                    ))}
                    {n > 0 &&
                      players.filter(isVisible).map((p) => (
                        <text key={p} x={x(n - 1) + 4} y={y(series[p][n - 1]) + 3} fontSize="9" fontWeight="700" fill={colorOf(p)}>
                          {series[p][n - 1]}
                        </text>
                      ))}
                    {hover != null &&
                      players.filter(isVisible).map((p) => (
                        <circle key={p} cx={x(hover)} cy={y(series[p][hover])} r="2.6" fill={colorOf(p)} stroke="#0a1a12" strokeWidth="1" />
                      ))}
                  </svg>

                  <div className="mt-1 min-h-[18px] px-1 text-center text-[10px] text-slate-500">
                    {hover == null ? (
                      effView === 'lineDay' ? 'najeď na graf pro detail dne →' : 'najeď na graf pro detail kola →'
                    ) : (
                      <span className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5">
                        <span className="font-semibold text-slate-300">
                          {effView === 'lineDay' ? groups[hover].label : `${groups[hover].label} kolo`}
                        </span>
                        {hoverList.map(({ p, v }) => (
                          <span key={p} className="inline-flex items-center gap-1">
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: colorOf(p) }} />
                            <span className="text-slate-300">{p}</span>
                            <span className="tabular-nums text-slate-400">{v}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SEASON RACE — konfigurace téhož grafu pro tabulku pořadí
//
//  Sdílí s historií barevnou škálu (`rankColor`) i tvar dat (`MatchPoint`).
//  Navíc umí: Body / Pořadí, výběr kola ukazovátkem i dotykem, detail kola
//  s posunem ▲▼, focus tipéra a scrubber.
// ─────────────────────────────────────────────────────────────────────────────

type RaceView = 'body' | 'poradi';

function SeasonRace({
  matches,
  players,
  interactionMode,
}: {
  matches: MatchPoint[];
  players: string[];
  interactionMode: 'hide' | 'focus';
}) {
  const [raceView, setRaceView] = useState<RaceView>('body');
  const [focused, setFocused] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const data = { matches, players };
  const rounds = matches.map((m) => m.round);
  const n = rounds.length;

  // Výchozí je poslední dohrané kolo.
  const selectedIndex = selected == null ? Math.max(0, n - 1) : Math.min(selected, n - 1);

  const cumulative = buildCumulativeSeries(data);
  const rankSeries = buildRankSeries(data);
  const snapshot = buildRoundSnapshot(data, selectedIndex);

  // Barvy podle konečného pořadí – stejná škála jako historie.
  const poradiCelkem = [...players].sort((a, b) =>
    (cumulative[b]?.at(-1) ?? 0) - (cumulative[a]?.at(-1) ?? 0) || a.localeCompare(b, 'cs'));
  const rankOf: Record<string, number> = Object.fromEntries(poradiCelkem.map((p, i) => [p, i]));
  const colorOf = (p: string) => rankColor(rankOf[p], Math.max(1, players.length));

  // Přehrávání sezony – jednoduchý interval, bez animační knihovny.
  useEffect(() => {
    if (!playing || n < 2) return;
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setPlaying(false); return; }

    const timer = setInterval(() => {
      setSelected((prev) => {
        const dalsi = (prev == null ? 0 : prev) + 1;
        if (dalsi >= n) { setPlaying(false); return n - 1; }
        return dalsi;
      });
    }, 900);
    return () => clearInterval(timer);
  }, [playing, n]);

  if (!hasEnoughRounds(data)) {
    return (
      <div className="px-4 py-6 text-center text-[11px] text-copy-muted">
        Graf se objeví po druhém odehraném kole.
      </div>
    );
  }

  const W = 360, H = 210, padL = 30, padR = 42, padT = 14, padB = 26;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);

  const yMaxBody = Math.max(1, ...players.map((p) => cumulative[p]?.at(-1) ?? 0));
  const yBody = (v: number) => padT + (1 - v / yMaxBody) * (H - padT - padB);
  // Pořadí: 1. místo NAHOŘE.
  const yRank = (pos: number) =>
    padT + ((pos - 1) / Math.max(1, players.length - 1)) * (H - padT - padB);

  const hodnota = (p: string, i: number) =>
    raceView === 'body' ? cumulative[p][i] : rankSeries[p][i];
  const y = (v: number) => (raceView === 'body' ? yBody(v) : yRank(v));

  const jeSkryty = (p: string) => interactionMode === 'hide' && hidden.has(p);
  const opacita = (p: string) => {
    if (jeSkryty(p)) return 0;
    if (interactionMode !== 'focus' || focused == null) return 1;
    return p === focused ? 1 : 0.2;
  };

  /** Výběr kola – jednotně pro myš, dotyk i pero. */
  const vyberKolo = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pomer = (e.clientX - rect.left) / rect.width;
    const vnitrni = (pomer * W - padL) / (W - padL - padR);
    setSelected(roundIndexFromRatio(vnitrni, n));
    setPlaying(false);
  };

  const klikNaHrace = (p: string) => {
    setPlaying(false);
    if (interactionMode === 'hide') {
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(p)) next.delete(p); else next.add(p);
        return next;
      });
      return;
    }
    setFocused((prev) => (prev === p ? null : p));
  };

  // Popisky na konci čar – s ošetřením překryvu.
  const koncoveY = poradiCelkem.map((p) => y(hodnota(p, n - 1)));
  const rozmistene = resolveLabelCollisions(koncoveY, 9);

  const vedouci = snapshot[0];
  const druhy = snapshot[1];
  const tabCls = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${
      active ? 'bg-surface-3 text-copy-primary' : 'text-copy-muted hover:text-copy-primary'}`;

  return (
    <div className="space-y-2">
      {/* souhrn vybraného kola */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <div className="text-[11px] font-semibold text-copy-primary">
          {rounds[selectedIndex]}. kolo
          {vedouci && <span className="ml-2 text-copy-muted">1. {vedouci.name} {vedouci.cumulative} b</span>}
        </div>
        {vedouci && druhy && (
          <div className="text-[10px] text-copy-muted">
            Rozdíl {vedouci.cumulative - druhy.cumulative} b
          </div>
        )}
      </div>

      {/* přepínač Body / Pořadí */}
      <div className="flex items-center gap-1 px-1">
        <button onClick={() => setRaceView('body')} className={tabCls(raceView === 'body')}>Body</button>
        <button onClick={() => setRaceView('poradi')} className={tabCls(raceView === 'poradi')}>Pořadí</button>
        {focused && (
          <button
            onClick={() => setFocused(null)}
            className="ml-auto rounded-md px-2 py-1 text-[10px] text-copy-muted hover:text-copy-primary"
          >
            Všichni
          </button>
        )}
      </div>

      {/*
        Dotykové chování: `touch-pan-y` nechá svislé posouvání stránky na
        prohlížeči (prst přes graf tedy stránku normálně posune) a vodorovná
        gesta si bere graf pro výběr kola. Zakázání všech gest by z grafu
        udělalo past přes celou šířku displeje.
      */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={raceView === 'body' ? 'Vývoj bodů po kolech' : 'Vývoj pořadí po kolech'}
        onPointerDown={vyberKolo}
        onPointerMove={(e) => {
          // Myš: stačí přejet. Dotyk: až při skutečném tažení.
          if (shouldSelectOnPointerMove(e.pointerType, e.buttons)) vyberKolo(e);
        }}
      >
        {[0, 0.5, 1].map((podil) => (
          <line
            key={podil}
            x1={padL} x2={W - padR}
            y1={padT + podil * (H - padT - padB)} y2={padT + podil * (H - padT - padB)}
            stroke="currentColor" strokeWidth="0.5" className="text-line-subtle"
          />
        ))}

        {/* svislé ukazovátko vybraného kola */}
        <line
          x1={x(selectedIndex)} x2={x(selectedIndex)} y1={padT} y2={H - padB}
          stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" className="text-copy-muted"
        />

        {poradiCelkem.map((p, i) => {
          if (jeSkryty(p)) return null;
          const body = Array.from({ length: n }, (_, idx) => `${x(idx)},${y(hodnota(p, idx))}`).join(' ');
          const zvyrazneny = interactionMode === 'focus' && focused === p;
          return (
            <g key={p} opacity={opacita(p)}>
              <polyline
                points={body} fill="none" stroke={colorOf(p)}
                strokeWidth={zvyrazneny ? 2.6 : 1.6}
                strokeLinejoin="round" strokeLinecap="round"
              />
              <circle cx={x(selectedIndex)} cy={y(hodnota(p, selectedIndex))} r={zvyrazneny ? 3 : 2.2} fill={colorOf(p)} />
              <text
                x={W - padR + 3} y={rozmistene[i] + 3}
                fontSize="7.5" fontWeight="700" fill={colorOf(p)}
                className="hidden sm:block"
              >
                {p.length > 7 ? `${p.slice(0, 7)}…` : p} {hodnota(p, n - 1)}
              </text>
            </g>
          );
        })}

        <text x={padL} y={H - 8} fontSize="8" className="fill-current text-copy-muted">{rounds[0]}. kolo</text>
        <text x={W - padR} y={H - 8} fontSize="8" textAnchor="end" className="fill-current text-copy-muted">
          {rounds[n - 1]}. kolo
        </text>
      </svg>

      {/* scrubber */}
      <div className="flex items-center gap-2 px-1">
        <button
          onClick={() => { setSelected(Math.max(0, selectedIndex - 1)); setPlaying(false); }}
          disabled={selectedIndex === 0}
          className="rounded-md px-2 py-1 text-xs text-copy-muted disabled:opacity-30"
          aria-label="Předchozí kolo"
        >◀</button>

        <input
          type="range" min={0} max={n - 1} value={selectedIndex}
          onChange={(e) => { setSelected(Number(e.target.value)); setPlaying(false); }}
          className="h-4 flex-1 accent-brand-primary"
          aria-label="Vybrané kolo"
        />

        <button
          onClick={() => { setSelected(Math.min(n - 1, selectedIndex + 1)); setPlaying(false); }}
          disabled={selectedIndex === n - 1}
          className="rounded-md px-2 py-1 text-xs text-copy-muted disabled:opacity-30"
          aria-label="Další kolo"
        >▶</button>

        <button
          onClick={() => { if (playing) setPlaying(false); else { setSelected(0); setPlaying(true); } }}
          className="rounded-md px-2 py-1 text-[10px] text-copy-muted hover:text-copy-primary"
        >
          {playing ? '❚❚' : '▶ Přehrát'}
        </button>
      </div>

      {/* detail vybraného kola – pod grafem, ne přes něj */}
      <div className="overflow-hidden rounded-lg border border-line-subtle">
        {snapshot.map((row) => {
          const zvyrazneny = interactionMode === 'focus' && focused === row.name;
          return (
            <button
              key={row.name}
              onClick={() => klikNaHrace(row.name)}
              className={`flex w-full items-center gap-2 border-b border-line-subtle px-2.5 py-1.5 text-left text-[11px] last:border-0 transition ${
                zvyrazneny ? 'bg-surface-3' : ''
              } ${jeSkryty(row.name) ? 'opacity-35' : ''}`}
            >
              <span className="w-4 shrink-0 tabular-nums text-copy-muted">{row.position}.</span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(row.name) }} />
              <span className={`min-w-0 flex-1 truncate ${zvyrazneny ? 'font-semibold text-copy-primary' : 'text-copy-primary'}`}>
                {row.name}
              </span>
              <span className="shrink-0 tabular-nums text-copy-primary">{row.cumulative} b</span>
              <span className="w-9 shrink-0 text-right tabular-nums text-state-success">
                {row.roundPoints > 0 ? `+${row.roundPoints}` : row.roundPoints}
              </span>
              <span className={`w-7 shrink-0 text-right tabular-nums ${
                row.movement > 0 ? 'text-state-success' : row.movement < 0 ? 'text-state-danger' : 'text-copy-muted'
              }`}>
                {movementLabel(row.movement)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="px-1 text-[9px] leading-snug text-copy-muted">
        Klepni na tipéra pro zvýraznění, tažením v grafu vyber kolo.
      </p>
    </div>
  );
}
