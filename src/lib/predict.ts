import { calculatePoints } from './scoring';
import { canonTeam } from './teamAliases';

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


export type XbFactorKey = 'h2h' | 'home' | 'away' | 'overall' | 'season' | 'context' | 'tip';

export interface XbHistoryRow {
  home: string;
  away: string;
  points: number;
}

export interface XbFactor {
  key: XbFactorKey;
  label: string;
  value: number;
  sample: number;
  /** Normalizovaná váha faktoru ve výsledném xB (0–1). */
  weight: number;
  /** Srozumitelná vysvětlivka zobrazená přímo tipérovi. */
  description: string;
}

export interface XbTrendPoint {
  index: number;
  value: number;
  actual: number;
}

export interface XbPrediction {
  value: number;
  low: number;
  high: number;
  confidence: number;
  factors: XbFactor[];
  /** Posledních maximálně 10 průběžných osobních odhadů podle tehdejší formy tipéra. */
  trend: XbTrendPoint[];
  explanation: string;
  hasTip: boolean;
}

export interface PersonalXbInput {
  home: string;
  away: string;
  archiveTips: XbHistoryRow[];
  /** Průměr všech dostupných historických tipů – prior pro hráče bez historie. */
  priorAverage?: number;
  /** Body z dokončených zápasů aktuální sezony; vynechaný tip může být předán jako 0. */
  seasonPoints?: number[];
  /** Očekávané body konkrétního uloženého tipu podle modelu skóre. */
  tipExpectedPoints?: number | null;
  tipSample?: number;
  /** Čitelnost konkrétního zápasu podle formy týmů, H2H a pravděpodobností modelu. */
  contextValue?: number | null;
  contextSample?: number;
  contextDescription?: string;
  /** Historické body v chronologickém pořadí pro graf vývoje osobního xB. */
  trendPoints?: number[];
}

const avgPoints = (rows: XbHistoryRow[]): number | null =>
  rows.length ? rows.reduce((sum, row) => sum + row.points, 0) / rows.length : null;

const clamp10 = (value: number) => Math.max(0, Math.min(10, value));

/**
 * Personalizované očekávané body tipéra pro jeden zápas.
 *
 * Výpočet je záměrně transparentní: každý faktor má hodnotu, počet vstupů,
 * normalizovanou váhu a vysvětlení. Malé vzorky se stahují k dlouhodobému
 * průměru, aby jeden povedený / nepovedený zápas nerozhodl celý odhad.
 */
