import { canonTeam } from './teamAliases';

/** České kluby vybíráme ve všech evropských soutěžích vždy. */
const CZECH_TEAMS = new Set(
  [
    'Sparta', 'Slavia', 'Plzeň', 'Baník', 'Slovácko', 'Jablonec', 'Olomouc',
    'Boleslav', 'Liberec', 'Hradec Králové', 'Dukla', 'Bohemians', 'Teplice',
    'Karviná', 'Pardubice', 'Zlín', 'Zbrojovka Brno', 'Artis Brno',
  ].map((team) => canonTeam(team)),
);

/** Čtvrtfinalisté evropských pohárů 2025/26 – odděleně podle soutěže. */
const LAST_QF_BY_COMPETITION: Record<string, Set<string>> = {
  'uefa.champions': new Set([
    'Arsenal', 'Sporting CP', 'Real Madrid', 'Bayern Mnichov',
    'Barcelona', 'Atlético Madrid', 'PSG', 'Liverpool',
  ].map(canonTeam)),
  'uefa.champions_qual': new Set([
    'Arsenal', 'Sporting CP', 'Real Madrid', 'Bayern Mnichov',
    'Barcelona', 'Atlético Madrid', 'PSG', 'Liverpool',
  ].map(canonTeam)),
  'uefa.europa': new Set([
    'Braga', 'Real Betis', 'Bologna', 'Aston Villa',
    'Porto', 'Nottingham Forest', 'Freiburg', 'Celta Vigo',
  ].map(canonTeam)),
  'uefa.europa_qual': new Set([
    'Braga', 'Real Betis', 'Bologna', 'Aston Villa',
    'Porto', 'Nottingham Forest', 'Freiburg', 'Celta Vigo',
  ].map(canonTeam)),
  'uefa.europa.conf': new Set([
    'Rayo Vallecano', 'AEK Athény', 'Mainz', 'Štrasburk',
    'Crystal Palace', 'Fiorentina', 'Šachtar Doněck', 'AZ Alkmaar',
  ].map(canonTeam)),
  'uefa.europa.conf_qual': new Set([
    'Rayo Vallecano', 'AEK Athény', 'Mainz', 'Štrasburk',
    'Crystal Palace', 'Fiorentina', 'Šachtar Doněck', 'AZ Alkmaar',
  ].map(canonTeam)),
};

/**
 * Známé a divácky atraktivní kluby, které chceme sledovat i tehdy, když
 * nebyly čtvrtfinalisty předchozí sezony. Seznam je záměrně omezený, aby
 * týdenní kolo Evropy zůstalo přehledné a neobsahovalo desítky okrajových duelů.
 */
const FEATURED_TEAMS = new Set([
  'Ajax',
  'Celtic',
  'Rangers',
  'Fenerbahçe',
  'Feyenoord',
  'Benfica',
  'Club Brugge',
  'Salzburg',
  'Crvena zvezda',
  'Copenhagen',
  'Ferencváros',
  'Panathinaikos',
  'Dynamo Kyjev',
  'Basel',
  'Malmö',
  'Slovan Bratislava',
  'Sturm Graz',
  'Nice',
  'Anderlecht',
  'Beşiktaş',
  'Gent',
  'Austria Wien',
  'Başakşehir',
  'Rapid Vídeň',
  'PAOK',
  'Dinamo Zagreb',
].map(canonTeam));

function normalizedRaw(name: string | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pairKey(a: string, b: string): string {
  return [canonTeam(a), canonTeam(b)].sort((x, y) => x.localeCompare(y, 'cs')).join('|');
}

/**
 * „Bohemians“ je v evropských datech nejednoznačné jméno. Samotný název
 * bez 1905/Praha/Prague patří v ročníku 2026/27 irskému Bohemian FC a nesmí
 * se považovat za český klub.
 */
export function isCzechTeam(name: string, sourceName?: string): boolean {
  const canonical = canonTeam(name);
  if (!CZECH_TEAMS.has(canonical)) return false;
  if (canonical !== 'Bohemians') return true;

  const raw = normalizedRaw(sourceName ?? name);
  return /\b1905\b|\bpraha\b|\bprague\b/.test(raw);
}

export type CupSelectionReason = 'czech' | 'quarterfinalist' | 'featured';

export function selectionReason(
  home: string,
  away: string,
  sourceLeague?: string,
  homeSourceName?: string,
  awaySourceName?: string,
): CupSelectionReason | null {
  if (isCzechTeam(home, homeSourceName) || isCzechTeam(away, awaySourceName)) return 'czech';

  const allowed = sourceLeague ? LAST_QF_BY_COMPETITION[sourceLeague] : undefined;
  if (allowed && (allowed.has(canonTeam(home)) || allowed.has(canonTeam(away)))) {
    return 'quarterfinalist';
  }

  if (FEATURED_TEAMS.has(canonTeam(home)) || FEATURED_TEAMS.has(canonTeam(away))) {
    return 'featured';
  }

  return null;
}

export function selectCupMatch(
  home: string,
  away: string,
  sourceLeague?: string,
  homeSourceName?: string,
  awaySourceName?: string,
): boolean {
  return selectionReason(home, away, sourceLeague, homeSourceName, awaySourceName) !== null;
}
