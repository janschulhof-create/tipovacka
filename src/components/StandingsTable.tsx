import type { StandingRow } from '@/lib/types';

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-slate-100/50">
        Zatím žádné body — tabulka se naplní po prvním odehraném kole.
      </p>
    );
  }

  return (
    <ol className="relative px-3 py-3">
      {/* tečkovaná „trať" spojující kontroly */}
      <span className="absolute bottom-7 left-[31px] top-7 -z-0 border-l border-dashed border-terrain-600" />
      {rows.map((r, i) => {
        const rank = i + 1;
        const podium = rank <= 3 ? `control-badge--${rank}` : '';
        return (
          <li
            key={r.player_id}
            className="relative z-10 flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-terrain-900/50"
          >
            <span className={`control-badge ${podium}`}>{rank}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-white">{r.name}</div>
              <div className="text-[11px] text-slate-100/45">
                🎯 {r.exact_hits}× přesně · Ø {r.avg_points} b
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-xl font-bold tabular-nums leading-none text-pitch-light">
                {r.points}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-300/40">bodů</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
