import { calculatePoints } from './scoring';

/**
 * Statistická predikce zápasu.
 *
 * Model: Poissonovo rozdělení gólů. Síla útoku/obrany každého týmu se odhaduje
 * z jeho odehraných zápasů na turnaji (vstřelené/obdržené góly) vůči turnajovému
 * průměru. Z rozdělení se pak spočítají pravděpodobnosti výsledků a — což je
 * nejužitečnější — DOPORUČENÝ TIP, tedy skóre s nejvyšším očekávaným ziskem bodů
 * podle našeho bodování (10 / 6 / 4 / 2 / 0).
 */

export interface TeamForm {
  scored: number; // vstřelené góly na turnaji
  conceded: number; // obdržené góly
  played: number; // odehrané zápasy
}

export interface Prediction {
  lambdaHome: number; // očekávané góly domácích
  lambdaAway: number;
  pHome: number; // pravděpodobnost výhry domácích
  pDraw: number;
  pAway: number;
  topScores: { h: number; a: number; p: number }[]; // nejpravděpodobnější výsledky
  bestTip: { h: number; a: number; ev: number }; // tip s nejvyšším očekávaným ziskem bodů
  sample: number; // kolik zápasů model viděl (nízké číslo = ber s rezervou)
}

function poisson(k: number, lambda: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

export function predictMatch(
  home: TeamForm,
  away: TeamForm,
  leagueAvgGoals: number, // průměr gólů na tým a zápas v turnaji
  h2h: { hs: number; as: number; home: string; away: string }[] = [],
  homeName = '',
): Prediction | null {
  const sample = home.played + away.played;
  if (sample === 0 || leagueAvgGoals <= 0) return null;

  const avg = leagueAvgGoals;
  // síly (s regularizací k průměru, aby 1–2 zápasy nedělaly extrémy)
  const w = (played: number) => played / (played + 2); // shrinkage
  const atk = (t: TeamForm) => 1 + w(t.played) * ((t.played ? t.scored / t.played : avg) / avg - 1);
  const def = (t: TeamForm) => 1 + w(t.played) * ((t.played ? t.conceded / t.played : avg) / avg - 1);

  let lh = avg * atk(home) * def(away) * 1.08; // mírná výhoda domácích
  let la = avg * atk(away) * def(home) * 0.95;

  // jemná korekce podle vzájemných zápasů (max ±15 %)
  if (h2h.length && homeName) {
    let gh = 0;
    let ga = 0;
    for (const m of h2h) {
      const homeIsHome = m.home === homeName;
      gh += homeIsHome ? m.hs : m.as;
      ga += homeIsHome ? m.as : m.hs;
    }
    const n = h2h.length;
    const k = Math.min(0.15, 0.05 * n);
    lh = lh * (1 - k) + (gh / n) * k;
    la = la * (1 - k) + (ga / n) * k;
  }

  lh = Math.max(0.2, Math.min(4.5, lh));
  la = Math.max(0.2, Math.min(4.5, la));

  const MAX = 7;
  const ph = Array.from({ length: MAX + 1 }, (_, i) => poisson(i, lh));
  const pa = Array.from({ length: MAX + 1 }, (_, i) => poisson(i, la));

  const grid: { h: number; a: number; p: number }[] = [];
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  for (let h = 0; h <= MAX; h++)
    for (let a = 0; a <= MAX; a++) {
      const p = ph[h] * pa[a];
      grid.push({ h, a, p });
      if (h > a) pHome += p;
      else if (h < a) pAway += p;
      else pDraw += p;
    }

  // Doporučený tip = skóre s nejvyšším OČEKÁVANÝM ZISKEM BODŮ (ne nejpravděpodobnější!)
  let bestTip = { h: 1, a: 1, ev: -1 };
  for (let th = 0; th <= 5; th++)
    for (let ta = 0; ta <= 5; ta++) {
      let ev = 0;
      for (const g of grid) ev += g.p * calculatePoints(g.h, g.a, th, ta);
      if (ev > bestTip.ev) bestTip = { h: th, a: ta, ev };
    }

  return {
    lambdaHome: lh,
    lambdaAway: la,
    pHome,
    pDraw,
    pAway,
    topScores: [...grid].sort((x, y) => y.p - x.p).slice(0, 4),
    bestTip,
    sample,
  };
}
