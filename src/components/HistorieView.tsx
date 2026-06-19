'use client';

import { useState } from 'react';
import { StandingsChart } from './StandingsChart';
import { PositionsChart } from './PositionsChart';
import { pointsTextClass } from '@/lib/points';
import { StatCard } from './StatCard';

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

type RankRow = { name: string; val: string };

/** Zajímavosti počítané přímo z tipů a výsledků — vrací celé žebříčky. */
function funFacts(data: Historie) {
  const tipFreq = new Map<string, number>();
  const readable = new Map<string, number>();   // tip → kolikrát za 10 b
  const unreadable = new Map<string, number>(); // tip → kolikrát za 0 b
  const professor: Record<string, number> = Object.fromEntries(data.players.map((p) => [p, 0]));
  const team = new Map<string, { sum: number; cnt: number }>();
  const unlucky: Record<string, number> = Object.fromEntries(data.players.map((p) => [p, 0]));
  const matchAgg: { label: string; result: string; avg: number }[] = [];

  const addTeam = (t: string, pts: number) => {
    const cur = team.get(t) ?? { sum: 0, cnt: 0 };
    cur.sum += pts;
    cur.cnt += 1;
    team.set(t, cur);
  };

  for (const r of data.rounds) {
    for (const m of r.matches) {
      if (m.hs == null || m.as == null) continue;
      let mSum = 0;
      let mCnt = 0;
      for (const [name, t] of Object.entries(m.tips)) {
        if (t.h == null || t.a == null) continue;
        tipFreq.set(`${t.h}:${t.a}`, (tipFreq.get(`${t.h}:${t.a}`) ?? 0) + 1);
        if (t.pts != null) {
          addTeam(m.home, t.pts);
          addTeam(m.away, t.pts);
          mSum += t.pts;
          mCnt += 1;
          if (Math.abs(t.h - m.hs) + Math.abs(t.a - m.as) === 1) unlucky[name] += 1;
          const sc = `${t.h}:${t.a}`;
          if (t.pts === 10) readable.set(sc, (readable.get(sc) ?? 0) + 1);
          if (t.pts === 0) unreadable.set(sc, (unreadable.get(sc) ?? 0) + 1);
          if (t.pts === 4) professor[name] += 1;
        }
      }
      if (mCnt > 0) matchAgg.push({ label: `${m.home} – ${m.away}`, result: `${m.hs}:${m.as}`, avg: mSum / mCnt });
    }
  }

  const tipRows: RankRow[] = [...tipFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => ({ name: k, val: `${v}× vsazeno` }));

  const teamRows: RankRow[] = [...team.entries()]
    .filter(([, v]) => v.cnt >= 3)
    .map(([t, v]) => ({ t, avg: v.sum / v.cnt }))
    .sort((a, b) => b.avg - a.avg)
    .map((x) => ({ name: x.t, val: `Ø ${x.avg.toFixed(1)} b/tip` }));

  const unluckyRows: RankRow[] = Object.entries(unlucky)
    .sort((a, b) => b[1] - a[1])
    .map(([n, v]) => ({ name: n, val: `${v}× gól od desítky` }));

  const matchSorted = [...matchAgg].sort((a, b) => a.avg - b.avg);
  const surpriseRows: RankRow[] = matchSorted
    .slice(0, 6)
    .map((m) => ({ name: `${m.label} (${m.result})`, val: `Ø ${m.avg.toFixed(1)} b` }));
  const bankerRows: RankRow[] = [...matchSorted]
    .reverse()
    .slice(0, 6)
    .map((m) => ({ name: `${m.label} (${m.result})`, val: `Ø ${m.avg.toFixed(1)} b` }));

  const readableRows: RankRow[] = [...readable.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => ({ name: k, val: `${v}× za 10 b` }));
  const unreadableRows: RankRow[] = [...unreadable.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => ({ name: k, val: `${v}× za 0 b` }));
  const professorRows: RankRow[] = Object.entries(professor)
    .sort((a, b) => b[1] - a[1])
    .map(([n, v]) => ({ name: n, val: `${v}× jen vítěz (4 b)` }));

  return { tipRows, teamRows, unluckyRows, surpriseRows, bankerRows, readableRows, unreadableRows, professorRows };
}

