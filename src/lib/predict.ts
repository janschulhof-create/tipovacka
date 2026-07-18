import { calculatePoints } from './scoring';

/**
 * Statistická predikce zápasu.
 *
 * Model kombinuje současnou formu obou týmů (max. posledních pět utkání na tým)
 * s posledními vzájemnými zápasy. Pokud v aktuální sezoně ještě žádná forma
 * neexistuje, predikce se spočítá pouze ze vzájemných zápasů.
 */

export interface TeamForm {
  scored: number;
  conceded: number;
  played: number;
}

export interface Prediction {
  lambdaHome: number;
  lambdaAway: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  topScores: { h: number; a: number; p: number }[];
  bestTip: { h: number; a: number; ev: number };
  /** Celkový počet zápasových vstupů, které model použil. */
  sample: number;
  /** Počet zápasů současné formy obou týmů dohromady. */
  formSample: number;
  /** Počet použitých vzájemných zápasů. */
  h2hSample: number;
  basis: 'form+h2h' | 'form' | 'h2h';
}

function poisson(k: number, lambda: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

/** Očekávaný bodový zisk konkrétního tipu v Poissonově modelu zápasu. */
export function expectedPointsForTip(
  lambdaHome: number,
  lambdaAway: number,
  predHome: number,
  predAway: number,
): number {
  const MAX = 7;
  let ev = 0;
  for (let h = 0; h <= MAX; h++) {
    for (let a = 0; a <= MAX; a++) {
      ev += poisson(h, lambdaHome) * poisson(a, lambdaAway) * calculatePoints(h, a, predHome, predAway);
    }
  }
  return ev;
}

export function predictMatch(
  home: TeamForm,
  away: TeamForm,
  leagueAvgGoals: number,
  h2h: { hs: number; as: number; home: string; away: string }[] = [],
  homeName = '',
): Prediction | null {
  const formSample = home.played + away.played;
  const usableH2h = h2h.filter(
    (m) => Number.isFinite(m.hs) && Number.isFinite(m.as) && m.hs >= 0 && m.as >= 0,
  );
  const h2hSample = usableH2h.length;
  if (formSample === 0 && h2hSample === 0) return null;

  let h2hHomeGoals = 0;
  let h2hAwayGoals = 0;
  for (const m of usableH2h) {
    const currentHomeWasHome = m.home === homeName;
    h2hHomeGoals += currentHomeWasHome ? m.hs : m.as;
    h2hAwayGoals += currentHomeWasHome ? m.as : m.hs;
  }

  const h2hAvgGoals = h2hSample
    ? (h2hHomeGoals + h2hAwayGoals) / (h2hSample * 2)
    : 0;
  const avg = leagueAvgGoals > 0 ? leagueAvgGoals : h2hAvgGoals > 0 ? h2hAvgGoals : 1.25;

  let lh: number;
  let la: number;

  if (formSample > 0) {
    // Síly útoku a obrany se regularizují k průměru, aby první zápasy nedělaly extrémy.
    const w = (played: number) => played / (played + 2);
    const atk = (t: TeamForm) =>
      1 + w(t.played) * ((t.played ? t.scored / t.played : avg) / avg - 1);
    const def = (t: TeamForm) =>
      1 + w(t.played) * ((t.played ? t.conceded / t.played : avg) / avg - 1);

    lh = avg * atk(home) * def(away) * 1.08;
    la = avg * atk(away) * def(home) * 0.95;

    if (h2hSample > 0) {
      // Se současnou formou mají vzájemné zápasy významnou, ale ne dominantní váhu.
      const h2hWeight = Math.min(0.45, 0.12 + h2hSample * 0.055);
      const directHome = h2hHomeGoals / h2hSample;
      const directAway = h2hAwayGoals / h2hSample;
      lh = lh * (1 - h2hWeight) + directHome * h2hWeight;
      la = la * (1 - h2hWeight) + directAway * h2hWeight;
    }
  } else {
    // Na začátku sezony není forma: model stojí pouze na H2H, lehce vyhlazeném
    // ligovým / obecným gólovým průměrem, aby jediný divoký výsledek nerozhodl vše.
    const priorMatches = 1.5;
    lh = (h2hHomeGoals + avg * 1.06 * priorMatches) / (h2hSample + priorMatches);
    la = (h2hAwayGoals + avg * 0.94 * priorMatches) / (h2hSample + priorMatches);
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
  for (let h = 0; h <= MAX; h++) {
    for (let a = 0; a <= MAX; a++) {
      const p = ph[h] * pa[a];
      grid.push({ h, a, p });
      if (h > a) pHome += p;
      else if (h < a) pAway += p;
      else pDraw += p;
    }
  }

  let bestTip = { h: 1, a: 1, ev: -1 };
  for (let th = 0; th <= 5; th++) {
    for (let ta = 0; ta <= 5; ta++) {
      const ev = expectedPointsForTip(lh, la, th, ta);
      if (ev > bestTip.ev) bestTip = { h: th, a: ta, ev };
    }
  }

  const basis: Prediction['basis'] =
    formSample > 0 && h2hSample > 0 ? 'form+h2h' : formSample > 0 ? 'form' : 'h2h';

  return {
    lambdaHome: lh,
    lambdaAway: la,
    pHome,
    pDraw,
    pAway,
    topScores: [...grid].sort((x, y) => y.p - x.p).slice(0, 4),
    bestTip,
    sample: formSample + h2hSample,
    formSample,
    h2hSample,
    basis,
  };
}
