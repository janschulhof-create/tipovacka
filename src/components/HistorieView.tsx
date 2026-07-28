'use client';

import { roundLabel, afterRoundLabel, isKnockoutSeason } from '@/lib/roundLabel';
import { useState } from 'react';
import { StandingsChart } from './StandingsChart';
import { PositionsChart } from './PositionsChart';
import { pointsTextClass } from '@/lib/points';
import { StatCard } from './StatCard';
import type { SRound } from '@/lib/seasonStats';
import { buildStatCards, type CardStat, type StatCardDef } from '@/lib/statCards';

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
export function HistorieView({
  data,
  titleRows,
  extraCards = [],
  trailingCards = [],
  regionalCards = [],
}: {
  data: Historie;
  titleRows?: RankRow[];
  extraCards?: StatCardDef[];
  trailingCards?: StatCardDef[];
  regionalCards?: StatCardDef[];
}) {
  const knockout = isKnockoutSeason(data.season);
  const ranked = [...data.players].sort((a, b) => data.stats[b].points - data.stats[a].points);
  const winner = ranked[0];
  const [chartTab, setChartTab] = useState<'points' | 'positions'>('points');

  // Karty ze sdíleného zdroje → shodné se Síní slávy i dashboardem.
  const cards = buildStatCards({
    players: data.players,
    stats: data.stats as unknown as Record<string, CardStat>,
    rounds: data.rounds as unknown as SRound[],
    titleRows,
    extraCards,
    trailingCards,
  });

  // kumulativní body po každém kole → „pořadí po kole" v detailu
  const cumByRound: Record<string, number>[] = (() => {
    const run: Record<string, number> = Object.fromEntries(data.players.map((p) => [p, 0]));
    return data.rounds.map((r) => {
      for (const m of r.matches)
        for (const [n, t] of Object.entries(m.tips)) if (t.pts != null) run[n] += t.pts;
      return { ...run };
    });
  })();

  return (
    <div className="space-y-7">
      {/* Vítěz sezóny */}
      <div className="rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/15 to-transparent p-5 text-center">
        <div className="text-xs uppercase tracking-wide text-gold">Vítěz soutěže ({data.season})</div>
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

      {/* Jeden kompaktní graf s přepínačem bodů a pořadí. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="eyebrow"><span className="flag-chip" /> Vývoj sezóny po kolech</h2>
          <div className="inline-flex rounded-xl border border-line-subtle bg-app-deep/45 p-1" role="tablist" aria-label="Typ historického grafu">
            <button
              type="button"
              role="tab"
              aria-selected={chartTab === 'points'}
              onClick={() => setChartTab('points')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${chartTab === 'points' ? 'bg-violet-500/20 text-violet-200 shadow-violet' : 'text-copy-muted hover:text-copy-primary'}`}
            >
              Body
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={chartTab === 'positions'}
              onClick={() => setChartTab('positions')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${chartTab === 'positions' ? 'bg-violet-500/20 text-violet-200 shadow-violet' : 'text-copy-muted hover:text-copy-primary'}`}
            >
              Pořadí
            </button>
          </div>
        </div>
        <div className="mx-auto w-full lg:w-1/2 lg:max-w-[720px]">
          {chartTab === 'points' ? (
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
          ) : (
            <PositionsChart rounds={data.rounds} players={data.players} />
          )}
        </div>
      </section>

      {/* Statistiky sezóny — hráčské karty i zajímavosti pohromadě */}
      <section className="space-y-2">
        <h2 className="eyebrow"><span className="flag-chip" /> Statistiky sezóny</h2>
        <p className="text-[11px] text-slate-100/40">Klepni na kartu pro celé pořadí.</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <StatCard key={c.label} {...c} />
          ))}
        </div>
      </section>

      {regionalCards.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="eyebrow"><span className="flag-chip" /> 🗺️ Pořadí podle regionů</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-100/40">
              Body z utkání týmů daného regionu. Meziregionální zápas se započítá do obou regionů.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {regionalCards.map((card) => (
              <StatCard key={card.label} {...card} scale />
            ))}
          </div>
        </section>
      )}

      {/* Rozložení bodových zisků — až za statistikami */}
      <section className="space-y-2">
        <h2 className="eyebrow"><span className="flag-chip" /> Rozložení bodů</h2>
        <p className="text-[11px] text-slate-100/40">
          Jak často kdo bral kolik bodů za tip — desítkáři vs. jistotáři kolem 4–6.
        </p>
        <PointsDistribution data={data} ranked={ranked} />
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
            <RoundAccordion key={r.round} round={r} players={data.players} cumPts={cumByRound[i]} knockout={knockout} />
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

function RoundAccordion({ round, players, cumPts, knockout }: { round: Round; players: string[]; cumPts: Record<string, number>; knockout: boolean }) {
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
        <span className="text-sm font-semibold text-white">{roundLabel(round.round, knockout)}</span>
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
            <MiniRank title={`Pořadí ${afterRoundLabel(round.round, knockout)}`} rows={cumRank.map((n) => ({ name: n, pts: cumPts[n] }))} />
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
