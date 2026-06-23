'use client';

import { StatCard } from './StatCard';
import { computePerPlayer, funFacts, type SRound, type RankRow } from '@/lib/seasonStats';

export function SeasonStats({
  rounds,
  players,
  stoppage = [],
}: {
  rounds: SRound[];
  players: string[];
  stoppage?: { name: string; balance: number; affected: number }[];
}) {
  if (players.length === 0) {
    return <p className="px-1 text-sm text-slate-100/45">Statistiky se objeví, jakmile padnou první výsledky.</p>;
  }
  const pp = computePerPlayer(rounds, players);
  const ff = funFacts(rounds, players);

  const rank = (pick: (n: string) => number, dir: 'max' | 'min', fmt: (n: string) => string): RankRow[] =>
    [...players].sort((a, b) => (dir === 'max' ? pick(b) - pick(a) : pick(a) - pick(b))).map((n) => ({ name: n, val: fmt(n) }));

  const fmtBal = (b: number) => (b > 0 ? `+${b} b` : b < 0 ? `\u2212${Math.abs(b)} b` : '0 b');
  const stoppageRows: RankRow[] = stoppage.map((r) => ({ name: r.name, val: fmtBal(r.balance), n: r.balance }));

  // Pořadí karet = logické dvojice (po řádcích, 2 sloupce).
  const cards: { icon: string; label: string; accent: string; rows: RankRow[]; scale?: boolean }[] = [
    { icon: '🏅', label: 'Nejvíce vyhraných kol', accent: 'text-pitch-light', rows: rank((n) => pp[n].roundWins, 'max', (n) => `${pp[n].roundWins}×`) },
    { icon: '💥', label: 'Rekord za 1 kolo', accent: 'text-flag', rows: rank((n) => pp[n].bestRound, 'max', (n) => `${pp[n].bestRound} b · ${pp[n].bestRoundNo}. kolo`) },
    { icon: '🎓', label: 'Profesorský fotbal', accent: 'text-slate-300', rows: ff.professorRows },
    { icon: '🍀', label: 'Faktor smůly (smolař)', accent: 'text-flag', rows: ff.unluckyRows },
    { icon: '⏱️', label: 'Pán nastavení', accent: 'text-green-400', scale: true, rows: stoppageRows },
    { icon: '🔁', label: 'Nejčastější tip', accent: 'text-pitch-light', rows: ff.tipRows },
    { icon: '🟢', label: 'Čitelný tip (nejčastěji vyšel)', accent: 'text-green-400', rows: ff.readableRows },
    { icon: '🔴', label: 'Nečitelný tip (nejčastěji 0 b)', accent: 'text-red-400', rows: ff.unreadableRows },
    { icon: '🎯', label: 'Nejlíp čitelný tým', accent: 'text-pitch-light', rows: ff.teamRows },
    { icon: '🌀', label: 'Nejhůř čitelný tým', accent: 'text-control', rows: [...ff.teamRows].reverse() },
    { icon: '😱', label: 'Překvapení sezóny', accent: 'text-control', rows: ff.surpriseRows },
    { icon: '✅', label: 'Jistota sezóny', accent: 'text-pitch-light', rows: ff.bankerRows },
  ].filter((c) => c.rows.length > 0);

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}
