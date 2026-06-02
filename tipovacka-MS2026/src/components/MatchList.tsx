import type { Match } from '@/lib/types';

function fmt(iso: string) {
  return new Date(iso).toLocaleString('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MatchList({ matches }: { matches: Match[] }) {
  return (
    <ul className="divide-y divide-line">
      {matches.map((m) => {
        const done = m.status === 'finished';
        const live = m.status === 'live';
        return (
          <li key={m.id} className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">
                <span className="font-medium">{m.home_team}</span>
                <span className="text-slate-500"> – </span>
                <span className="font-medium">{m.away_team}</span>
              </div>
              <div className="text-xs text-slate-400">{fmt(m.kickoff)}</div>
            </div>
            <div className="ml-3 shrink-0 text-right">
              {done || live ? (
                <span className={`tabular-nums text-sm font-bold ${live ? 'text-brand' : ''}`}>
                  {m.home_score ?? 0}:{m.away_score ?? 0}
                </span>
              ) : (
                <span className="text-xs text-slate-500">—</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
