import Link from 'next/link';
import {
  getAllStandings,
  getAllGoalStats,
  getSeasonNames,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function SinSlavyPage() {
  const [standings, goals, seasonNames] = await Promise.all([
    getAllStandings(),
    getAllGoalStats(),
    getSeasonNames(),
  ]);

  // Nejvíce bodů za sezónu (jeden řádek = jeden hráč v jedné sezóně)
  const bestSeasonPoints = max(standings, (s) => s.points);
  // Nejvíce přesných tipů za sezónu
  const bestSeasonExact = max(standings, (s) => s.exact_hits);
  // Střelec / betonář historie (průměr přes všechny tipy hráče napříč sezónami)
  const scorer = byPlayerAvg(goals, 'max');
  const defender = byPlayerAvg(goals, 'min');
  // Počet vítězství: kolikrát hráč skončil v sezóně na 1. místě
  const titles = countTitles(standings);

  return (
    <main>
      <header className="flex items-center gap-3 px-4 pb-2 pt-5">
        <Link href="/" className="text-slate-400">←</Link>
        <h1 className="text-lg font-bold">🏆 Síň slávy</h1>
      </header>

      <div className="space-y-3 px-4 pt-2">
        <Hof
          icon="👑"
          label="Nejvíce vítězství v tipovačce"
          rows={titles.map((t) => `${t.name} — ${t.count}×`)}
        />
        <Hof
          icon="💯"
          label="Nejvíce bodů za sezónu"
          rows={bestSeasonPoints ? [`${bestSeasonPoints.name} — ${bestSeasonPoints.points} b (${seasonNames[bestSeasonPoints.season_id] ?? ''})`] : []}
        />
        <Hof
          icon="🎯"
          label="Nejvíce přesných tipů za sezónu"
          rows={bestSeasonExact ? [`${bestSeasonExact.name} — ${bestSeasonExact.exact_hits}× (${seasonNames[bestSeasonExact.season_id] ?? ''})`] : []}
        />
        <Hof
          icon="⚽"
          label="Největší střelec historie"
          rows={scorer ? [`${scorer.name} — Ø ${scorer.avg} g/zápas`] : []}
        />
        <Hof
          icon="🧱"
          label="Největší betonář historie"
          rows={defender ? [`${defender.name} — Ø ${defender.avg} g/zápas`] : []}
        />
      </div>
    </main>
  );
}

function Hof({ icon, label, rows }: { icon: string; label: string; rows: string[] }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {icon} {label}
      </div>
      {rows.length ? (
        <ul className="mt-2 space-y-1">
          {rows.map((r, i) => (
            <li key={i} className="text-base font-semibold">
              {r}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Zatím bez dat.</p>
      )}
    </div>
  );
}

// ---- pomocné agregace ----
function max<T>(arr: T[], pick: (x: T) => number): T | null {
  return arr.length ? arr.reduce((b, c) => (pick(c) > pick(b) ? c : b)) : null;
}

function byPlayerAvg(
  goals: { name: string; total_pred_goals: number; predictions_count: number }[],
  dir: 'max' | 'min'
) {
  const agg = new Map<string, { goals: number; n: number }>();
  for (const g of goals) {
    const cur = agg.get(g.name) ?? { goals: 0, n: 0 };
    agg.set(g.name, { goals: cur.goals + g.total_pred_goals, n: cur.n + g.predictions_count });
  }
  let best: { name: string; avg: number } | null = null;
  for (const [name, v] of agg) {
    if (v.n === 0) continue;
    const avg = +(v.goals / v.n).toFixed(2);
    if (!best || (dir === 'max' ? avg > best.avg : avg < best.avg)) best = { name, avg };
  }
  return best;
}

function countTitles(standings: { name: string; season_id: number; points: number }[]) {
  const bySeason = new Map<number, { name: string; points: number }>();
  for (const s of standings) {
    const cur = bySeason.get(s.season_id);
    if (!cur || s.points > cur.points) bySeason.set(s.season_id, { name: s.name, points: s.points });
  }
  const counts = new Map<string, number>();
  for (const { name } of bySeason.values()) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
