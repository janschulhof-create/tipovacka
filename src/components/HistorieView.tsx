'use client';

import { useState } from 'react';
import { StandingsChart } from './StandingsChart';
import { StatTile } from './StatTile';
import { buildStat, type StatEntry } from '@/lib/stat';
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

export function HistorieView({ data }: { data: Historie }) {
  const { players, stats } = data;
  const ranked = [...players].sort((a, b) => stats[b].points - stats[a].points);
  const winner = ranked[0];

  // dlaždice statistik (každá rozklikávací na TOP 6)
  const tile = (
    icon: string,
    label: string,
    get: (s: Stat) => number,
    dir: 'max' | 'min',
    fmt: (v: number) => string,
    sub?: (name: string) => string
  ) => {
    const entries: StatEntry[] = players.map((p) => ({
      name: p,
      value: get(stats[p]),
      sub: sub ? sub(p) : undefined,
    }));
    return { icon, label, ...buildStat(entries, dir, fmt) };
  };

  const tiles = [
    tile('🎯', 'Nejvíce přesných tipů', (s) => s.tens, 'max', (v) => `${v}× desítka`),
    tile('🏅', 'Nejvíce vyhraných kol', (s) => s.roundWins, 'max', (v) => `${v}×`),
    tile('💥', 'Rekord za 1 kolo', (s) => s.bestRound, 'max', (v) => `${v} b`,
      (n) => `${stats[n].bestRoundNo}. kolo`),
    tile('📈', 'Průměr bodů na zápas', (s) => s.avgPoints, 'max', (v) => `${v}`),
    tile('⚽', 'Největší střelec', (s) => s.avgGoals, 'max', (v) => `Ø ${v} g/tip`),
    tile('🧱', 'Největší betonář', (s) => s.avgGoals, 'min', (v) => `Ø ${v} g/tip`),
    tile('💀', 'Král nuličky', (s) => s.zeros, 'max', (v) => `${v}× nula`),
    tile('🧠', 'Mr. Alzheimer', (s) => s.missed, 'max', (v) => `${v}× netipoval`),
  ];

  // průběžné body po každém kole (pro pořadí "po kole")
  const running: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  const perRound = data.rounds.map((r) => {
    const rp: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
    for (const m of r.matches)
      for (const [n, t] of Object.entries(m.tips)) if (t.pts != null) rp[n] += t.pts;
    for (const p of players) running[p] += rp[p];
    return { roundPts: { ...rp }, cumPts: { ...running } };
  });

  return (
    <div className="space-y-6">
      <div className="mx-4 rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/15 to-transparent p-5 text-center">
        <div className="text-xs uppercase tracking-wide text-gold">Vítěz 1. sezóny ({data.season})</div>
        <div className="mt-1 text-3xl font-extrabold">🏆 {winner}</div>
        <div className="text-sm text-slate-300">{stats[winner].points} bodů</div>
      </div>

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
                  <td className="px-2 py-3 text-right tabular-nums font-semibold">{stats[n].points}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-slate-300">{stats[n].tens}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-400">{stats[n].success}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="px-4 pb-2 text-sm font-semibold text-slate-300">Statistiky sezóny</h2>
        <div className="grid grid-cols-2 items-start gap-3 px-4">
          {tiles.map((t) => (
            <StatTile key={t.label} {...t} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="px-4 pb-2 text-sm font-semibold text-slate-300">Vývoj bodů po kolech</h2>
        <StandingsChart rounds={data.rounds} players={data.players} />
      </section>

      <section>
        <h2 className="px-4 pb-2 text-sm font-semibold text-slate-300">
          Výsledky po kolech ({data.rounds.length} kol)
        </h2>
        <div className="space-y-2 px-4">
          {data.rounds.map((r, i) => (
            <RoundAccordion
              key={r.round}
              round={r}
              players={players}
              roundPts={perRound[i].roundPts}
              cumPts={perRound[i].cumPts}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function rankList(map: Record<string, number>, players: string[]) {
  return [...players].sort((a, b) => map[b] - map[a]).map((n, i) => ({ rank: i + 1, name: n, pts: map[n] }));
}

function RoundAccordion({
  round,
  players,
  roundPts,
  cumPts,
}: {
  round: Round;
  players: string[];
  roundPts: Record<string, number>;
  cumPts: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const best = Math.max(...Object.values(roundPts));
  const winners = players.filter((p) => roundPts[p] === best && best > 0);

  const roundRank = rankList(roundPts, players);
  const cumRank = rankList(cumPts, players);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-semibold">{round.round}. kolo</span>
        <span className="flex items-center gap-2 text-xs text-slate-400">
          {winners.length > 0 && <span className="text-gold">🏆 {winners.join(', ')} ({best})</span>}
          <span>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-line">
          {/* pořadí v kole + pořadí po kole */}
          <div className="grid grid-cols-2 gap-3 px-4 py-3">
            <MiniRank title="Pořadí v kole" rows={roundRank} />
            <MiniRank title={`Pořadí po ${round.round}. kole`} rows={cumRank} />
          </div>

          {/* detail zápasů */}
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
        </div>
      )}
    </div>
  );
}

function MiniRank({ title, rows }: { title: string; rows: { rank: number; name: string; pts: number }[] }) {
  return (
    <div>
      <div className="pb-1 text-[11px] uppercase tracking-wide text-slate-500">{title}</div>
      <ol className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between text-xs">
            <span className="text-slate-300">
              <span className="mr-1 text-slate-500">{r.rank}.</span>{r.name}
            </span>
            <span className="tabular-nums text-slate-400">{r.pts}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
