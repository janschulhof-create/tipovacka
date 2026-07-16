import { canonTeam } from './teamAliases';

/**
 * Výběr zápasů z evropských pohárů.
 *
 * Nebereme všechny zápasy — jen:
 *   1) VŽDY zápasy s českým týmem (Sparta, Slavia, Plzeň, …),
 *   2) ručně vybrané zajímavé zápasy (velké značky, derby, šlágry) z allowlistu níže.
 *
 * Allowlist se udržuje tady — stačí dopsat dvojici týmů. Porovnává se
 * bez ohledu na pořadí (domácí/hosté) a přes kanonické názvy.
 */

/** České týmy, které se mohou objevit v evropských pohárech. */
const CZECH_TEAMS = new Set(
  [
    'Sparta',
    'Slavia',
    'Plzeň',
    'Baník',
    'Slovácko',
    'Jablonec',
    'Olomouc',
    'Boleslav',
    'Liberec',
    'Hradec',
    'Dukla',
    'Bohemians',
    'Teplice',
    'Karviná',
    'Pardubice',
    'Zlín',
  ].map((t) => canonTeam(t)),
);

/**
 * Ručně vybrané zajímavé zápasy (bez ohledu na pořadí týmů).
 * Klíč = dvojice kanonických názvů seřazená abecedně a spojená „|".
 * Sem dopisuj šlágry, které chceš do tipovačky pustit i bez českého týmu.
 */
const INTERESTING = new Set<string>([
  // příklady – uprav podle chuti:
  // pairKey('Real Madrid', 'Barcelona'),
  // pairKey('Manchester City', 'Bayern Mnichov'),
]);

function pairKey(a: string, b: string): string {
  return [canonTeam(a), canonTeam(b)].sort((x, y) => x.localeCompare(y, 'cs')).join('|');
}

export function isCzechTeam(name: string): boolean {
  return CZECH_TEAMS.has(canonTeam(name));
}

/**
 * Má se tenhle pohárový zápas vzít do tipovačky?
 * true = český tým na některé straně, nebo je dvojice na allowlistu.
 */
export function selectCupMatch(home: string, away: string): boolean {
  if (isCzechTeam(home) || isCzechTeam(away)) return true;
  return INTERESTING.has(pairKey(home, away));
}

/** Důvod výběru (pro ladění / štítek v UI). */
export function selectionReason(home: string, away: string): 'czech' | 'interesting' | null {
  if (isCzechTeam(home) || isCzechTeam(away)) return 'czech';
  if (INTERESTING.has(pairKey(home, away))) return 'interesting';
  return null;
}
