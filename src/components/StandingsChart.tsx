type Tip = { h: number | null; a: number | null; pts: number | null };
type Match = { tips: Record<string, Tip> };
type Round = { round: number; matches: Match[] };

// barvy hráčů (pořadí dle vstupu)
const PALETTE = ['#22c55e', '#fb7185', '#38bdf8', '#f5b301', '#a78bfa', '#f97316'];

export function StandingsChart({
  rounds,
  players,
}: {
  rounds: Round[];
  players: string[];
}) {
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
  const finals = players.map((p) => ({ p, total: running[p] }));
  const yMaxRaw = Math.max(...finals.map((f) => f.total));
  const yMax = Math.ceil(yMaxRaw / 100) * 100 || 100;

  // geometrie
  const W = 360, H = 220;
  const padL = 30, padR = 10, padT = 10, padB = 22;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB);

  const gridY = [];
  for (let v = 0; v <= yMax; v += 200) gridY.push(v);

  const colorOf = (p: string) => PALETTE[players.indexOf(p) % PALETTE.length];
  const xTicks = [1, Math.round(n / 3), Math.round((2 * n) / 3), n].filter(
    (v, i, a) => v >= 1 && a.indexOf(v) === i
  );

  return (
    <div className="px-4">
      {/* legenda */}
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {finals
          .sort((a, b) => b.total - a.total)
          .map((f) => (
            <span key={f.p} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: colorOf(f.p) }}
              />
              <span className="text-slate-200">{f.p}</span>
              <span className="tabular-nums text-slate-400">{f.total}</span>
            </span>
          ))}
      </div>

      <div className="rounded-xl border border-line bg-panel p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Vývoj bodů po kolech">
          {/* vodorovná mřížka + popisky osy Y */}
          {gridY.map((v) => (
            <g key={v}>
              <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#1f2b44" strokeWidth="1" />
              <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize="8" fill="#64748b">
                {v}
              </text>
            </g>
          ))}
          {/* popisky osy X */}
          {xTicks.map((t) => (
            <text key={t} x={x(t - 1)} y={H - 6} textAnchor="middle" fontSize="8" fill="#64748b">
              {t}.
            </text>
          ))}
          {/* čáry hráčů */}
          {players.map((p) => (
            <polyline
              key={p}
              fill="none"
              stroke={colorOf(p)}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={series[p].map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            />
          ))}
        </svg>
        <div className="pt-1 text-center text-[10px] text-slate-500">kolo →</div>
      </div>
    </div>
  );
}
