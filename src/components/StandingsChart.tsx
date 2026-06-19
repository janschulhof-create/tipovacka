'use client';

import { useRef, useState } from 'react';

type MatchPoint = { round: number; kickoff?: string; pts: Record<string, number> };
type View = 'lineDay' | 'lineRound' | 'bar';

const PALETTE = ['#22c55e', '#ff5a2c', '#38bdf8', '#f5b301', '#e6007e', '#a78bfa'];

// pevná TZ (shodná s výpisem zápasů) → stejné „hrací dny" jako v seznamu a žádný hydration mismatch
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' });

// barva sloupce dle podílu bodů: 0 → červená, max → zelená
const barColor = (v: number, max: number) => {
  if (max <= 0) return 'hsl(220,8%,42%)';
  const hue = Math.round((v / max) * 130); // 0=červená … 130=zelená
  return `hsl(${hue},66%,46%)`;
};

export function StandingsChart({
  matches,
  players,
}: {
  matches: MatchPoint[];
  players: string[];
}) {
  const canDay = matches.length > 0 && matches.every((m) => !!m.kickoff);
  const [view, setView] = useState<View>(canDay ? 'lineDay' : 'lineRound');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const [barIdx, setBarIdx] = useState<number | null>(null); // vybraný den/kolo pro sloupcový graf
  const svgRef = useRef<SVGSVGElement>(null);

  const effView: View = view === 'lineDay' && !canDay ? 'lineRound' : view;

  // seskupení zápasů do skupin (den/kolo); zápasy jsou už seřazené dle kickoffu/kola
  const buildGroups = (gmode: 'day' | 'round') => {
    const gs: { label: string; pts: Record<string, number> }[] = [];
    const idxByKey = new Map<string, number>();
    for (const m of matches) {
      const key = gmode === 'day' ? dayKey(m.kickoff as string) : `r${m.round}`;
      const label = gmode === 'day' ? dayLabel(m.kickoff as string) : `${m.round}.`;
      let gi = idxByKey.get(key);
      if (gi == null) {
        gi = gs.length;
        idxByKey.set(key, gi);
        gs.push({ label, pts: {} });
      }
      const g = gs[gi];
      for (const p of players) g.pts[p] = (g.pts[p] ?? 0) + (m.pts[p] ?? 0);
    }
    return gs;
  };

  const colorOf = (p: string) => PALETTE[players.indexOf(p) % PALETTE.length];
  const isVisible = (p: string) => !hidden.has(p);
  const toggle = (p: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  // celkové pořadí (legenda)
  const totals: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  for (const m of matches) for (const p of players) totals[p] += m.pts[p] ?? 0;
  const finals = players.map((p) => ({ p, total: totals[p] })).sort((a, b) => b.total - a.total);

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
      {/* přepínač zobrazení */}
      <div className="mb-2 flex gap-0.5 overflow-x-auto rounded-lg border border-line bg-panel p-0.5 text-[11px]">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setView(t.id); setHover(null); }} className={tabCls(effView === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {effView === 'bar'
        ? (() => {
            const groups = buildGroups(canDay ? 'day' : 'round');
            if (groups.length === 0) return null;
            const sel = Math.min(Math.max(barIdx ?? groups.length - 1, 0), groups.length - 1);
            const g = groups[sel];
            const rows = players
              .map((p) => ({ p, v: g.pts[p] ?? 0 }))
              .sort((a, b) => b.v - a.v);
            const maxV = Math.max(1, ...rows.map((r) => r.v));

            const W = 360, H = 210;
            const padL = 24, padR = 10, padT = 16, padB = 34;
            const plotW = W - padL - padR, plotH = H - padT - padB;
            const slot = plotW / rows.length;
            const bw = Math.min(34, slot * 0.62);
            const yB = padT + plotH;
            const niceMax = Math.max(2, Math.ceil(maxV / 2) * 2);
            const gy = (v: number) => padT + (1 - v / niceMax) * plotH;
            const grid = [0, niceMax / 2, niceMax];

            return (
              <>
                {/* výběr dne / kola */}
                <div className="mb-2 flex gap-1 overflow-x-auto pb-0.5">
                  {groups.map((gg, i) => (
                    <button
                      key={i}
                      onClick={() => setBarIdx(i)}
                      className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                        i === sel
                          ? 'border-pitch/60 bg-pitch/20 font-semibold text-pitch-light'
                          : 'border-line bg-panel text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {canDay ? gg.label : `${gg.label} kolo`}
                    </button>
                  ))}
                </div>

                <div className="rounded-xl border border-line bg-panel p-2">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bodový zisk za den">
                    {grid.map((v) => (
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
                          <rect x={cx - bw / 2} y={yB - h} width={bw} height={h} rx="2" fill={barColor(r.v, maxV)} />
                          <text x={cx} y={yB - h - 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#e2e8f0">{r.v}</text>
                          <text
                            x={cx}
                            y={yB + 6}
                            textAnchor="end"
                            fontSize="8"
                            fill="#94a3b8"
                            transform={`rotate(-35 ${cx} ${yB + 6})`}
                          >
                            {r.p}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  <div className="mt-1 px-1 text-center text-[10px] text-slate-500">
                    {canDay ? `Body získané ${g.label}` : `Body získané v ${g.label} kole`} · zelená = nejvíc, červená = nejméně
                  </div>
                </div>
              </>
            );
          })()
        : (() => {
            const groups = buildGroups(effView === 'lineRound' ? 'round' : 'day');
            const series: Record<string, number[]> = {};
            for (const p of players) series[p] = [];
            const running: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
            for (const g of groups) for (const p of players) { running[p] += g.pts[p] ?? 0; series[p].push(running[p]); }

            const n = groups.length;
            const yMaxRaw = Math.max(1, ...players.map((p) => running[p]));
            const yMax = Math.ceil(yMaxRaw / 100) * 100 || 100;

            const W = 360, H = 220;
            const padL = 30, padR = 34, padT = 12, padB = 22;
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
                {/* legenda – klikací přepínání hráčů */}
                <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {finals.map((f) => (
                    <button
                      key={f.p}
                      onClick={() => toggle(f.p)}
                      className={`flex items-center gap-1.5 transition ${isVisible(f.p) ? '' : 'opacity-35'}`}
                    >
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
