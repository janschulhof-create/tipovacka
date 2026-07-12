import { StatCard } from '@/components/StatCard';
import { funFacts, wizardSpodina, type SRound } from '@/lib/seasonStats';

export type HofStat = {
  points: number; tens: number; avgGoals: number; avgPoints: number;
  success: number; roundWins: number; zeros: number; missed: number;
  bestRound: number; bestRoundNo: number;
};
export type HofSeason = {
  season: string;
  players: string[];
  stats: Record<string, HofStat>;
  rounds: SRound[];
};

type Row = { name: string; val: string; n?: number };

/** Top 6 umístění: kolikrát hráč skončil na 1.–6. místě v kole. */
function positionCounts(s: HofSeason) {
  const counts: Record<string, number[]> = Object.fromEntries(s.players.map((p) => [p, [0, 0, 0, 0, 0, 0]]));
  for (const r of s.rounds) {
    const pts: Record<string, number> = Object.fromEntries(s.players.map((p) => [p, 0]));
    for (const m of r.matches)
      for (const [n, t] of Object.entries(m.tips)) if (t.pts != null && pts[n] != null) pts[n] += t.pts;
    for (const p of s.players) {
      const place = 1 + s.players.filter((q) => pts[q] > pts[p]).length;
      if (place >= 1 && place <= 6) counts[p][place - 1]++;
    }
  }
  return counts;
}

/**
 * Rekordy a zajímavosti JEDNÉ soutěže. Použito pro Chance ligu i MS zvlášť —
 * díky tomu se výsledky nikdy nemíchají dohromady.
 * `extraCards` = statistiky, které dávají smysl jen u některé soutěže
 * (např. Pán nastavení a kontinenty u MS).
 */
export function HallOfFameSection({
  s,
  titleRows,
  extraCards = [],
}: {
  s: HofSeason;
  titleRows?: Row[];
  extraCards?: { icon: string; label: string; accent: string; rows: Row[] }[];
}) {
  const rank = (val: (x: HofStat) => number, dir: 'max' | 'min', fmt: (x: HofStat) => string): Row[] =>
    [...s.players]
      .sort((a, b) => (dir === 'max' ? val(s.stats[b]) - val(s.stats[a]) : val(s.stats[a]) - val(s.stats[b])))
      .map((n) => ({ name: n, val: fmt(s.stats[n]), n: val(s.stats[n]) }));

  const ff = funFacts(s.rounds, s.players);
  const { wizardRows, spodinaRows } = wizardSpodina(s.rounds);

  // Zlatý Netrefený míč — nejvíc nul
  const worst = [...s.players].sort((a, b) => s.stats[b].zeros - s.stats[a].zeros)[0];

  const recordCards: { icon: string; label: string; accent: string; rows: Row[] }[] = [
    ...(titleRows?.length ? [{ icon: '👑', label: 'Nejvíce vítězství', accent: 'text-gold', rows: titleRows }] : []),
    { icon: '💯', label: 'Nejvíce bodů', accent: 'text-pitch-light', rows: rank((x) => x.points, 'max', (x) => `${x.points} b`) },
    { icon: '🎯', label: 'Nejvíce přesných tipů', accent: 'text-pitch-light', rows: rank((x) => x.tens, 'max', (x) => `${x.tens}× desítka`) },
    { icon: '💥', label: 'Nejlepší kolo', accent: 'text-flag', rows: rank((x) => x.bestRound, 'max', (x) => `${x.bestRound} b (${x.bestRoundNo}. kolo)`) },
    { icon: '📈', label: 'Nejvyšší průměr na zápas', accent: 'text-pitch-light', rows: rank((x) => x.avgPoints, 'max', (x) => `${x.avgPoints}`) },
    { icon: '🏅', label: 'Nejvíce vyhraných kol', accent: 'text-pitch-light', rows: rank((x) => x.roundWins, 'max', (x) => `${x.roundWins}×`) },
    { icon: '💀', label: 'Král nuličky', accent: 'text-control', rows: rank((x) => x.zeros, 'max', (x) => `${x.zeros}× nula`) },
    { icon: '🧠', label: 'Mr. Alzheimer', accent: 'text-control', rows: rank((x) => x.missed, 'max', (x) => `${x.missed}× netipoval`) },
    { icon: '⚽', label: 'Největší střelec', accent: 'text-flag', rows: rank((x) => x.avgGoals, 'max', (x) => `Ø ${x.avgGoals} g/tip`) },
    { icon: '🧱', label: 'Největší betonář', accent: 'text-sky-400', rows: rank((x) => x.avgGoals, 'min', (x) => `Ø ${x.avgGoals} g/tip`) },
    { icon: '🧙', label: 'Černokněžník (bodoval jako jediný)', accent: 'text-purple-400', rows: wizardRows },
    { icon: '🤡', label: 'Blamáž (jako jediný nebodoval)', accent: 'text-red-400', rows: spodinaRows },
  ].filter((c) => c.rows.length > 0);

  const factCards: { icon: string; label: string; accent: string; rows: Row[] }[] = [
    { icon: '🎓', label: 'Profesorský fotbal', accent: 'text-slate-300', rows: ff.professorRows },
    { icon: '🍀', label: 'Faktor smůly (smolař)', accent: 'text-flag', rows: ff.unluckyRows },
    { icon: '🔁', label: 'Nejčastější tip', accent: 'text-pitch-light', rows: ff.tipRows },
    { icon: '🟢', label: 'Čitelný tip (nejčastěji vyšel)', accent: 'text-green-400', rows: ff.readableRows },
    { icon: '🔴', label: 'Nečitelný tip (nejčastěji 0 b)', accent: 'text-red-400', rows: ff.unreadableRows },
    { icon: '🎯', label: 'Nejlíp čitelný tým', accent: 'text-pitch-light', rows: ff.teamRows },
    { icon: '🌀', label: 'Nejhůř čitelný tým', accent: 'text-control', rows: [...ff.teamRows].reverse() },
    { icon: '😱', label: 'Překvapení sezóny', accent: 'text-control', rows: ff.surpriseRows },
    { icon: '✅', label: 'Jistota sezóny', accent: 'text-pitch-light', rows: ff.bankerRows },
    ...extraCards,
  ].filter((c) => c.rows.length > 0);

  const counts = positionCounts(s);
  const ranking = [...s.players].sort((a, b) => s.stats[b].points - s.stats[a].points);

  return (
    <>
      {worst && s.stats[worst].zeros > 0 && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-gold/40 bg-gold/5 p-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            🥇 Zlatý Netrefený míč
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-white">{worst}</div>
          <div className="text-sm text-slate-100/60">
            {s.stats[worst].zeros}× tip za nula bodů — největší smolař ({s.season}).
          </div>
        </div>
      )}

      <h2 className="eyebrow mb-2"><span className="flag-chip" /> Rekordy</h2>
      <p className="mb-2 text-[11px] text-slate-100/40">Klepni na kartu pro celé pořadí.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {recordCards.map((c) => (
          <StatCard key={c.label} {...c} scale />
        ))}
      </div>

      <h2 className="eyebrow mb-2 mt-8"><span className="flag-chip" /> Další zajímavosti</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {factCards.map((c) => (
          <StatCard key={c.label} {...c} scale />
        ))}
      </div>

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
    </>
  );
}
