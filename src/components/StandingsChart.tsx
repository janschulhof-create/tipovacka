'use client';

import { useRef, useState } from 'react';

type Tip = { h?: number | null; a?: number | null; pts: number | null };
type Match = { tips: Record<string, Tip> };
type Round = { round: number; matches: Match[] };

// barvy hráčů (pořadí dle vstupu)
const PALETTE = ['#22c55e', '#ff5a2c', '#38bdf8', '#f5b301', '#e6007e', '#a78bfa'];

export function StandingsChart({
  rounds,
  players,
}: {
  rounds: Round[];
  players: string[];
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // kumulativní body po kolech
  const series: Record<string, number[]> = {};
  for (const p of players) series[p] = [];
  const running: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  for (const r of rounds) {
    for (const p of players) {
      let add = 0;
      for (const m of r.matches) {
        const t = m.tips[p];
        if (t && t.pts != null) add += t.pts;
      }
      running[p] += add;
      series[p].push(running[p]);
    }
  }

  const n = rounds.length;
  const finals = players.map((p) => ({ p, total: running[p] })).sort((a, b) => b.total - a.total);
  const yMaxRaw = Math.max(1, ...finals.map((f) => f.total));
  const yMax = Math.ceil(yMaxRaw / 100) * 100 || 100;

  const W = 360, H = 220;
  const padL = 30, padR = 34, padT = 12, padB = 22;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB);

  const gridY: number[] = [];
  for (let v = 0; v <= yMax; v += 200) gridY.push(v);

  const colorOf = (p: string) => PALETTE[players.indexOf(p) % PALETTE.length];
  const isVisible = (p: string) => !hidden.has(p);
  const xTicks = [1, Math.round(n / 3), Math.round((2 * n) / 3), n].filter(
    (v, i, a) => v >= 1 && a.indexOf(v) === i
  );

  const toggle = (p: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - px);
      if (d < bd) { bd = d; best = i; }
    }
    setHover(best);
  };

  // tooltip data při hoveru
  const hoverList =
    hover == null
      ? []
      : players
          .filter(isVisible)
          .map((p) => ({ p, v: series[p][hover] }))
          .sort((a, b) => b.v - a.v);

  return (
    <div className="px-4">
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
          aria-label="Vývoj bodů po kolech"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* vodorovná mřížka + osa Y */}
          {gridY.map((v) => (
            <g key={v}>
              <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#173324" strokeWidth="1" />
              <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize="8" fill="#64748b">{v}</text>
            </g>
          ))}
          {/* osa X */}
          {xTicks.map((t) => (
            <text key={t} x={x(t - 1)} y={H - 6} textAnchor="middle" fontSize="8" fill="#64748b">{t}.</text>
          ))}

          {/* hover svislá linka */}
          {hover != null && (
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB} stroke="#2f6b49" strokeWidth="1" strokeDasharray="3 3" />
          )}

          {/* čáry hráčů */}
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

          {/* celkový počet bodů na konci každé čáry */}
          {n > 0 &&
            players.filter(isVisible).map((p) => (
              <text
                key={p}
                x={x(n - 1) + 4}
                y={y(series[p][n - 1]) + 3}
                fontSize="9"
                fontWeight="700"
                fill={colorOf(p)}
              >
                {series[p][n - 1]}
              </text>
            ))}

          {/* tečky na hoveru */}
          {hover != null &&
            players.filter(isVisible).map((p) => (
              <circle key={p} cx={x(hover)} cy={y(series[p][hover])} r="2.6" fill={colorOf(p)} stroke="#0a1a12" strokeWidth="1" />
            ))}
        </svg>

        {/* tooltip – kolo + hodnoty */}
        <div className="mt-1 min-h-[18px] px-1 text-center text-[10px] text-slate-500">
          {hover == null ? (
            'najeď na graf pro detail kola →'
          ) : (
            <span className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5">
              <span className="font-semibold text-slate-300">{rounds[hover].round}. kolo:</span>
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
    </div>
  );
}
