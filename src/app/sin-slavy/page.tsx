import Link from 'next/link';
import historie from '@/data/historie.json';

export const dynamic = 'force-dynamic';

type Stat = {
  points: number;
  tens: number;
  avgGoals: number;
  avgPoints: number;
  success: number;
  roundWins: number;
  zeros: number;
  missed: number;
};
type Season = { season: string; players: string[]; stats: Record<string, Stat> };

// Dokončené sezóny Chance ligy (zatím jedna – první sezóna).
// Síň slávy NEbere z probíhající testovací tipovačky MS, ale z reálných
// odehraných sezón. Až přibudou další, stačí je přidat do pole.
const seasons: Season[] = [historie as Season];

export default function SinSlavyPage() {
  // vítěz každé sezóny → počet titulů
  const titles = new Map<string, number>();
  for (const s of seasons) {
    const winner = s.players.reduce((a, b) => (s.stats[b].points > s.stats[a].points ? b : a));
    titles.set(winner, (titles.get(winner) ?? 0) + 1);
  }
  const titleRows = [...titles.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const bestSeasonPoints = pick(seasons, (s, n) => s.stats[n].points, 'max');
  const bestSeasonExact = pick(seasons, (s, n) => s.stats[n].tens, 'max');
  const topScorer = pick(seasons, (s, n) => s.stats[n].avgGoals, 'max');
  const topDefender = pick(seasons, (s, n) => s.stats[n].avgGoals, 'min');
  const mostRoundWins = pick(seasons, (s, n) => s.stats[n].roundWins, 'max');
  const kralNulicky = pick(seasons, (s, n) => s.stats[n].zeros, 'max');
  const mrAlzheimer = pick(seasons, (s, n) => s.stats[n].missed, 'max');

  return (
    <main>
      <header className="flex items-center gap-3 px-4 pb-2 pt-5">
        <Link href="/" className="text-slate-400">←</Link>
        <h1 className="text-lg font-bold">🏆 Síň slávy</h1>
      </header>
      <p className="px-4 pb-3 text-xs text-slate-500">
        Historické rekordy z dokončených sezón Chance ligy.
      </p>

      <div className="space-y-3 px-4">
        <Hof icon="👑" label="Nejvíce vítězství v tipovačce"
          rows={titleRows.map((t) => `${t.name} — ${t.count}×`)} />
        <Hof icon="💯" label="Nejvíce bodů za sezónu"
          rows={[`${bestSeasonPoints.names} — ${bestSeasonPoints.val} b (${bestSeasonPoints.season})`]} />
        <Hof icon="🎯" label="Nejvíce přesných tipů za sezónu"
          rows={[`${bestSeasonExact.names} — ${bestSeasonExact.val}× (${bestSeasonExact.season})`]} />
        <Hof icon="🏅" label="Nejvíce vyhraných kol v sezóně"
          rows={[`${mostRoundWins.names} — ${mostRoundWins.val}× (${mostRoundWins.season})`]} />
        <Hof icon="⚽" label="Největší střelec historie"
          rows={[`${topScorer.names} — Ø ${topScorer.val} g/tip (${topScorer.season})`]} />
        <Hof icon="🧱" label="Největší betonář historie"
          rows={[`${topDefender.names} — Ø ${topDefender.val} g/tip (${topDefender.season})`]} />
        <Hof icon="💀" label="Král nuličky (nejvíc nul)"
          rows={[`${kralNulicky.names} — ${kralNulicky.val}× nula bodů (${kralNulicky.season})`]} />
        <Hof icon="🧠" label="Mr. Alzheimer (nejvíc netipoval)"
          rows={[`${mrAlzheimer.names} — ${mrAlzheimer.val}× netipoval (${mrAlzheimer.season})`]} />
      </div>
    </main>
  );
}

function Hof({ icon, label, rows }: { icon: string; label: string; rows: string[] }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{icon} {label}</div>
      <ul className="mt-2 space-y-1">
        {rows.map((r, i) => (
          <li key={i} className="text-base font-semibold">{r}</li>
        ))}
      </ul>
    </div>
  );
}

function pick(seasons: Season[], val: (s: Season, n: string) => number, dir: 'max' | 'min') {
  let best: { val: number; season: string } | null = null;
  const winners: { name: string; season: string }[] = [];
  for (const s of seasons)
    for (const n of s.players) {
      const v = val(s, n);
      if (!best || (dir === 'max' ? v > best.val : v < best.val)) {
        best = { val: v, season: s.season };
        winners.length = 0;
        winners.push({ name: n, season: s.season });
      } else if (best && v === best.val && s.season === best.season) {
        winners.push({ name: n, season: s.season });
      }
    }
  return {
    names: winners.map((w) => w.name).join(', '),
    val: best!.val,
    season: best!.season,
  };
}
