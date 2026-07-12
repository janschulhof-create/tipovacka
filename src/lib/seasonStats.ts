// Sdílený výpočet statistik – používá Historie, Síň slávy i živá sezóna (MS).
// Vstupem je jednotný tvar "rounds" (kola → zápasy → tipy).

export type Tip = { h: number | null; a: number | null; pts: number | null };
export type SMatch = { home: string; away: string; hs: number | null; as: number | null; tips: Record<string, Tip> };
export type SRound = { round: number; matches: SMatch[] };
export type RankRow = { name: string; val: string; n?: number };

export type PerPlayer = {
  points: number; count: number; tens: number; zeros: number; fours: number;
  missed: number; roundWins: number; bestRound: number; bestRoundNo: number;
  avgGoals: number; avgPoints: number; success: number;
};

/** Per-hráč statistiky z hrubých kol (pro živou sezónu, kde nejsou předpočítané). */
export function computePerPlayer(rounds: SRound[], players: string[]): Record<string, PerPlayer> {
  const acc: Record<string, PerPlayer> = Object.fromEntries(
    players.map((p) => [p, { points: 0, count: 0, tens: 0, zeros: 0, fours: 0, missed: 0, roundWins: 0, bestRound: 0, bestRoundNo: 0, avgGoals: 0, avgPoints: 0, success: 0 }])
  );
  const goals: Record<string, { sum: number; cnt: number }> = Object.fromEntries(players.map((p) => [p, { sum: 0, cnt: 0 }]));
  const scored: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));

  for (const r of rounds) {
    const rp: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
    let anyPts = false;
    for (const m of r.matches) {
      const finished = m.hs != null && m.as != null;
      for (const p of players) {
        const t = m.tips[p];
        if (t && t.h != null && t.a != null) {
          goals[p].sum += t.h + t.a;
          goals[p].cnt += 1;
        }
        if (t && t.pts != null) {
          acc[p].points += t.pts;
          acc[p].count += 1;
          rp[p] += t.pts;
          anyPts = true;
          if (t.pts === 10) acc[p].tens += 1;
          if (t.pts === 0) acc[p].zeros += 1;
          if (t.pts === 4) acc[p].fours += 1;
          if (t.pts > 0) scored[p] += 1;
        } else if (finished && (!t || t.h == null)) {
          acc[p].missed += 1; // odehraný zápas bez tipu
        }
      }
    }
    if (anyPts) {
      const best = Math.max(...players.map((p) => rp[p]));
      for (const p of players) {
        if (rp[p] > acc[p].bestRound) { acc[p].bestRound = rp[p]; acc[p].bestRoundNo = r.round; }
        if (rp[p] === best && best > 0) acc[p].roundWins += 1;
      }
    }
  }

  for (const p of players) {
    acc[p].avgGoals = goals[p].cnt ? +(goals[p].sum / goals[p].cnt).toFixed(2) : 0;
    acc[p].avgPoints = acc[p].count ? +(acc[p].points / acc[p].count).toFixed(2) : 0;
    acc[p].success = acc[p].count ? Math.round((scored[p] / acc[p].count) * 100) : 0;
  }
  return acc;
}

/** Zajímavosti z tipů a výsledků (shodná logika jako v Historii). */
export function funFacts(rounds: SRound[], players: string[]) {
  const tipFreq = new Map<string, number>();
  const readable = new Map<string, number>();
  const unreadable = new Map<string, number>();
  const professor: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  const team = new Map<string, { sum: number; cnt: number }>();
  const unlucky: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  const matchAgg: { label: string; result: string; avg: number }[] = [];

  const addTeam = (t: string, pts: number) => {
    const cur = team.get(t) ?? { sum: 0, cnt: 0 };
    cur.sum += pts; cur.cnt += 1; team.set(t, cur);
  };

  for (const r of rounds) {
    for (const m of r.matches) {
      if (m.hs == null || m.as == null) continue;
      let mSum = 0, mCnt = 0;
      for (const [name, t] of Object.entries(m.tips)) {
        if (t.h == null || t.a == null) continue;
        tipFreq.set(`${t.h}:${t.a}`, (tipFreq.get(`${t.h}:${t.a}`) ?? 0) + 1);
        if (t.pts != null) {
          addTeam(m.home, t.pts); addTeam(m.away, t.pts);
          mSum += t.pts; mCnt += 1;
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

  const tipRows: RankRow[] = [...tipFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ name: k, val: `${v}× vsazeno`, n: v }));
  const teamRows: RankRow[] = [...team.entries()].filter(([, v]) => v.cnt >= 3).map(([t, v]) => ({ t, avg: v.sum / v.cnt })).sort((a, b) => b.avg - a.avg).map((x) => ({ name: x.t, val: `Ø ${x.avg.toFixed(1)} b/tip`, n: x.avg }));
  const unluckyRows: RankRow[] = Object.entries(unlucky).sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ name: n, val: `${v}× gól od desítky`, n: v }));
  const matchSorted = [...matchAgg].sort((a, b) => a.avg - b.avg);
  const surpriseRows: RankRow[] = matchSorted.slice(0, 6).map((m) => ({ name: `${m.label} (${m.result})`, val: `Ø ${m.avg.toFixed(1)} b`, n: m.avg }));
  const bankerRows: RankRow[] = [...matchSorted].reverse().slice(0, 6).map((m) => ({ name: `${m.label} (${m.result})`, val: `Ø ${m.avg.toFixed(1)} b`, n: m.avg }));
  const readableRows: RankRow[] = [...readable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ name: k, val: `${v}× za 10 b`, n: v }));
  const unreadableRows: RankRow[] = [...unreadable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ name: k, val: `${v}× za 0 b`, n: v }));
  const professorRows: RankRow[] = Object.entries(professor).sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ name: n, val: `${v}× jen vítěz (4 b)`, n: v }));

  return { tipRows, teamRows, unluckyRows, surpriseRows, bankerRows, readableRows, unreadableRows, professorRows };
}

/**
 * Černokněžník = bodoval jako JEDINÝ v zápase.
 * Blamáž       = jako JEDINÝ nebodoval (všichni ostatní body brali).
 * Počítá se jen tam, kde tipovali aspoň dva hráči.
 */
export function wizardSpodina(rounds: SRound[]): {
  wizardRows: RankRow[];
  spodinaRows: RankRow[];
} {
  const wiz = new Map<string, number>();
  const spo = new Map<string, number>();

  for (const r of rounds) {
    for (const m of r.matches) {
      const tips = Object.entries(m.tips).filter(([, t]) => t.pts != null) as [string, Tip][];
      if (tips.length < 2) continue;
      const scorers = tips.filter(([, t]) => (t.pts ?? 0) > 0);
      const blanks = tips.filter(([, t]) => (t.pts ?? 0) === 0);
      if (scorers.length === 1) wiz.set(scorers[0][0], (wiz.get(scorers[0][0]) ?? 0) + 1);
      if (blanks.length === 1) spo.set(blanks[0][0], (spo.get(blanks[0][0]) ?? 0) + 1);
    }
  }

  const toRows = (m: Map<string, number>): RankRow[] =>
    [...m.entries()]
      .map(([name, n]) => ({ name, val: `${n}×`, n }))
      .sort((a, b) => (b.n ?? 0) - (a.n ?? 0) || a.name.localeCompare(b.name, 'cs'));

  return { wizardRows: toRows(wiz), spodinaRows: toRows(spo) };
}
