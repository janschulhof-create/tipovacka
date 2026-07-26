import historie from '@/data/historie.json';
import { PageHeader } from '@/components/PageHeader';
import { CompetitionTabs } from '@/components/CompetitionTabs';
import { HallOfFameSection, type HofSeason, type HofStat } from '@/components/HallOfFameSection';
import {
  getCompetitionSeasons,
  getSeasonTipRounds,
  getStoppageStats,
  getWizardAndContinentStats,
  type CompetitionSeason,
} from '@/lib/queries';
import { buildHistoricalLeagueRegionTables } from '@/lib/leagueRegions';
import { computePerPlayer, type SRound } from '@/lib/seasonStats';

export const dynamic = 'force-dynamic';

type SeasonSlice = {
  name: string;
  players: string[];
  rounds: SRound[];
  complete: boolean;
};

type ContinentAggregate = {
  label: string;
  icon: string;
  rows: Map<string, { points: number; matches: number }>;
};

function namesFromRounds(rounds: SRound[]) {
  return [...new Set(
    rounds.flatMap((round) => round.matches.flatMap((match) => Object.keys(match.tips))),
  )].sort((a, b) => a.localeCompare(b, 'cs'));
}

/**
 * U databázové sezóny odvodíme okamžik, od kterého se tipér soutěže účastnil.
 * Díky tomu nový hráč nedostane v all-time statistikách fiktivní absence za
 * kola odehraná před jeho příchodem.
 */
function prepareDatabaseSlice(meta: CompetitionSeason, rawRounds: SRound[]): SeasonSlice | null {
  const players = namesFromRounds(rawRounds);
  const firstRound = new Map<string, number>();

  for (const round of rawRounds) {
    for (const match of round.matches) {
      for (const name of Object.keys(match.tips)) {
        const current = firstRound.get(name);
        if (current == null || round.round < current) firstRound.set(name, round.round);
      }
    }
  }

  const activePlayers = players.filter((name) =>
    rawRounds.some((round) => round.matches.some((match) => match.tips[name]?.pts != null)),
  );
  if (activePlayers.length === 0) return null;

  const rounds = rawRounds.map((round) => ({
    ...round,
    seasonLabel: meta.name,
    participants: activePlayers.filter((name) => (firstRound.get(name) ?? Number.POSITIVE_INFINITY) <= round.round),
  }));

  return { name: meta.name, players: activePlayers, rounds, complete: !meta.is_active };
}

function prepareHistoricalLeagueSlice(): SeasonSlice {
  const source = historie as unknown as HofSeason;
  return {
    name: source.season,
    players: source.players,
    complete: true,
    rounds: source.rounds.map((round) => ({
      ...round,
      seasonLabel: source.season,
      participants: source.players,
    })),
  };
}

function winnerOf(slice: SeasonSlice): string | null {
  if (!slice.complete || slice.players.length === 0) return null;
  const stats = computePerPlayer(slice.rounds, slice.players);
  const ranked = [...slice.players].sort(
    (a, b) => stats[b].points - stats[a].points || a.localeCompare(b, 'cs'),
  );
  return ranked[0] && stats[ranked[0]].count > 0 ? ranked[0] : null;
}

function buildTitleRows(slices: SeasonSlice[]) {
  const titles = new Map<string, number>();
  for (const slice of slices) {
    const winner = winnerOf(slice);
    if (winner) titles.set(winner, (titles.get(winner) ?? 0) + 1);
  }
  return [...titles.entries()]
    .map(([name, n]) => ({ name, val: `${n}×`, n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'cs'));
}

function buildAllTimeSeason(label: string, slices: SeasonSlice[]): HofSeason | null {
  const rounds = slices.flatMap((slice) => slice.rounds);
  const players = [...new Set(slices.flatMap((slice) => slice.players))]
    .sort((a, b) => a.localeCompare(b, 'cs'));
  if (players.length === 0 || rounds.length === 0) return null;

  const perPlayer = computePerPlayer(rounds, players);
  const stats = Object.fromEntries(players.map((name) => {
    const row = perPlayer[name];
    const stat: HofStat = {
      points: row.points,
      tens: row.tens,
      avgGoals: row.avgGoals,
      avgPoints: row.avgPoints,
      success: row.success,
      roundWins: row.roundWins,
      zeros: row.zeros,
      missed: row.missed,
      bestRound: row.bestRound,
      bestRoundNo: row.bestRoundNo,
    };
    return [name, stat];
  }));

  return { season: label, players, rounds, stats };
}

function mergeStoppage(
  all: { name: string; balance: number; affected: number }[][],
) {
  const map = new Map<string, { balance: number; affected: number }>();
  for (const rows of all) {
    for (const row of rows) {
      const current = map.get(row.name) ?? { balance: 0, affected: 0 };
      current.balance += row.balance;
      current.affected += row.affected;
      map.set(row.name, current);
    }
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, 'cs'));
}

