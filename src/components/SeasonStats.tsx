'use client';

import { StatCard } from './StatCard';
import { computePerPlayer, funFacts, type SRound, type RankRow } from '@/lib/seasonStats';
import type { MissRow } from '@/lib/types';

export function SeasonStats({
  rounds,
  players,
  stoppage = [],
  wizard = [],
  spodina = [],
  misses = [],
  continents = [],
  regions = [],
}: {
  rounds: SRound[];
  players: string[];
  stoppage?: { name: string; balance: number; affected: number }[];
  wizard?: { name: string; count: number }[];
  spodina?: { name: string; count: number }[];
  misses?: MissRow[];
  continents?: { key: string; label: string; icon: string; rows: { name: string; points: number; matches: number }[] }[];
  regions?: { key: string; label: string; icon: string; rows: { name: string; points: number; matches: number }[] }[];
}) {
  if (players.length === 0) {
    const emptyCards = [
      { icon: '🏅', label: 'Nejvíce vyhraných kol', accent: 'text-pitch-light' },
      { icon: '💥', label: 'Rekord za 1 kolo', accent: 'text-flag' },
      { icon: '💀', label: 'Král nuličky', accent: 'text-control' },
      { icon: '🧠', label: 'Mr. Alzheimer', accent: 'text-control' },
      { icon: '🧙', label: 'Černokněžník (bodoval jako jediný)', accent: 'text-purple-400' },
      { icon: '🤡', label: 'Blamáž (jako jediný nebodoval)', accent: 'text-red-400' },
      { icon: '🎓', label: 'Profesorský fotbal', accent: 'text-slate-300' },
      { icon: '🍀', label: 'Faktor smůly (smolař)', accent: 'text-flag' },
      { icon: '⏱️', label: 'Pán nastavení', accent: 'text-green-400' },
      { icon: '🔁', label: 'Nejčastější tip', accent: 'text-pitch-light' },
      { icon: '🟢', label: 'Čitelný tip (nejčastěji vyšel)', accent: 'text-green-400' },
      { icon: '🔴', label: 'Nečitelný tip (nejčastěji 0 b)', accent: 'text-red-400' },
      { icon: '🎯', label: 'Nejlíp čitelný tým', accent: 'text-pitch-light' },
      { icon: '🌀', label: 'Nejhůř čitelný tým', accent: 'text-control' },
      { icon: '😱', label: 'Překvapení sezóny', accent: 'text-control' },
      { icon: '✅', label: 'Jistota sezóny', accent: 'text-pitch-light' },
    ];

    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {emptyCards.map((card) => (
          <StatCard key={card.label} {...card} rows={[]} />
        ))}
      </div>
    );
  }
  const pp = computePerPlayer(rounds, players);
  const ff = funFacts(rounds, players);

  const rank = (pick: (n: string) => number, dir: 'max' | 'min', fmt: (n: string) => string): RankRow[] =>
    [...players]
      .sort((a, b) => (dir === 'max' ? pick(b) - pick(a) : pick(a) - pick(b)))
      .map((pl) => ({ name: pl, val: fmt(pl), n: pick(pl) }));

  const missRank = (pick: (m: MissRow) => number, fmt: (m: MissRow) => string): RankRow[] =>
    [...misses].sort((a, b) => pick(b) - pick(a)).map((m) => ({ name: m.name, val: fmt(m), n: pick(m) }));

  const fmtBal = (b: number) => (b > 0 ? `+${b} b` : b < 0 ? `\u2212${Math.abs(b)} b` : '0 b');
  const stoppageRows: RankRow[] = stoppage.map((r) => ({ name: r.name, val: fmtBal(r.balance), n: r.balance }));

  // Pořadí karet = logické dvojice (po řádcích, 2 sloupce). Všechny mají škálu min→max.
  const cards: { icon: string; label: string; accent: string; rows: RankRow[]; scale?: boolean; scaleInvert?: boolean }[] = [
    { icon: '🏅', label: 'Nejvíce vyhraných kol', accent: 'text-pitch-light', scale: true, rows: rank((n) => pp[n].roundWins, 'max', (n) => `${pp[n].roundWins}×`) },
    { icon: '💥', label: 'Rekord za 1 kolo', accent: 'text-flag', scale: true, rows: rank((n) => pp[n].bestRound, 'max', (n) => `${pp[n].bestRound} b · ${pp[n].bestRoundNo}. kolo`) },
    { icon: '💀', label: 'Král nuličky', accent: 'text-control', scale: true, scaleInvert: true, rows: missRank((m) => m.zeros, (m) => `${m.zeros}× nula`) },
    { icon: '🧠', label: 'Mr. Alzheimer', accent: 'text-control', scale: true, scaleInvert: true, rows: missRank((m) => m.missed, (m) => `${m.missed}× netipoval`) },
    { icon: '🧙', label: 'Černokněžník (bodoval jako jediný)', accent: 'text-purple-400', scale: true, rows: wizard.map((w) => ({ name: w.name, val: `${w.count}×`, n: w.count })) },
    { icon: '🤡', label: 'Blamáž (jako jediný nebodoval)', accent: 'text-red-400', scale: true, scaleInvert: true, rows: spodina.map((w) => ({ name: w.name, val: `${w.count}×`, n: w.count })) },
    { icon: '🎓', label: 'Profesorský fotbal', accent: 'text-slate-300', scale: true, rows: ff.professorRows },
    { icon: '🍀', label: 'Faktor smůly (smolař)', accent: 'text-flag', scale: true, scaleInvert: true, rows: ff.unluckyRows },
    { icon: '⏱️', label: 'Pán nastavení', accent: 'text-green-400', scale: true, rows: stoppageRows },
    { icon: '🔁', label: 'Nejčastější tip', accent: 'text-pitch-light', scale: true, rows: ff.tipRows },
    { icon: '🟢', label: 'Čitelný tip (nejčastěji vyšel)', accent: 'text-green-400', scale: true, rows: ff.readableRows },
    { icon: '🔴', label: 'Nečitelný tip (nejčastěji 0 b)', accent: 'text-red-400', scale: true, scaleInvert: true, rows: ff.unreadableRows },
    { icon: '🎯', label: 'Nejlíp čitelný tým', accent: 'text-pitch-light', scale: true, rows: ff.teamRows },
    { icon: '🌀', label: 'Nejhůř čitelný tým', accent: 'text-control', scale: true, scaleInvert: true, rows: [...ff.teamRows].reverse() },
    { icon: '😱', label: 'Překvapení sezóny', accent: 'text-control', scale: true, scaleInvert: true, rows: ff.surpriseRows },
    { icon: '✅', label: 'Jistota sezóny', accent: 'text-pitch-light', scale: true, rows: ff.bankerRows },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      {continents.length > 0 && (
        <div>
          <h2 className="eyebrow mb-3">
            <span className="flag-chip" /> 🌍 Pořadí podle kontinentů
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {continents.map((c) => (
              <StatCard
                key={c.key}
                icon={c.icon}
                label={c.label}
                accent="text-pitch-light"
                scale
                rows={c.rows.map((r) => ({ name: r.name, val: `${r.points} b`, n: r.points }))}
              />
            ))}
          </div>
        </div>
      )}


      {regions.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="eyebrow">
              <span className="flag-chip" /> 🗺️ Pořadí podle regionů
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-100/40">
              Body z utkání týmů daného regionu. Meziregionální zápas se započítá do obou regionů.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {regions.map((region) => (
              <StatCard
                key={region.key}
                icon={region.icon}
                label={region.label}
                accent="text-pitch-light"
                scale
                rows={region.rows.map((row) => ({
                  name: row.name,
                  val: `${row.points} b · ${row.matches} z.`,
                  n: row.points,
                }))}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
