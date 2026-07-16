import { canonTeam } from './teamAliases';

/** České kluby, jejichž evropské zápasy se vybírají vždy. */
const CZECH_TEAMS = new Set(
  [
    'Sparta', 'Slavia', 'Plzeň', 'Baník', 'Slovácko', 'Jablonec', 'Olomouc',
    'Boleslav', 'Liberec', 'Hradec Králové', 'Dukla', 'Bohemians', 'Teplice',
    'Karviná', 'Pardubice', 'Zlín', 'Zbrojovka Brno', 'Artis Brno',
  ].map((t) => canonTeam(t)),
);

/** Kluby, jejichž vzájemné zápasy považujeme za automatický evropský šlágr. */
const FEATURED_CLUBS = new Set(
  [
    'Real Madrid', 'Barcelona', 'Atlético Madrid', 'Manchester City', 'Liverpool',
    'Arsenal', 'Chelsea', 'Manchester United', 'Bayern Mnichov', 'Dortmund',
    'PSG', 'Inter Milán', 'AC Milán', 'Juventus', 'Neapol', 'Benfica', 'Porto',
  ].map((t) => canonTeam(t)),
);

/** Ruční allowlist. Stačí doplnit dvojici přes `pairKey`. */
const INTERESTING = new Set<string>([
  // pairKey('Ajax', 'Feyenoord'),
]);

export function pairKey(a: string, b: string): string {
  return [canonTeam(a), canonTeam(b)].sort((x, y) => x.localeCompare(y, 'cs')).join('|');
}

export function isCzechTeam(name: string): boolean {
  return CZECH_TEAMS.has(canonTeam(name));
}

export function selectionReason(home: string, away: string): 'czech' | 'featured' | 'manual' | null {
  if (isCzechTeam(home) || isCzechTeam(away)) return 'czech';
  const h = canonTeam(home);
  const a = canonTeam(away);
  if (FEATURED_CLUBS.has(h) && FEATURED_CLUBS.has(a)) return 'featured';
  if (INTERESTING.has(pairKey(home, away))) return 'manual';
  return null;
}

export function selectCupMatch(home: string, away: string): boolean {
  return selectionReason(home, away) !== null;
}
