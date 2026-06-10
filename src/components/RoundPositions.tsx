'use client';

import { useState } from 'react';

type Tip = { pts: number | null };
type Round = { round: number; matches: { tips: Record<string, Tip> }[] };

/** Body hráče za jedno kolo. */
function roundPoints(r: Round, players: string[]): Record<string, number> {
  const pts: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  for (const m of r.matches)
    for (const [n, t] of Object.entries(m.tips)) if (t.pts != null) pts[n] += t.pts;
  return pts;
}

/** Tabulka: pořadí (1.–3. místo) po jednotlivých kolech. */
export function RoundPositions({
  rounds,
  players,
}: {
  rounds: Round[];
  players: string[];
}) {
  const [allRounds, setAllRounds] = useState(false);
  const rows = rounds.map((r) => {
    const pts = roundPoints(r, players);
    const sorted = [...players].sort((a, b) => pts[b] - pts[a]);
    return {
      round: r.round,
      podium: sorted.slice(0, 3).map((n) => ({ name: n, pts: pts[n] })),
    };
  });
  const shown = allRounds ? rows : rows.slice(0, 8);

  return (
    <div className="panel-flush">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-300/60">
            <th className="px-3 py-2 font-medium">Kolo</th>
            <th className="px-2 py-2 font-medium">🥇 1.</th>
            <th className="px-2 py-2 font-medium">🥈 2.</th>
            <th className="px-2 py-2 font-medium">🥉 3.</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.round} className="border-t border-terrain-700">
              <td className="px-3 py-2 tabular-nums text-slate-300/60">{r.round}.</td>
              {r.podium.map((p, i) => (
                <td key={i} className="px-2 py-2">
                  <span className="font-medium text-white">{p.name}</span>
                  <span className="ml-1 text-xs tabular-nums text-slate-300/45">{p.pts}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 8 && (
        <button
          onClick={() => setAllRounds((v) => !v)}
          className="w-full border-t border-terrain-700 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-300/70 transition hover:bg-terrain-900/40"
        >
          {allRounds ? '▲ Sbalit' : `▼ Zobrazit všech ${rows.length} kol`}
        </button>
      )}
    </div>
  );
}
