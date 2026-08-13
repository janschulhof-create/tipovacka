import { unstable_cache } from 'next/cache';
import type { CompetitionKey } from './competitions';
import {
  getActiveSeason as readActiveSeason,
  getCurrentChanceRound as readCurrentChanceRound,
  getCurrentRound as readCurrentRound,
  getGoalStats as readGoalStats,
  getLiveMatches as readLiveMatches,
  getLivePointsByPlayer as readLivePointsByPlayer,
  getMisses as readMisses,
  getPlayers as readPlayers,
  getRoundPredictions as readRoundPredictions,
  getRoundLabels as readRoundLabels,
  getRoundMatches as readRoundMatches,
  getSeasonChartData as readSeasonChartData,
  getSeasonXbProjection as readSeasonXbProjection,
  getSeasonRoundPoints as readSeasonRoundPoints,
  getPostponedMatches as readPostponedMatches,
  getSeasonXbSnapshotAtRound as readSeasonXbSnapshotAtRound,
  getSeasonRounds as readSeasonRounds,
  getSeasonTipRounds as readSeasonTipRounds,
  getStandings as readStandings,
  getStoppageStats as readStoppageStats,
  getWizardAndContinentStats as readWizardAndContinentStats,
} from './queries';

/**
 * Krátká serverová cache veřejných dat stránky.
 * Tipy aktuálního hráče ani autentizaci sem záměrně nedáváme.
 */
export const getActiveSeason = unstable_cache(
  async (competitionKey: CompetitionKey = 'liga') => readActiveSeason(competitionKey),
  ['page-active-season-v1'],
  { revalidate: 1800, tags: ['tipovacka-data'] },
);

export const getSeasonRounds = unstable_cache(
  async (seasonId: number) => readSeasonRounds(seasonId),
  ['page-season-rounds-v1'],
  { revalidate: 3600, tags: ['tipovacka-data'] },
);

export const getRoundLabels = unstable_cache(
  async (seasonId: number) => readRoundLabels(seasonId),
  ['page-round-labels-v1'],
  { revalidate: 3600, tags: ['tipovacka-data'] },
);

export const getCurrentRound = unstable_cache(
  async (seasonId: number) => readCurrentRound(seasonId),
  ['page-current-round-v2'],
  { revalidate: 120, tags: ['tipovacka-data'] },
);

export const getCurrentChanceRound = unstable_cache(
  async (seasonId: number) => readCurrentChanceRound(seasonId),
  ['page-current-chance-round-v2'],
  { revalidate: 120, tags: ['tipovacka-data'] },
);

export const getRoundMatches = unstable_cache(
  async (seasonId: number, round: number) => readRoundMatches(seasonId, round),
  ['page-round-matches-v2'],
  { revalidate: 60, tags: ['tipovacka-data'] },
);

export const getRoundPredictions = unstable_cache(
  async (matchIds: number[]) => readRoundPredictions(matchIds),
  ['page-round-predictions-v1'],
  { revalidate: 30, tags: ['tipovacka-data'] },
);

export const getSeasonXbProjection = unstable_cache(
  async (seasonId: number) => readSeasonXbProjection(seasonId),
  ['page-season-xb-v1'],
  { revalidate: 300, tags: ['tipovacka-data'] },
);

/**
 * Historický xB snapshot. Cache klíč obsahuje seasonId i throughRound
 * (argumenty jsou součástí klíče), takže 1. a 2. kolo nikdy nesdílí výsledek.
 */
export const getSeasonXbSnapshotAtRound = unstable_cache(
  async (seasonId: number, throughRound: number) =>
    readSeasonXbSnapshotAtRound(seasonId, throughRound),
  ['page-season-xb-snapshot-v1'],
  { revalidate: 300, tags: ['tipovacka-data'] },
);

/** Body po kolech pro graf v tabulce. */
export const getSeasonRoundPoints = unstable_cache(
  async (seasonId: number) => readSeasonRoundPoints(seasonId),
  ['page-season-round-points-v1'],
  { revalidate: 300, tags: ['tipovacka-data'] },
);

/** Odložené zápasy pro přehledový panel. */
export const getPostponedMatches = unstable_cache(
  async (seasonId: number) => readPostponedMatches(seasonId),
  ['page-postponed-v1'],
  { revalidate: 300, tags: ['tipovacka-data'] },
);

export const getStandings = unstable_cache(
  async (seasonId: number) => readStandings(seasonId),
  ['page-standings-v1'],
  { revalidate: 60, tags: ['tipovacka-data'] },
);

export const getPlayers = unstable_cache(
  async () => readPlayers(),
  ['page-players-v1'],
  { revalidate: 3600, tags: ['tipovacka-data'] },
);

export const getSeasonChartData = unstable_cache(
  async (seasonId: number) => readSeasonChartData(seasonId),
  ['page-chart-v1'],
  { revalidate: 300, tags: ['tipovacka-data'] },
);

export const getLiveMatches = unstable_cache(
  async (seasonId: number) => readLiveMatches(seasonId),
  ['page-live-matches-v1'],
  { revalidate: 60, tags: ['tipovacka-data'] },
);

export const getLivePointsByPlayer = unstable_cache(
  async (seasonId: number) => readLivePointsByPlayer(seasonId),
  ['page-live-points-v1'],
  { revalidate: 60, tags: ['tipovacka-data'] },
);

export const getGoalStats = unstable_cache(
  async (seasonId: number) => readGoalStats(seasonId),
  ['page-goal-stats-v1'],
  { revalidate: 900, tags: ['tipovacka-data'] },
);

export const getMisses = unstable_cache(
  async (seasonId: number) => readMisses(seasonId),
  ['page-misses-v1'],
  { revalidate: 900, tags: ['tipovacka-data'] },
);

export const getSeasonTipRounds = unstable_cache(
  async (seasonId: number) => readSeasonTipRounds(seasonId),
  ['page-tip-rounds-v1'],
  { revalidate: 900, tags: ['tipovacka-data'] },
);

export const getStoppageStats = unstable_cache(
  async (seasonId: number) => readStoppageStats(seasonId),
  ['page-stoppage-v2'],
  { revalidate: 900, tags: ['tipovacka-data'] },
);

export const getWizardAndContinentStats = unstable_cache(
  async (seasonId: number) => readWizardAndContinentStats(seasonId),
  ['page-wizard-continent-region-v2'],
  { revalidate: 900, tags: ['tipovacka-data'] },
);
