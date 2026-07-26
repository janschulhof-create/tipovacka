import { PageHeader } from '@/components/PageHeader';
import { H2HCompare, type H2HSeason } from '@/components/H2HCompare';
import historie from '@/data/historie.json';
import { getMsSeason } from '@/lib/msSeason';
import { getCompetitionSeasons, getPlayers, getSeasonTipRounds } from '@/lib/queries';
import type { SRound } from '@/lib/seasonStats';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'H2H — souboj tipérů' };

type LeagueArchive = { season: string; players: string[]; rounds: SRound[] };

function playerNamesFromRounds(rounds: SRound[]) {
  return [...new Set(
    rounds.flatMap((round) => round.matches.flatMap((match) => Object.keys(match.tips))),
  )].sort((a, b) => a.localeCompare(b, 'cs'));
}

/**
 * Databázovou ligovou sezonu převede do stejného tvaru jako historický archiv.
 * U každého tipéra si hlídáme první kolo, ve kterém se skutečně zapojil, aby
 * nově přidaní hráči nedostávali fiktivní absence za starší kola.
 */
function databaseLeagueSeason(
  key: string,
  season: string,
  rounds: SRound[],
  activeRoster: string[],
  isActive: boolean,
): H2HSeason | null {
  if (rounds.length === 0 && !isActive) return null;

  const firstRound = new Map<string, number>();
  for (const round of rounds) {
    for (const match of round.matches) {
      for (const name of Object.keys(match.tips)) {
        const current = firstRound.get(name);
        if (current == null || round.round < current) firstRound.set(name, round.round);
      }
    }
  }

  const players = [...new Set([
    ...playerNamesFromRounds(rounds),
    ...(isActive ? activeRoster : []),
  ])].sort((a, b) => a.localeCompare(b, 'cs'));

  return {
    key,
    competition: 'Chance liga',
    season,
    players,
    rounds: rounds.map((round) => ({
      ...round,
      seasonLabel: season,
      participants: players.filter((name) => {
        const joined = firstRound.get(name);
        return joined != null && joined <= round.round;
      }),
    })),
  };
}

export default async function H2HPage() {
  const liga = historie as unknown as LeagueArchive;
  const [leagueMeta, activePlayers, ms] = await Promise.all([
    getCompetitionSeasons('liga'),
    getPlayers(),
    getMsSeason(),
  ]);

  const activeRoster = activePlayers.map((player) => player.name);
  const historicalLeague: H2HSeason = {
    key: `liga-${liga.season}`,
    competition: 'Chance liga',
    season: liga.season,
    players: liga.players,
    rounds: liga.rounds.map((round) => ({
      ...round,
      seasonLabel: liga.season,
      participants: liga.players,
    })),
  };

  // Stejný ročník nesmí být současně ze statického archivu i z databáze.
  const leagueDbMeta = leagueMeta.filter(
    (row) => !row.name.toLocaleLowerCase('cs').includes(liga.season.toLocaleLowerCase('cs')),
  );
  const leagueDbRows = await Promise.all(leagueDbMeta.map(async (meta) => ({
    meta,
    rounds: await getSeasonTipRounds(meta.id, 'liga'),
  })));

  const leagueSeasons = leagueDbRows
    .map(({ meta, rounds }) => databaseLeagueSeason(
      `liga-${meta.id}`,
      meta.name,
      rounds,
      activeRoster,
      meta.is_active,
    ))
    .filter((season): season is H2HSeason => season != null);

  const seasons: H2HSeason[] = [historicalLeague, ...leagueSeasons];

  if (ms) {
    seasons.unshift({
      key: 'ms-2026',
      competition: 'MS 2026',
      season: ms.data.season,
      players: ms.data.players,
      rounds: ms.rounds,
    });
  }

  return (
    <main>
      <PageHeader icon="⚔️" title="H2H" subtitle="Souboj dvou tipérů napříč statistikami" />
      <H2HCompare seasons={seasons} />
    </main>
  );
}
