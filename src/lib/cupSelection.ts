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

export function pairKey(a: string, b: string): string {
  return [canonTeam(a), canonTeam(b)].sort((x, y) => x.localeCompare(y, 'cs')).join('|');
}

export function isCzechTeam(name: string): boolean {
  return CZECH_TEAMS.has(canonTeam(name));
}

export function selectionReason(
  home: string,
  away: string,
  sourceLeague?: string,
): 'czech' | 'quarterfinalist' | null {
  if (isCzechTeam(home) || isCzechTeam(away)) return 'czech';
  const allowed = sourceLeague ? LAST_QF_BY_COMPETITION[sourceLeague] : undefined;
  if (!allowed) return null;
  if (allowed.has(canonTeam(home)) || allowed.has(canonTeam(away))) return 'quarterfinalist';
  return null;
}

export function selectCupMatch(home: string, away: string, sourceLeague?: string): boolean {
  return selectionReason(home, away, sourceLeague) !== null;
}