function mergeContinents(
  all: Awaited<ReturnType<typeof getWizardAndContinentStats>>[],
): ContinentAggregate[] {
  const aggregate = new Map<string, ContinentAggregate>();
  for (const result of all) {
    for (const continent of result.continents) {
      const current = aggregate.get(continent.key) ?? {
        label: continent.label,
        icon: continent.icon,
        rows: new Map<string, { points: number; matches: number }>(),
      };
      for (const row of continent.rows) {
        const player = current.rows.get(row.name) ?? { points: 0, matches: 0 };
        player.points += row.points;
        player.matches += row.matches;
        current.rows.set(row.name, player);
      }
      aggregate.set(continent.key, current);
    }
  }
  return [...aggregate.values()];
}

export default async function SinSlavyPage() {
  const [leagueMeta, msMeta] = await Promise.all([
    getCompetitionSeasons('liga'),
    getCompetitionSeasons('ms'),
  ]);

  // Historická Chance liga 2025/26 je uložena staticky. Pokud by stejný ročník
  // existoval i v DB, vynecháme ho, aby se zápasy nezapočítaly dvakrát.
  const historicalLeague = prepareHistoricalLeagueSlice();
  const leagueDbMeta = leagueMeta.filter(
    (season) => !season.name.toLocaleLowerCase('cs').includes(historicalLeague.name.toLocaleLowerCase('cs')),
  );

  const [leagueDbRows, msDbRows] = await Promise.all([
    Promise.all(leagueDbMeta.map(async (meta) => ({
      meta,
      rounds: await getSeasonTipRounds(meta.id, 'liga'),
    }))),
    Promise.all(msMeta.map(async (meta) => ({
      meta,
      rounds: await getSeasonTipRounds(meta.id, 'ms'),
    }))),
  ]);

  const leagueSlices = [
    historicalLeague,
    ...leagueDbRows
      .map(({ meta, rounds }) => prepareDatabaseSlice(meta, rounds))
      .filter((slice): slice is SeasonSlice => slice != null),
  ];
  const msSlices = msDbRows
    .map(({ meta, rounds }) => prepareDatabaseSlice(meta, rounds))
    .filter((slice): slice is SeasonSlice => slice != null);

  const leagueAllTime = buildAllTimeSeason('Chance liga · all time', leagueSlices);
  const msAllTime = buildAllTimeSeason('Mistrovství světa · all time', msSlices);
  const leagueTitleRows = buildTitleRows(leagueSlices);
  const msTitleRows = buildTitleRows(msSlices);

  const msAnalytics = await Promise.all(msMeta.map(async (season) => {
    const [stoppage, wizardContinents] = await Promise.all([
      getStoppageStats(season.id),
      getWizardAndContinentStats(season.id),
    ]);
    return { stoppage, wizardContinents };
  }));

  const stoppage = mergeStoppage(msAnalytics.map((row) => row.stoppage));
  const continents = mergeContinents(msAnalytics.map((row) => row.wizardContinents));
  const fmtBal = (balance: number) => (
    balance > 0 ? `+${balance} b` : balance < 0 ? `−${Math.abs(balance)} b` : '0 b'
  );
  const msExtra = [{
    icon: '⏱️',
    label: 'Pán nastavení',
    accent: 'text-green-400',
    rows: stoppage.map((row) => ({ name: row.name, val: fmtBal(row.balance), n: row.balance })),
  }].filter((card) => card.rows.length > 0);

  const msContinents = continents.map((continent) => ({
    icon: continent.icon,
    label: continent.label,
    accent: 'text-pitch-light',
    rows: [...continent.rows.entries()]
      .map(([name, row]) => ({ name, val: `${row.points} b`, n: row.points }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'cs')),
  }));

  const leagueRegions = leagueAllTime
    ? buildHistoricalLeagueRegionTables(leagueAllTime.rounds, leagueAllTime.players).map((region) => ({
        icon: region.icon,
        label: region.label,
        accent: 'text-pitch-light',
        rows: region.rows.map((row) => ({
          name: row.name,
          val: `${row.points} b · ${row.matches} z.`,
          n: row.points,
        })),
      }))
    : [];

  const leagueLabels = leagueSlices.map((slice) => slice.name).join(' + ');
  const msLabels = msSlices.map((slice) => slice.name).join(' + ');

  return (
    <main>
      <PageHeader icon="🏆" title="Síň slávy" subtitle="All-time rekordy odděleně podle soutěží" />
      <CompetitionTabs
        liga={
          leagueAllTime ? (
            <>
              <p className="mb-4 text-xs text-slate-100/45">
                All-time statistiky Chance ligy: {leagueLabels}. Výsledky MS se sem nikdy nezapočítávají.
              </p>
              <HallOfFameSection
                s={leagueAllTime}
                titleRows={leagueTitleRows}
                regionalCards={leagueRegions}
              />
            </>
          ) : null
        }
        ms={
          msAllTime ? (
            <>
              <p className="mb-4 text-xs text-slate-100/45">
                All-time statistiky mistrovství světa: {msLabels}. Ligové výsledky zůstávají oddělené.
              </p>
              <HallOfFameSection
                s={msAllTime}
                titleRows={msTitleRows}
                extraCards={msExtra}
                trailingCards={msContinents}
              />
            </>
          ) : null
        }
        msLabel="MS 2026 · archiv"
      />
    </main>
  );
}
