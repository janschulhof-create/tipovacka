'use client';

import { useState } from 'react';
import type { StandingRow } from '@/lib/types';

export function StandingsTable({
  rows,
  liveInc = {},
  hasLive = false,
}: {
  rows: StandingRow[];
  liveInc?: Record<string, number>;
  hasLive?: boolean;
}) {
  const [live, setLive] = useState(false);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-slate-100/50">
        Zatím žádné body — tabulka se naplní po prvním odehraném kole.
      </p>
    );
  }

  const showLive = hasLive && live;
  const baseRank = new Map(rows.map((r, i) => [r.name, i + 1]));
  const liveData = rows.map((r) => ({ r, inc: liveInc[r.name] ?? 0, total: r.points + (liveInc[r.name] ?? 0) }));
  const sorted = showLive ? [...liveData].sort((a, b) => b.total - a.total) : liveData;

  return (
    <div>
      {hasLive && (
        <div className="flex items-center justify-end gap-2 border-b border-terrain-700 px-4 py-2.5">
          <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${live ? 'text-flag' : 'text-slate-300/45'}`}>
            {live && <span className="live-dot" />} Živé pořadí
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={live}
            aria-label="Živé pořadí"
            onClick={() => setLive((v) => !v)}
            className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${live ? 'bg-flag' : 'bg-terrain-600'}`}
          >
            <span className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all ${live ? 'left-[18px]' : 'left-[2px]'}`} />
          </button>
        </div>
      )}

      <ol className="relative px-3 py-3">
        <span className="absolute bottom-7 left-[31px] top-7 -z-0 border-l border-dashed border-terrain-600" />
        {sorted.map((d, i) => {
          const r = d.r;
          const rank = i + 1;
          const podium = rank <= 3 ? `control-badge--${rank}` : '';
          const move = showLive ? (baseRank.get(r.name) ?? rank) - rank : 0;
          const total = showLive ? d.total : r.points;
          return (
            <li key={r.player_id} className="relative z-10 flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-terrain-900/50">
              <span className={`control-badge ${podium}`}>{rank}</span>

              {showLive && (
                <span className="flex w-6 shrink-0 items-center justify-center text-[11px] font-bold tabular-nums">
                  {move > 0 ? (
                    <span className="flex items-center text-pitch-light">▲<span className="ml-0.5">{move}</span></span>
                  ) : move < 0 ? (
                    <span className="flex items-center text-flag">▼<span className="ml-0.5">{-move}</span></span>
                  ) : (
                    <span className="text-slate-300/30">–</span>
                  )}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-white">{r.name}</div>
                <div className="text-[11px] text-slate-100/45">
                  🎯 {r.exact_hits}× přesně · Ø {r.avg_points} b
                </div>
              </div>

              {showLive && (
                <span className={`shrink-0 font-display text-sm font-bold tabular-nums ${d.inc > 0 ? 'text-flag' : 'text-slate-300/35'}`}>
                  +{d.inc}
                </span>
              )}

              <div className="w-12 shrink-0 text-right">
                <div className="font-display text-xl font-bold tabular-nums leading-none text-pitch-light">{total}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-300/40">bodů</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
