'use client';

import { useState } from 'react';
import { StandingsChart } from './StandingsChart';
import { pointsTextClass } from '@/lib/points';

type Tip = { h: number | null; a: number | null; pts: number | null };
type Match = {
  home: string;
  away: string;
  hs: number | null;
  as: number | null;
  tips: Record<string, Tip>;
};
type Round = { round: number; matches: Match[] };
type Stat = {
  points: number;
  tens: number;
  avgGoals: number;
  avgPoints: number;
  success: number;
  count: number;
  roundWins: number;
  zeros: number;
  missed: number;
  bestRound: number;
  bestRoundNo: number;
};
export type Historie = {
  season: string;
  players: string[];
  rounds: Round[];
  stats: Record<string, Stat>;
};

function leaderName(stats: Record<string, Stat>, pick: (s: Stat) => number, dir: 'max' | 'min' = 'max') {
  const entries = Object.entries(stats);
  const best = entries.reduce((b, c) =>
    (dir === 'max' ? pick(c[1]) > pick(b[1]) : pick(c[1]) < pick(b[1])) ? c : b
  );
  const val = pick(best[1]);
  const names = entries.filter(([, s]) => pick(s) === val).map(([n]) => n);
  return { names: names.join(', '), val };
}

export function HistorieView({ data }: { data: Historie }) {
  const ranked = [...data.players].sort((a, b) => data.stats[b].points - data.stats[a].points);
  const winner = ranked[0];

  const exact = leaderName(data.stats, (s) => s.tens);
  const scorer = leaderName(data.stats, (s) => s.avgGoals, 'max');
  const defender = leaderName(data.stats, (s) => s.avgGoals, 'min');
  const bestAvg = leaderName(data.stats, (s) => s.avgPoints);
  const roundKing = leaderName(data.stats, (s) => s.roundWins);
  const kralNulicky = leaderName(data.stats, (s) => s.zeros);
  const mrAlzheimer = leaderName(data.stats, (s) => s.missed);

  // rekord za jedno kolo (s podporou shody – více hráčů se stejným maximem)
  const maxRound = Math.max(...data.players.map((p) => data.stats[p].bestRound));
  const recordHolders = data.players
    .filter((p) => data.stats[p].bestRound === maxRound)
    .map((p) => `${p} (${data.stats[p].bestRoundNo}. kolo)`)
    .join(', ');

  // dvojice dlaždic, které logicky patří k sobě
  const cards = [
    { icon: '🎯', label: 'Nejvíce přesných tipů', who: exact.names, val: `${exact.val}× desítka` },
    { icon: '🏅', label: 'Nejvíce vyhraných kol', who: roundKing.names, val: `${roundKing.val}×` },
    { icon: '💥', label: 'Rekord za 1 kolo', who: recordHolders, val: `${maxRound} b` },
    { icon: '📈', label: 'Průměr bodů na zápas', who: bestAvg.names, val: `${bestAvg.val}` },
    { icon: '⚽', label: 'Největší střelec', who: scorer.names, val: `Ø ${scorer.val} g/tip` },
    { icon: '🧱', label: 'Největší betonář', who: defender.names, val: `Ø ${defender.val} g/tip` },
    { icon: '💀', label: 'Král nuličky', who: kralNulicky.names, val: `${kralNulicky.val}× nula bodů` },
    { icon: '🧠', label: 'Mr. Alzheimer', who: mrAlzheimer.names, val: `${mrAlzheimer.val}× netipoval` },
  ];

  return (
    <div className="space-y-6">
      {/* Vítěz sezóny */}
      <div className="mx-4 rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/15 to-transparent p-5 text-center">
        <div className="text-xs uppercase tracking-wide text-gold">Vítěz 1. sezóny ({data.season})</div>
        <div className="mt-1 text-3xl font-extrabold">🏆 {winner}</div>
        <div className="text-sm text-slate-300">{data.stats[winner].points} bodů</div>
      </div>

      {/* Finální tabulka */}
      <section>
        <h2 className="px-4 pb-1 text-sm font-semibold text-slate-300">Konečné pořadí</h2>
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-1 py-2 font-medium">Hráč</th>
                <th className="px-2 py-2 text-right font-medium">Body</th>
                <th className="px-2 py-2 text-right font-medium">💯</th>
                <th className="px-3 py-2 text-right font-medium">Úsp.</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((n, i) => (
                <tr key={n} className="border-t border-line">
                  <td className="px-3 py-3 tabular-nums text-slate-400">{i + 1}</td>
                  <td className="px-1 py-3 font-medium">{n}</td>
                  <td className="px-2 py-3 text-right tabular-nums font-semibold">{data.stats[n].points}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-slate-300">{data.stats[n].tens}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-400">{data.stats[n].success}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Statistiky */}
      <section>
        <h2 className="px-4 pb-2 text-sm font-semibold text-slate-300">Statistiky sezóny</h2>
        <div className="grid grid-cols-2 gap-3 px-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-line bg-panel p-3">
              <div className="text-xs text-slate-400">{c.icon} {c.label}</div>
              <div className="mt-1 text-base font-semibold">{c.who}</div>
              <div className="text-xs text-brand">{c.val}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Vývoj pořadí po kolech */}
      <section>
        <h2 className="px-4 pb-2 text-sm font-semibold text-slate-300">Vývoj bodů po kolech</h2>
        <StandingsChart rounds={data.rounds} players={data.players} />
      </section>

      {/* Výsledky po kolech */}
      <section>
        <h2 className="px-4 pb-2 text-sm font-semibold text-slate-300">
          Výsledky po kolech ({data.rounds.length} kol)
        </h2>
        <div className="space-y-2 px-4">
          {data.rounds.map((r) => (
            <RoundAccordion key={r.round} round={r} players={data.players} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RoundAccordion({ round, players }: { round: Round; players: string[] }) {
  const [open, setOpen] = useState(false);

  // body za kolo + vítěz kola
  const roundPts: Record<string, number> = {};
  for (const p of players) roundPts[p] = 0;
  for (const m of round.matches)
    for (const [n, t] of Object.entries(m.tips)) if (t.pts != null) roundPts[n] += t.pts;
  const best = Math.max(...Object.values(roundPts));
  const winners = players.filter((p) => roundPts[p] === best && best > 0);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold">{round.round}. kolo</span>
        <span className="flex items-center gap-2 text-xs text-slate-400">
          {winners.length > 0 && (
            <span className="text-gold">🏆 {winners.join(', ')} ({best})</span>
          )}
          <span>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div className="divide-y divide-line border-t border-line">
          {round.matches.map((m, idx) => (
            <div key={idx} className="px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate">
                  {m.home} <span className="text-slate-500">–</span> {m.away}
                </span>
                <span className="ml-2 shrink-0 tabular-nums font-bold">
                  {m.hs ?? '–'}:{m.as ?? '–'}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {players.map((p) => {
                  const t = m.tips[p];
                  return (
                    <div key={p} className="flex items-center justify-between">
                      <span className="text-slate-400">{p}</span>
                      <span className="tabular-nums">
                        {t ? `${t.h}:${t.a}` : '—'}
                        {t?.pts != null && (
                          <span className={`ml-1 font-semibold ${pointsTextClass(t.pts)}`}>·{t.pts}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
