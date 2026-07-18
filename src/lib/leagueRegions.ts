import { canonTeam } from './teamAliases';

/**
 * Hravé regionální rozdělení klubů Chance ligy.
 * Zápas dvou různých regionů se započítá do obou tabulek; derby uvnitř
 * jednoho regionu pouze jednou.
 */
export type LeagueRegionKey = 'SUDETY' | 'PRAHA' | 'MORAVA' | 'CECHY';

export type LeagueRegionTable = {
  key: LeagueRegionKey;
  label: string;
  icon: string;
  rows: { name: string; points: number; matches: number }[];
};

export const LEAGUE_REGIONS: { key: LeagueRegionKey; label: string; icon: string }[] = [
  { key: 'SUDETY', label: 'Sudety', icon: '🏔️' },
  { key: 'PRAHA', label: 'Pražská kavárna', icon: '☕' },
  { key: 'MORAVA', label: 'Velkomoravská říše', icon: '👑' },
  { key: 'CECHY', label: 'Čechy', icon: '🦁' },
];

/** Kanonický název týmu → region. */
export const TEAM_LEAGUE_REGION: Record<string, LeagueRegionKey> = {
  // Sudety
  Liberec: 'SUDETY',
  Jablonec: 'SUDETY',
  Teplice: 'SUDETY',

  // Pražská kavárna
  Dukla: 'PRAHA',
  Bohemians: 'PRAHA',
  Sparta: 'PRAHA',
  Slavia: 'PRAHA',

  // Velkomoravská říše
  'Zbrojovka Brno': 'MORAVA',
  'Artis Brno': 'MORAVA',
  Zlín: 'MORAVA',
  Slovácko: 'MORAVA',
  Olomouc: 'MORAVA',
  Baník: 'MORAVA',
  Karviná: 'MORAVA',

  // Čechy
  Plzeň: 'CECHY',
  Táborsko: 'CECHY',
  'Hradec Králové': 'CECHY',
  Pardubice: 'CECHY',
};

/** Regiony, kterých se zápas týká (unikátně). */
export function matchLeagueRegions(home: string, away: string): LeagueRegionKey[] {
  const out = new Set<LeagueRegionKey>();
  const h = TEAM_LEAGUE_REGION[canonTeam(home)];
  const a = TEAM_LEAGUE_REGION[canonTeam(away)];
  if (h) out.add(h);
  if (a) out.add(a);
  return [...out];
}

type HistoricalTip = { pts: number | null };
type HistoricalRound = {
  matches: {
    home: string;
    away: string;
    tips: Record<string, HistoricalTip>;
  }[];
};

/** Regionální tabulky z uložené historické sezóny (Historie / Síň slávy). */
export function buildHistoricalLeagueRegionTables(
  rounds: HistoricalRound[],
  players: string[],
): LeagueRegionTable[] {
  const tables = new Map<LeagueRegionKey, Map<string, { points: number; matches: number }>>();

  for (const round of rounds) {
    for (const match of round.matches) {
      const regions = matchLeagueRegions(match.home, match.away);
      if (regions.length === 0) continue;

      for (const key of regions) {
        const table = tables.get(key) ?? new Map<string, { points: number; matches: number }>();
        for (const player of players) {
          const points = match.tips[player]?.pts;
          if (points == null) continue;
          const current = table.get(player) ?? { points: 0, matches: 0 };
          current.points += points;
          current.matches += 1;
          table.set(player, current);
        }
        tables.set(key, table);
      }
    }
  }

  return LEAGUE_REGIONS.filter((region) => tables.has(region.key)).map((region) => ({
    ...region,
    rows: [...(tables.get(region.key) ?? new Map()).entries()]
      .map(([name, value]) => ({ name, points: value.points, matches: value.matches }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'cs')),
  }));
}