export function HistorieView({ data }: { data: Historie }) {
  const ranked = [...data.players].sort((a, b) => data.stats[b].points - data.stats[a].points);
  const winner = ranked[0];

  const rankPlayers = (pick: (s: Stat) => number, dir: 'max' | 'min', fmt: (s: Stat) => string): RankRow[] =>
    [...data.players]
      .sort((a, b) =>
        dir === 'max' ? pick(data.stats[b]) - pick(data.stats[a]) : pick(data.stats[a]) - pick(data.stats[b])
      )
      .map((n) => ({ name: n, val: fmt(data.stats[n]) }));

  const cards: { icon: string; label: string; accent: string; rows: RankRow[] }[] = [
    { icon: '🎯', label: 'Nejvíce přesných tipů', accent: 'text-pitch-light', rows: rankPlayers((s) => s.tens, 'max', (s) => `${s.tens}× desítka`) },
    { icon: '🏅', label: 'Nejvíce vyhraných kol', accent: 'text-pitch-light', rows: rankPlayers((s) => s.roundWins, 'max', (s) => `${s.roundWins}×`) },
    { icon: '💥', label: 'Rekord za 1 kolo', accent: 'text-flag', rows: rankPlayers((s) => s.bestRound, 'max', (s) => `${s.bestRound} b · ${s.bestRoundNo}. kolo`) },
    { icon: '📈', label: 'Průměr bodů na zápas', accent: 'text-pitch-light', rows: rankPlayers((s) => s.avgPoints, 'max', (s) => `${s.avgPoints}`) },
    { icon: '⚽', label: 'Největší střelec', accent: 'text-flag', rows: rankPlayers((s) => s.avgGoals, 'max', (s) => `Ø ${s.avgGoals} g/tip`) },
    { icon: '🧱', label: 'Největší betonář', accent: 'text-sky-400', rows: rankPlayers((s) => s.avgGoals, 'min', (s) => `Ø ${s.avgGoals} g/tip`) },
    { icon: '💀', label: 'Král nuličky', accent: 'text-control', rows: rankPlayers((s) => s.zeros, 'max', (s) => `${s.zeros}× nula`) },
    { icon: '🧠', label: 'Mr. Alzheimer', accent: 'text-control', rows: rankPlayers((s) => s.missed, 'max', (s) => `${s.missed}× netipoval`) },
  ];

  const ff = funFacts(data);

  // kumulativní body po každém kole → „pořadí po kole" v detailu
  const cumByRound: Record<string, number>[] = (() => {
    const run: Record<string, number> = Object.fromEntries(data.players.map((p) => [p, 0]));
    return data.rounds.map((r) => {
      for (const m of r.matches)
        for (const [n, t] of Object.entries(m.tips)) if (t.pts != null) run[n] += t.pts;
      return { ...run };
    });
  })();
  const facts: { icon: string; label: string; accent: string; rows: RankRow[] }[] = [
    { icon: '🔁', label: 'Nejčastější tip', accent: 'text-pitch-light', rows: ff.tipRows },
    { icon: '🎯', label: 'Nejlíp čitelný tým', accent: 'text-pitch-light', rows: ff.teamRows },
    { icon: '🌀', label: 'Nejhůř čitelný tým', accent: 'text-control', rows: [...ff.teamRows].reverse() },
    { icon: '🍀', label: 'Faktor smůly (smolař)', accent: 'text-flag', rows: ff.unluckyRows },
    { icon: '😱', label: 'Překvapení sezóny', accent: 'text-control', rows: ff.surpriseRows },
    { icon: '✅', label: 'Jistota sezóny', accent: 'text-pitch-light', rows: ff.bankerRows },
    { icon: '🟢', label: 'Čitelný tip (nejčastěji vyšel)', accent: 'text-green-400', rows: ff.readableRows },
    { icon: '🔴', label: 'Nečitelný tip (nejčastěji 0 b)', accent: 'text-red-400', rows: ff.unreadableRows },
    { icon: '🎓', label: 'Profesorský fotbal', accent: 'text-slate-300', rows: ff.professorRows },
  ];

  return (
    <div className="space-y-7">
      {/* Vítěz sezóny */}
      <div className="rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/15 to-transparent p-5 text-center">
        <div className="text-xs uppercase tracking-wide text-gold">Vítěz 1. sezóny ({data.season})</div>
        <div className="mt-1 font-display text-3xl font-extrabold text-white">🏆 {winner}</div>
        <div className="text-sm text-slate-100/70">{data.stats[winner].points} bodů</div>
      </div>

      {/* Konečné pořadí */}
      <section className="space-y-2">
        <h2 className="eyebrow"><span className="flag-chip" /> Konečné pořadí</h2>
        <div className="panel-flush">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-300/50">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-1 py-2 font-medium">Hráč</th>
                <th className="px-2 py-2 text-right font-medium">Body</th>
                <th className="px-2 py-2 text-right font-medium">💯</th>
                <th className="px-3 py-2 text-right font-medium">Úsp.</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((n, i) => (
                <tr key={n} className="border-t border-terrain-700">
                  <td className="px-3 py-3 tabular-nums text-slate-300/50">{i + 1}</td>
                  <td className="px-1 py-3 font-medium text-white">{n}</td>
                  <td className="px-2 py-3 text-right tabular-nums font-semibold text-pitch-light">{data.stats[n].points}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-slate-100/70">{data.stats[n].tens}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-300/50">{data.stats[n].success}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Vývoj bodů po kolech */}
      <section className="space-y-2">
        <h2 className="eyebrow"><span className="flag-chip" /> Vývoj bodů po kolech</h2>
        <StandingsChart
          matches={data.rounds.flatMap((r) =>
            r.matches.map((m) => ({
              round: r.round,
              pts: Object.fromEntries(
                Object.entries(m.tips)
                  .filter(([, t]) => t.pts != null)
                  .map(([name, t]) => [name, t.pts as number])
              ),
            }))
          )}
          players={data.players}
        />
      </section>

      {/* Vývoj pořadí po kolech – hned pod body, stejné barvy */}
      <section className="space-y-2">
        <h2 className="eyebrow"><span className="flag-chip" /> Vývoj pořadí po kolech</h2>
        <PositionsChart rounds={data.rounds} players={data.players} />
      </section>

      {/* Statistiky – hráči */}
      <section className="space-y-2">
        <h2 className="eyebrow"><span className="flag-chip" /> Statistiky hráčů</h2>
        <p className="text-[11px] text-slate-100/40">Klepni na kartu pro celé pořadí.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((c) => (
            <StatCard key={c.label} {...c} />
          ))}
        </div>
      </section>

      {/* Rozložení bodových zisků */}
      <section className="space-y-2">
        <h2 className="eyebrow"><span className="flag-chip" /> Rozložení bodů</h2>
        <p className="text-[11px] text-slate-100/40">
          Jak často kdo bral kolik bodů za tip — desítkáři vs. jistotáři kolem 4–6.
        </p>
        <PointsDistribution data={data} ranked={ranked} />
      </section>

      {/* Zajímavosti – tipy a týmy */}
      <section className="space-y-2">
        <h2 className="eyebrow"><span className="flag-chip" /> Zajímavosti sezóny</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {facts.map((c) => (
            <StatCard key={c.label} {...c} />
          ))}
        </div>
      </section>

      {/* Co by kdyby – alternativní bodování */}
      <section className="space-y-2">
        <h2 className="eyebrow"><span className="flag-chip" /> 🔮 Co by kdyby</h2>
        <WhatIfStandings data={data} ranked={ranked} />
      </section>

      {/* Výsledky po kolech */}
      <section className="space-y-2">
        <h2 className="eyebrow"><span className="flag-chip" /> Výsledky po kolech ({data.rounds.length} kol)</h2>
        <div className="space-y-2">
          {data.rounds.map((r, i) => (
            <RoundAccordion key={r.round} round={r} players={data.players} cumPts={cumByRound[i]} />
          ))}
        </div>
      </section>
    </div>
  );
}

