import type { StandingRow, GoalStatRow, MissRow } from '@/lib/types';
import { StatCard } from './StatCard';

type Row = { name: string; val: string; n?: number };

function rank<T>(arr: T[], name: (x: T) => string, pick: (x: T) => number, dir: 'max' | 'min', fmt: (x: T) => string): Row[] {
  return [...arr]
    .sort((a, b) => (dir === 'max' ? pick(b) - pick(a) : pick(a) - pick(b)))
    .map((x) => ({ name: name(x), val: fmt(x), n: pick(x) }));
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
  const cards: { icon: string; accent: string; label: string; rows: Row[]; scale?: boolean }[] = [
    { icon: '🎯', accent: 'text-pitch-light', label: 'Nejvíce přesných tipů', scale: true, rows: rank(standings, (s) => s.name, (s) => s.exact_hits, 'max', (s) => `${s.exact_hits}×`) },
    { icon: '📈', accent: 'text-pitch-light', label: 'Průměr bodů na zápas', scale: true, rows: rank(standings, (s) => s.name, (s) => s.avg_points, 'max', (s) => Number(s.avg_points).toFixed(2)) },
    { icon: '⚽', accent: 'text-flag', label: 'Největší střelec', scale: true, rows: rank(goals, (g) => g.name, (g) => g.avg_pred_goals, 'max', (g) => `Ø ${g.avg_pred_goals} g`) },
    { icon: '🧱', accent: 'text-sky-400', label: 'Největší betonář', scale: true, rows: rank(goals, (g) => g.name, (g) => g.avg_pred_goals, 'min', (g) => `Ø ${g.avg_pred_goals} g`) },
    { icon: '💀', accent: 'text-control', label: 'Král nuličky', scale: true, rows: rank(misses, (m) => m.name, (m) => m.zeros, 'max', (m) => `${m.zeros}× nula`) },
    { icon: '🧠', accent: 'text-control', label: 'Mr. Alzheimer', scale: true, rows: rank(misses, (m) => m.name, (m) => m.missed, 'max', (m) => `${m.missed}× netipoval`) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}
