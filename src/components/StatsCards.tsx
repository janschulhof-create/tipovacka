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
    { icon: '🎯', label: 'Nejvíce přesných tipů', who: mostExact?.name, val: mostExact ? `${mostExact.exact_hits}×` : '—' },
    { icon: '⚽', label: 'Největší střelec', who: topScorer?.name, val: topScorer ? `Ø ${topScorer.avg_pred_goals} g/zápas` : '—' },
    { icon: '🧱', label: 'Největší betonář', who: topDefender?.name, val: topDefender ? `Ø ${topDefender.avg_pred_goals} g/zápas` : '—' },
    { icon: '📈', label: 'Průměr bodů na zápas', who: bestAvg?.name, val: bestAvg ? `${bestAvg.avg_points}` : '—' },
    // Zobraz jen když už někdo nějakou nulu/absenci má (jinak by to bylo "0×")
    { icon: '💀', label: 'Král nuličky', who: kralNulicky && kralNulicky.zeros > 0 ? kralNulicky.name : '—', val: kralNulicky && kralNulicky.zeros > 0 ? `${kralNulicky.zeros}× nula` : '—' },
    { icon: '🧠', label: 'Mr. Alzheimer', who: mrAlzheimer && mrAlzheimer.missed > 0 ? mrAlzheimer.name : '—', val: mrAlzheimer && mrAlzheimer.missed > 0 ? `${mrAlzheimer.missed}× netipoval` : '—' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 px-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-line bg-panel p-3">
          <div className="text-xs text-slate-400">
            {c.icon} {c.label}
          </div>
          <div className="mt-1 text-base font-semibold">{c.who ?? '—'}</div>
          <div className="text-xs text-brand">{c.val}</div>
        </div>
      ))}
    </div>
  );
}