/** Alternativní bodování „co by kdyby". */
function altPoints(h: number, a: number, hs: number, as: number): number {
  if (h === hs && a === as) return 10; // přesný výsledek
  const sameTendency = Math.sign(h - a) === Math.sign(hs - as);
  const sameDiff = h - a === hs - as;
  if (sameTendency && sameDiff) return 8; // vítěz + rozdíl (vč. remízy s jiným skóre)
  if (sameTendency) return 6; // jen vítěz
  if (h === hs || a === as) return 2; // sedí počet gólů jednoho týmu
  return 0;
}

function WhatIfStandings({ data, ranked }: { data: Historie; ranked: string[] }) {
  const alt: Record<string, number> = Object.fromEntries(data.players.map((p) => [p, 0]));
  for (const r of data.rounds)
    for (const m of r.matches) {
      if (m.hs == null || m.as == null) continue;
      for (const [n, t] of Object.entries(m.tips))
        if (t.h != null && t.a != null && alt[n] != null) alt[n] += altPoints(t.h, t.a, m.hs, m.as);
    }

  const altRanked = [...data.players].sort((a, b) => alt[b] - alt[a]);
  const realIdx = Object.fromEntries(ranked.map((n, i) => [n, i]));

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-slate-100/45">
        Pořadí, kdyby se bodovalo: <b className="text-slate-100/70">10 b</b> přesný výsledek ·{' '}
        <b className="text-slate-100/70">8 b</b> vítěz + rozdíl gólů (i remíza s jiným skóre) ·{' '}
        <b className="text-slate-100/70">6 b</b> jen vítěz · <b className="text-slate-100/70">2 b</b> sedí
        počet gólů jednoho týmu.
      </p>
      <div className="panel-flush">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-300/50">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-1 py-2 font-medium">Hráč</th>
              <th className="px-2 py-2 text-right font-medium">Body</th>
              <th className="px-3 py-2 text-right font-medium">Posun</th>
            </tr>
          </thead>
          <tbody>
            {altRanked.map((n, i) => {
              const move = realIdx[n] - i; // +nahoru / −dolů oproti reálnému pořadí
              return (
                <tr key={n} className="border-t border-terrain-700">
                  <td className="px-3 py-3 tabular-nums text-slate-300/50">{i + 1}</td>
                  <td className="px-1 py-3 font-medium text-white">{n}</td>
                  <td className="px-2 py-3 text-right tabular-nums font-semibold text-pitch-light">{alt[n]}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {move === 0 ? (
                      <span className="text-slate-300/35">—</span>
                    ) : move > 0 ? (
                      <span className="text-pitch-light">▲ {move}</span>
                    ) : (
                      <span className="text-flag">▼ {-move}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const BUCKETS: { pts: number; label: string; bg: string }[] = [
  { pts: 10, label: '10 b — přesně', bg: 'bg-green-500' },
  { pts: 6, label: '6 b', bg: 'bg-sky-500' },
  { pts: 4, label: '4 b — vítěz', bg: 'bg-slate-400' },
  { pts: 2, label: '2 b', bg: 'bg-yellow-500' },
  { pts: 0, label: '0 b — mimo', bg: 'bg-red-500' },
];

function PointsDistribution({ data, ranked }: { data: Historie; ranked: string[] }) {
  // počty tipů v jednotlivých bodových kategoriích na hráče
  const dist: Record<string, Record<number, number>> = {};
  const totals: Record<string, number> = {};
  for (const p of ranked) {
    dist[p] = { 10: 0, 6: 0, 4: 0, 2: 0, 0: 0 };
    totals[p] = 0;
  }
  for (const r of data.rounds)
    for (const m of r.matches)
      for (const [n, t] of Object.entries(m.tips))
        if (t.pts != null && dist[n] && t.pts in dist[n]) {
          dist[n][t.pts] += 1;
          totals[n] += 1;
        }

  return (
    <div className="panel space-y-3 p-4">
      {/* legenda */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {BUCKETS.map((b) => (
          <span key={b.pts} className="flex items-center gap-1.5 text-slate-100/70">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${b.bg}`} />
            {b.label}
          </span>
        ))}
      </div>

      <div className="space-y-2.5">
        {ranked.map((p) => {
          const total = totals[p] || 1;
          return (
            <div key={p} className="flex items-center gap-3">
              <span className="w-16 shrink-0 truncate text-sm text-slate-50/90">{p}</span>
              <div className="flex h-5 flex-1 overflow-hidden rounded-md bg-terrain-950">
                {BUCKETS.map((b) => {
                  const cnt = dist[p][b.pts];
                  if (cnt === 0) return null;
                  const pct = (cnt / total) * 100;
                  return (
                    <div
                      key={b.pts}
                      className={`flex items-center justify-center ${b.bg}`}
                      style={{ width: `${pct}%` }}
                      title={`${b.pts} b: ${cnt}× (${Math.round(pct)} %)`}
                    >
                      {pct >= 9 && (
                        <span className="text-[10px] font-bold text-black/70 tabular-nums">{cnt}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-slate-300/45">
                {totals[p]}×
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoundAccordion({ round, players, cumPts }: { round: Round; players: string[]; cumPts: Record<string, number> }) {
  const [open, setOpen] = useState(false);

  const roundPts: Record<string, number> = {};
  for (const p of players) roundPts[p] = 0;
  for (const m of round.matches)
    for (const [n, t] of Object.entries(m.tips)) if (t.pts != null) roundPts[n] += t.pts;
  const best = Math.max(...Object.values(roundPts));
  const winners = players.filter((p) => roundPts[p] === best && best > 0);

  const roundRank = [...players].sort((a, b) => roundPts[b] - roundPts[a]);
  const cumRank = [...players].sort((a, b) => cumPts[b] - cumPts[a]);

  return (
    <div className="panel-flush">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-terrain-900/40"
      >
        <span className="text-sm font-semibold text-white">{round.round}. kolo</span>
        <span className="flex items-center gap-2 text-xs text-slate-300/50">
          {winners.length > 0 && <span className="text-gold">🏆 {winners.join(', ')} ({best})</span>}
          <span>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-terrain-700">
          {/* pořadí v kole + pořadí po kole */}
          <div className="grid grid-cols-2 gap-3 px-4 py-3">
            <MiniRank title="Pořadí v kole" rows={roundRank.map((n) => ({ name: n, pts: roundPts[n] }))} />
            <MiniRank title={`Pořadí po ${round.round}. kole`} rows={cumRank.map((n) => ({ name: n, pts: cumPts[n] }))} />
          </div>

          <div className="divide-y divide-terrain-700 border-t border-terrain-700">
          {round.matches.map((m, idx) => (
            <div key={idx} className="px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate text-white">
                  {m.home} <span className="text-slate-300/40">–</span> {m.away}
                </span>
                <span className="ml-2 shrink-0 tabular-nums font-bold text-white">
                  {m.hs ?? '–'}:{m.as ?? '–'}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {players.map((p) => {
                  const t = m.tips[p];
                  return (
                    <div key={p} className="flex items-center justify-between">
                      <span className="text-slate-100/55">{p}</span>
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

function MiniRank({ title, rows }: { title: string; rows: { name: string; pts: number }[] }) {
  return (
    <div>
      <div className="pb-1 text-[11px] uppercase tracking-wide text-slate-300/60">{title}</div>
      <ol className="space-y-0.5">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center justify-between text-xs">
            <span className="text-slate-100/80">
              <span className="mr-1 text-slate-300/45">{i + 1}.</span>{r.name}
            </span>
            <span className="tabular-nums text-slate-300/55">{r.pts}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