export function computePersonalXb(input: PersonalXbInput): XbPrediction {
  const home = canonTeam(input.home);
  const away = canonTeam(input.away);
  const pair = [home, away].sort().join('|');
  const archiveTips = input.archiveTips.filter((row) => Number.isFinite(row.points));
  const priorAverage = clamp10(input.priorAverage ?? 3.2);
  const overallRaw = avgPoints(archiveTips) ?? priorAverage;
  const pairRows = archiveTips.filter((row) => [canonTeam(row.home), canonTeam(row.away)].sort().join('|') === pair);
  const homeRows = archiveTips.filter((row) => canonTeam(row.home) === home || canonTeam(row.away) === home);
  const awayRows = archiveTips.filter((row) => canonTeam(row.home) === away || canonTeam(row.away) === away);
  const seasonPoints = (input.seasonPoints ?? []).filter((value) => Number.isFinite(value)).map(clamp10);

  const shrink = (raw: number | null, sample: number, priorMatches: number) =>
    raw == null ? overallRaw : (raw * sample + overallRaw * priorMatches) / (sample + priorMatches);

  const drafts: Omit<XbFactor, 'weight'>[] = [
    {
      key: 'overall',
      label: 'Celková úspěšnost',
      value: overallRaw,
      sample: archiveTips.length,
      description: archiveTips.length
        ? 'Tvůj dlouhodobý průměr bodů ze všech dostupných ligových tipů. Slouží jako stabilní základ celého odhadu.'
        : 'Pro tohoto tipéra zatím nemáme vlastní minulou sezonu, proto model používá průměr celé party jako neutrální základ.',
    },
    {
      key: 'home',
      label: `Jak ti sedí ${input.home}`,
      value: shrink(avgPoints(homeRows), homeRows.length, 8),
      sample: homeRows.length,
      description: `Kolik bodů jsi historicky získával v zápasech, kde nastupoval ${input.home}, bez ohledu na soupeře a pořadí doma/venku.`,
    },
    {
      key: 'away',
      label: `Jak ti sedí ${input.away}`,
      value: shrink(avgPoints(awayRows), awayRows.length, 8),
      sample: awayRows.length,
      description: `Kolik bodů jsi historicky získával v zápasech, kde nastupoval ${input.away}. Malý vzorek se tlumí tvým dlouhodobým průměrem.`,
    },
  ];

  if (pairRows.length) {
    drafts.unshift({
      key: 'h2h',
      label: 'Vzájemné zápasy',
      value: shrink(avgPoints(pairRows), pairRows.length, 3),
      sample: pairRows.length,
      description: 'Tvoje body z minulých zápasů stejné dvojice soupeřů. Je to nejkonkrétnější faktor, ale u jednoho či dvou zápasů ho model záměrně nepřeceňuje.',
    });
  }

  if (seasonPoints.length) {
    const raw = seasonPoints.reduce((sum, value) => sum + value, 0) / seasonPoints.length;
    drafts.push({
      key: 'season',
      label: 'Forma tipéra letos',
      value: shrink(raw, seasonPoints.length, 5),
      sample: seasonPoints.length,
      description: 'Průměr bodů z dokončených zápasů aktuální sezony. Jeho vliv roste postupně, aby první kolo nerozhodlo celý rok.',
    });
  }

  if (input.contextValue != null && Number.isFinite(input.contextValue)) {
    drafts.push({
      key: 'context',
      label: 'Forma a čitelnost zápasu',
      value: clamp10(input.contextValue),
      sample: input.contextSample ?? 0,
      description: input.contextDescription
        ?? 'Jak jednoznačně se zápas jeví podle současné formy obou týmů, vzájemných výsledků a rozložení pravděpodobností modelu.',
    });
  }

  if (input.tipExpectedPoints != null && Number.isFinite(input.tipExpectedPoints)) {
    drafts.push({
      key: 'tip',
      label: 'Tvůj uložený tip',
      value: clamp10(input.tipExpectedPoints),
      sample: input.tipSample ?? 0,
      description: 'Očekávaný bodový zisk konkrétního uloženého skóre podle statistické predikce výsledku. Nejde o pravděpodobnost trefení přesného skóre.',
    });
  }

  const hasTip = drafts.some((factor) => factor.key === 'tip');
  const baseWeights: Record<XbFactorKey, number> = {
    h2h: 0.30,
    home: 0.16,
    away: 0.14,
    overall: 0.25,
    season: Math.min(0.18, 0.04 + seasonPoints.length * 0.012),
    context: input.contextValue != null && Number.isFinite(input.contextValue) ? 0.16 : 0,
    tip: hasTip ? 0.28 : 0,
  };
  const activeWeight = drafts.reduce((sum, factor) => sum + baseWeights[factor.key], 0) || 1;
  const factors: XbFactor[] = drafts.map((factor) => ({
    ...factor,
    value: clamp10(factor.value),
    weight: baseWeights[factor.key] / activeWeight,
  }));

  const value = factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0);
  const evidence = archiveTips.length
    + pairRows.length * 4
    + homeRows.length * 0.4
    + awayRows.length * 0.4
    + seasonPoints.length * 5
    + ((input.contextSample ?? 0) * 0.8);
  const confidence = Math.round(Math.max(36, Math.min(93, 41 + Math.log1p(evidence) * 8 + (hasTip ? 5 : 0))));
  const spread = Math.max(1.1, 3.4 - confidence / 38);
  const rounded = clamp10(value);
  const strongest = [...factors].sort((a, b) => b.value - a.value)[0];
  const weakest = [...factors].sort((a, b) => a.value - b.value)[0];

  const sourceTrend = (input.trendPoints ?? [])
    .filter((point) => Number.isFinite(point))
    .map(clamp10);
  let rolling = priorAverage;
  const trendAll = sourceTrend.map((actual, index) => {
    // Citlivější exponenciální forma: poslední zápasy hýbou odhadem, ale jeden extrém ho nerozbije.
    rolling = rolling * 0.68 + actual * 0.32;
    return { index: index + 1, value: Number(clamp10(rolling).toFixed(1)), actual };
  });

  return {
    value: Number(rounded.toFixed(1)),
    low: Number(Math.max(0, rounded - spread).toFixed(1)),
    high: Number(Math.min(10, rounded + spread).toFixed(1)),
    confidence,
    factors,
    trend: trendAll.slice(-10),
    explanation: strongest.value - weakest.value >= 1.2
      ? `${strongest.label} ti vychází nejlépe. Největší rezervu model vidí ve faktoru „${weakest.label}“.`
      : 'Jednotlivé faktory jsou poměrně vyrovnané, takže odhad zůstává blízko tvého dlouhodobého průměru.',
    hasTip,
  };
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
