import type { StandingRow, GoalStatRow, MissRow } from '@/lib/types';
import { buildStat, type StatEntry } from '@/lib/stat';
import { StatTile } from './StatTile';

export function StatsCards({
  standings,
  goals,
  misses = [],
}: {
  standings: StandingRow[];
  goals: GoalStatRow[];
  misses?: MissRow[];
}) {
  const E = <T,>(rows: T[], name: (r: T) => string, value: (r: T) => number): StatEntry[] =>
    rows.map((r) => ({ name: name(r), value: value(r) }));

  const tiles = [
    {
      icon: '🎯', label: 'Nejvíce přesných tipů',
      ...buildStat(E(standings, (s) => s.name, (s) => s.exact_hits), 'max', (v) => `${v}×`),
    },
    {
      icon: '📈', label: 'Průměr bodů na zápas',
      ...buildStat(E(standings, (s) => s.name, (s) => s.avg_points), 'max', (v) => `${v}`),
    },
    {
      icon: '⚽', label: 'Největší střelec',
      ...buildStat(E(goals, (g) => g.name, (g) => g.avg_pred_goals), 'max', (v) => `Ø ${v} g/zápas`),
    },
    {
      icon: '🧱', label: 'Největší betonář',
      ...buildStat(E(goals, (g) => g.name, (g) => g.avg_pred_goals), 'min', (v) => `Ø ${v} g/zápas`),
    },
    {
      icon: '💀', label: 'Král nuličky',
      ...buildStat(E(misses, (m) => m.name, (m) => m.zeros), 'max', (v) => `${v}× nula`, { hideIfZero: true }),
    },
    {
      icon: '🧠', label: 'Mr. Alzheimer',
      ...buildStat(E(misses, (m) => m.name, (m) => m.missed), 'max', (v) => `${v}× netipoval`, { hideIfZero: true }),
    },
  ];

  return (
    <div className="grid grid-cols-2 items-start gap-3 px-4">
      {tiles.map((t) => (
        <StatTile key={t.label} {...t} />
      ))}
    </div>
  );
}
