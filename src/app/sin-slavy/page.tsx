import Link from 'next/link';
import historie from '@/data/historie.json';
import { buildStat, type StatEntry } from '@/lib/stat';
import { StatTile } from '@/components/StatTile';

export const dynamic = 'force-dynamic';

type Stat = {
  points: number; tens: number; avgGoals: number; avgPoints: number;
  success: number; roundWins: number; zeros: number; missed: number;
  bestRound: number; bestRoundNo: number;
};
type Season = { season: string; players: string[]; stats: Record<string, Stat> };

// Síň slávy bere POUZE dokončené sezóny Chance ligy (zatím jedna).
// Probíhající testovací tipovačka MS se sem nezapočítává — ta je jen
// v živých statistikách na úvodní obrazovce. Další sezóny se přidají sem.
const seasons: Season[] = [historie as Season];

// hodnoty napříč sezónami i hráči (jeden záznam = výkon hráče v sezóně)
function flat(get: (s: Season, n: string) => number, sub?: (s: Season, n: string) => string): StatEntry[] {
  return seasons.flatMap((s) =>
    s.players.map((n) => ({ name: n, value: get(s, n), sub: sub ? sub(s, n) : s.season }))
  );
}

export default function SinSlavyPage() {
  // tituly = počet vítězství v sezóně
  const titles = new Map<string, number>();
  for (const s of seasons) {
    const w = s.players.reduce((a, b) => (s.stats[b].points > s.stats[a].points ? b : a));
    titles.set(w, (titles.get(w) ?? 0) + 1);
  }
  const titleEntries: StatEntry[] = [...titles.entries()].map(([name, value]) => ({ name, value }));

  const tiles = [
    { icon: '👑', label: 'Nejvíce vítězství v tipovačce',
      ...buildStat(titleEntries, 'max', (v) => `${v}×`) },
    { icon: '💯', label: 'Nejvíce bodů za sezónu',
      ...buildStat(flat((s, n) => s.stats[n].points), 'max', (v) => `${v} b`) },
    { icon: '🎯', label: 'Nejvíce přesných tipů za sezónu',
      ...buildStat(flat((s, n) => s.stats[n].tens), 'max', (v) => `${v}×`) },
    { icon: '🏅', label: 'Nejvíce vyhraných kol v sezóně',
      ...buildStat(flat((s, n) => s.stats[n].roundWins), 'max', (v) => `${v}×`) },
    { icon: '💥', label: 'Rekordní zisk za 1 kolo',
      ...buildStat(
        flat((s, n) => s.stats[n].bestRound, (s, n) => `${s.stats[n].bestRoundNo}. kolo, ${s.season}`),
        'max', (v) => `${v} b`) },
    { icon: '⚽', label: 'Největší střelec historie',
      ...buildStat(flat((s, n) => s.stats[n].avgGoals), 'max', (v) => `Ø ${v} g/tip`) },
    { icon: '🧱', label: 'Největší betonář historie',
      ...buildStat(flat((s, n) => s.stats[n].avgGoals), 'min', (v) => `Ø ${v} g/tip`) },
    { icon: '💀', label: 'Král nuličky (nejvíc nul)',
      ...buildStat(flat((s, n) => s.stats[n].zeros), 'max', (v) => `${v}× nula`) },
    { icon: '🧠', label: 'Mr. Alzheimer (nejvíc netipoval)',
      ...buildStat(flat((s, n) => s.stats[n].missed), 'max', (v) => `${v}× netipoval`) },
  ];

  return (
    <main>
      <header className="flex items-center gap-3 px-4 pb-2 pt-5">
        <Link href="/" className="text-slate-400">←</Link>
        <h1 className="text-lg font-bold">🏆 Síň slávy</h1>
      </header>
      <p className="px-4 pb-3 text-xs text-slate-500">
        Historické rekordy z dokončených sezón Chance ligy. Klepni na dlaždici pro TOP 6.
      </p>
      <div className="space-y-3 px-4">
        {tiles.map((t) => (
          <StatTile key={t.label} {...t} />
        ))}
      </div>
    </main>
  );
}
