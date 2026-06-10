import type { StandingRow, GoalStatRow, MissRow } from '@/lib/types';

function leader<T>(arr: T[], pick: (x: T) => number, dir: 'max' | 'min' = 'max') {
  if (arr.length === 0) return null;
  return arr.reduce((best, cur) =>
    (dir === 'max' ? pick(cur) > pick(best) : pick(cur) < pick(best)) ? cur : best
  );
}

export function StatsCards({
  standings,
  goals,
  misses = [],
}: {
  standings: StandingRow[];
  goals: GoalStatRow[];
  misses?: MissRow[];
}) {
  const mostExact = leader(standings, (s) => s.exact_hits);
  const topScorer = leader(goals, (g) => g.avg_pred_goals, 'max');
  const topDefender = leader(goals, (g) => g.avg_pred_goals, 'min');
  const bestAvg = leader(standings, (s) => s.avg_points);
  const kralNulicky = leader(misses, (m) => m.zeros);
  const mrAlzheimer = leader(misses, (m) => m.missed);

  const cards = [
    { icon: '🎯', accent: 'text-pitch-light', label: 'Nejvíce přesných tipů', who: mostExact?.name, val: mostExact ? `${mostExact.exact_hits}×` : '—' },
    { icon: '📈', accent: 'text-pitch-light', label: 'Průměr bodů na zápas', who: bestAvg?.name, val: bestAvg ? `${bestAvg.avg_points}` : '—' },
    { icon: '⚽', accent: 'text-flag', label: 'Největší střelec', who: topScorer?.name, val: topScorer ? `Ø ${topScorer.avg_pred_goals} g` : '—' },
    { icon: '🧱', accent: 'text-sky-400', label: 'Největší betonář', who: topDefender?.name, val: topDefender ? `Ø ${topDefender.avg_pred_goals} g` : '—' },
    { icon: '💀', accent: 'text-control', label: 'Král nuličky', who: kralNulicky && kralNulicky.zeros > 0 ? kralNulicky.name : '—', val: kralNulicky && kralNulicky.zeros > 0 ? `${kralNulicky.zeros}× nula` : '—' },
    { icon: '🧠', accent: 'text-control', label: 'Mr. Alzheimer', who: mrAlzheimer && mrAlzheimer.missed > 0 ? mrAlzheimer.name : '—', val: mrAlzheimer && mrAlzheimer.missed > 0 ? `${mrAlzheimer.missed}× netipoval` : '—' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="panel group p-3.5 transition hover:border-terrain-600">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-100/50">
            <span className="text-base">{c.icon}</span>
            <span className="leading-tight">{c.label}</span>
          </div>
          <div className="mt-2 truncate font-display text-lg font-semibold text-white">
            {c.who ?? '—'}
          </div>
          <div className={`text-sm font-medium ${c.accent}`}>{c.val}</div>
        </div>
      ))}
    </div>
  );
}
