import historie from '@/data/historie.json';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

type Tip = { pts: number | null };
type Round = { round: number; matches: { tips: Record<string, Tip> }[] };
type Stat = {
  points: number; tens: number; avgGoals: number; avgPoints: number;
  success: number; roundWins: number; zeros: number; missed: number;
  bestRound: number; bestRoundNo: number;
};
type Season = { season: string; players: string[]; stats: Record<string, Stat>; rounds: Round[] };

// Síň slávy bere POUZE dokončené sezóny Chance ligy (zatím jedna).
// Probíhající testovací MS se sem NEzapočítává.
const seasons: Season[] = [historie as Season];
const h = seasons[0];

// --- Top 6 umístění: kolikrát hráč skončil na 1.–6. místě v kole ---
function positionCounts(season: Season) {
  const counts: Record<string, number[]> = Object.fromEntries(
    season.players.map((p) => [p, [0, 0, 0, 0, 0, 0]])
  );
  for (const r of season.rounds) {
    const pts: Record<string, number> = Object.fromEntries(season.players.map((p) => [p, 0]));
    for (const m of r.matches)
      for (const [n, t] of Object.entries(m.tips)) if (t.pts != null) pts[n] += t.pts;
    for (const p of season.players) {
      // standardní pořadí: místo = 1 + počet hráčů s víc body
      const place = 1 + season.players.filter((q) => pts[q] > pts[p]).length;
      if (place >= 1 && place <= 6) counts[p][place - 1]++;
    }
  }
  return counts;
}

export default function SinSlavyPage() {
  const titles = new Map<string, number>();
  for (const s of seasons) {
    const winner = s.players.reduce((a, b) => (s.stats[b].points > s.stats[a].points ? b : a));
    titles.set(winner, (titles.get(winner) ?? 0) + 1);
  }
  const titleRows = [...titles.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  const bestSeasonPoints = pick(seasons, (s, n) => s.stats[n].points, 'max');
  const bestSeasonExact = pick(seasons, (s, n) => s.stats[n].tens, 'max');
  const topScorer = pick(seasons, (s, n) => s.stats[n].avgGoals, 'max');
  const topDefender = pick(seasons, (s, n) => s.stats[n].avgGoals, 'min');
  const mostRoundWins = pick(seasons, (s, n) => s.stats[n].roundWins, 'max');
  const bestAvg = pick(seasons, (s, n) => s.stats[n].avgPoints, 'max');
  const kralNulicky = pick(seasons, (s, n) => s.stats[n].zeros, 'max');
  const mrAlzheimer = pick(seasons, (s, n) => s.stats[n].missed, 'max');

  let recMax = -1;
  const recHolders: string[] = [];
  for (const s of seasons)
    for (const n of s.players) {
      const v = s.stats[n].bestRound;
      if (v > recMax) { recMax = v; recHolders.length = 0; }
      if (v === recMax) recHolders.push(`${n} (${s.stats[n].bestRoundNo}. kolo)`);
    }

  const counts = positionCounts(h);
  const ranking = [...h.players].sort((a, b) => h.stats[b].points - h.stats[a].points);

  return (
    <main>
      <PageHeader icon="🏆" title="Síň slávy" subtitle="Rekordy historie" />
      <p className="mb-4 text-xs text-slate-100/45">
        Historické rekordy z dokončených sezón Chance ligy ({h.season}).
      </p>

      {/* Zlatý Netrefený míč — vtipná anti-cena za nejvíc nul */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-gold/40 bg-gold/5 p-5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
          🥇 Zlatý Netrefený míč
        </div>
        <div className="mt-1 font-display text-2xl font-bold text-white">{kralNulicky.names}</div>
        <div className="text-sm text-slate-100/60">
          {kralNulicky.val}× tip za nula bodů — největší smolař sezóny.
        </div>
      </div>

      {/* Historické rekordy */}
      <h2 className="eyebrow mb-2"><span className="flag-chip" /> Historické rekordy</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Hof icon="👑" label="Nejvíce vítězství" rows={titleRows.map((t) => `${t.name} — ${t.count}×`)} />
        <Hof icon="💯" label="Nejvíce bodů za sezónu" rows={[`${bestSeasonPoints.names} — ${bestSeasonPoints.val} b`]} />
        <Hof icon="🎯" label="Nejvíce přesných tipů" rows={[`${bestSeasonExact.names} — ${bestSeasonExact.val}× desítka`]} />
        <Hof icon="💥" label="Nejlepší kolo" rows={[`${recMax} b — ${recHolders.join(', ')}`]} />
        <Hof icon="📈" label="Nejvyšší průměr na zápas" rows={[`${bestAvg.names} — ${bestAvg.val}`]} />
        <Hof icon="🏅" label="Nejvíce vyhraných kol" rows={[`${mostRoundWins.names} — ${mostRoundWins.val}×`]} />
        <Hof icon="⚽" label="Největší střelec" rows={[`${topScorer.names} — Ø ${topScorer.val} g/tip`]} />
        <Hof icon="🧱" label="Největší betonář" rows={[`${topDefender.names} — Ø ${topDefender.val} g/tip`]} />
        <Hof icon="🧠" label="Mr. Alzheimer (nejvíc netipoval)" rows={[`${mrAlzheimer.names} — ${mrAlzheimer.val}×`]} />
      </div>

      {/* Top 6 umístění */}
      <h2 className="eyebrow mb-2 mt-8"><span className="flag-chip" /> Top 6 umístění (četnost v kolech)</h2>
      <div className="panel-flush">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-300/60">
              <th className="px-3 py-2 font-medium">Hráč</th>
              {['1.', '2.', '3.', '4.', '5.', '6.'].map((p) => (
                <th key={p} className="px-2 py-2 text-center font-medium">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranking.map((n) => (
              <tr key={n} className="border-t border-terrain-700">
                <td className="px-3 py-2 font-medium text-white">{n}</td>
                {counts[n].map((c, i) => (
                  <td key={i} className={`px-2 py-2 text-center tabular-nums ${i === 0 && c > 0 ? 'font-bold text-gold' : 'text-slate-100/70'}`}>
                    {c || '·'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Hof({ icon, label, rows }: { icon: string; label: string; rows: string[] }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-100/50">
        <span className="text-base">{icon}</span> {label}
      </div>
      <ul className="mt-2 space-y-1">
        {rows.map((r, i) => (
          <li key={i} className="font-display text-base font-semibold text-white">{r}</li>
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
  return { names: winners.map((w) => w.name).join(', '), val: best!.val, season: best!.season };
}
