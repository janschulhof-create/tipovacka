'use client';

import { useRef, useState } from 'react';

type Tip = { pts: number | null };
type Match = { tips: Record<string, Tip> };
type Round = { round: number; matches: Match[] };

// stejná paleta i pořadí jako StandingsChart → shodné barvy hráčů
const PALETTE = ['#22c55e', '#ff5a2c', '#38bdf8', '#f5b301', '#e6007e', '#a78bfa'];

/** Vývoj POŘADÍ po kolech (1 = nahoře). Barvy shodné s grafem bodů. */
export function PositionsChart({ rounds, players }: { rounds: Round[]; players: string[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // kumulativní body po kolech → pořadí po kolech
  const cum: Record<string, number[]> = Object.fromEntries(players.map((p) => [p, []]));
  const running: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  for (const r of rounds) {
    for (const p of players) {
      let add = 0;
      for (const m of r.matches) {
        const t = m.tips[p];
        if (t && t.pts != null) add += t.pts;
      }
      running[p] += add;
      cum[p].push(running[p]);
    }
  }
  const n = rounds.length;
  const N = players.length;

  // pozice (1..N) v každém kole podle kumulativních bodů
  const pos: Record<string, number[]> = Object.fromEntries(players.map((p) => [p, []]));
  for (let i = 0; i < n; i++) {
    const order = [...players].sort((a, b) => cum[b][i] - cum[a][i]);
    order.forEach((p, idx) => pos[p].push(idx + 1));
  }

  const finalOrder = [...players].sort((a, b) => (pos[a][n - 1] ?? 99) - (pos[b][n - 1] ?? 99));

  const W = 360, H = 220;
  const padL = 24, padR = 34, padT = 12, padB = 22;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
  const y = (place: number) => padT + ((place - 1) / Math.max(1, N - 1)) * (H - padT - padB);

  const colorOf = (p: string) => PALETTE[players.indexOf(p) % PALETTE.length];
  const isVisible = (p: string) => !hidden.has(p);
  const xTicks = [1, Math.round(n / 3), Math.round((2 * n) / 3), n].filter(
    (v, i, a) => v >= 1 && a.indexOf(v) === i
  );

  const toggle = (p: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
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

  const hoverList =
    hover == null ? []
      : players.filter(isVisible).map((p) => ({ p, place: pos[p][hover] })).sort((a, b) => a.place - b.place);

  return (
    <div className="px-4">
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {finalOrder.map((p) => (
          <button
            key={p}
            onClick={() => toggle(p)}
            className={`flex items-center gap-1.5 transition ${isVisible(p) ? '' : 'opacity-35'}`}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorOf(p) }} />
            <span className="text-slate-200">{p}</span>
            <span className="tabular-nums text-slate-400">{pos[p][n - 1]}.</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-panel p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          role="img"
          aria-label="Vývoj pořadí po kolech"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* vodorovná mřížka + popisky pozic 1..N */}
          {Array.from({ length: N }, (_, k) => k + 1).map((place) => (
            <g key={place}>
              <line x1={padL} y1={y(place)} x2={W - padR} y2={y(place)} stroke="#25324f" strokeWidth="1" />
              <text x={padL - 4} y={y(place) + 3} textAnchor="end" fontSize="8" fill="#64748b">{place}.</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t - 1)} y={H - 6} textAnchor="middle" fontSize="8" fill="#64748b">{t}.</text>
          ))}

          {hover != null && (
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB} stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
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
              points={pos[p].map((place, i) => `${x(i)},${y(place)}`).join(' ')}
            />
          ))}

          {n > 0 &&
            players.filter(isVisible).map((p) => (
              <text key={p} x={x(n - 1) + 4} y={y(pos[p][n - 1]) + 3} fontSize="9" fontWeight="700" fill={colorOf(p)}>
                {pos[p][n - 1]}.
              </text>
            ))}

          {hover != null &&
            players.filter(isVisible).map((p) => (
              <circle key={p} cx={x(hover)} cy={y(pos[p][hover])} r="2.6" fill={colorOf(p)} stroke="#0b1220" strokeWidth="1" />
            ))}
        </svg>

        <div className="mt-1 min-h-[18px] px-1 text-center text-[10px] text-slate-500">
          {hover == null ? (
            'najeď na graf pro pořadí v daném kole →'
          ) : (
            <span className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5">
              <span className="font-semibold text-slate-300">{rounds[hover].round}. kolo:</span>
              {hoverList.map(({ p, place }) => (
                <span key={p} className="inline-flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: colorOf(p) }} />
                  <span className="text-slate-300">{p}</span>
                  <span className="tabular-nums text-slate-400">{place}.</span>
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
