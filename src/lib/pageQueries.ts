import { unstable_cache } from 'next/cache';
import type { CompetitionKey } from './competitions';
import {
  getActiveSeason as readActiveSeason,
  getCurrentRound as readCurrentRound,
  getGoalStats as readGoalStats,
  getLiveMatches as readLiveMatches,
  getLivePointsByPlayer as readLivePointsByPlayer,
  getMisses as readMisses,
  getPlayers as readPlayers,
  getRoundLabels as readRoundLabels,
  getRoundMatches as readRoundMatches,
  getSeasonChartData as readSeasonChartData,
  getSeasonXbProjection as readSeasonXbProjection,
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
  { revalidate: 300 },
);

export const getSeasonRounds = unstable_cache(
  async (seasonId: number) => readSeasonRounds(seasonId),
  ['page-season-rounds-v1'],
  { revalidate: 300 },
);

export const getRoundLabels = unstable_cache(
  async (seasonId: number) => readRoundLabels(seasonId),
  ['page-round-labels-v1'],
  { revalidate: 300 },
);

export const getCurrentRound = unstable_cache(
  async (seasonId: number) => readCurrentRound(seasonId),
  ['page-current-round-v1'],
  { revalidate: 30 },
);

export const getRoundMatches = unstable_cache(
  async (seasonId: number, round: number) => readRoundMatches(seasonId, round),
  ['page-round-matches-v1'],
  { revalidate: 10 },
);

export const getSeasonXbProjection = unstable_cache(
  async (seasonId: number) => readSeasonXbProjection(seasonId),
  ['page-season-xb-v1'],
  { revalidate: 60 },
);

export const getStandings = unstable_cache(
  async (seasonId: number) => readStandings(seasonId),
  ['page-standings-v1'],
  { revalidate: 15 },
);

export const getPlayers = unstable_cache(
  async () => readPlayers(),
  ['page-players-v1'],
  { revalidate: 300 },
);

export const getSeasonChartData = unstable_cache(
  async (seasonId: number) => readSeasonChartData(seasonId),
  ['page-chart-v1'],
  { revalidate: 30 },
);

export const getLiveMatches = unstable_cache(
  async (seasonId: number) => readLiveMatches(seasonId),
  ['page-live-matches-v1'],
  { revalidate: 10 },
);

export const getLivePointsByPlayer = unstable_cache(
  async (seasonId: number) => readLivePointsByPlayer(seasonId),
  ['page-live-points-v1'],
  { revalidate: 10 },
);

export const getGoalStats = unstable_cache(
  async (seasonId: number) => readGoalStats(seasonId),
  ['page-goal-stats-v1'],
  { revalidate: 60 },
);

export const getMisses = unstable_cache(
  async (seasonId: number) => readMisses(seasonId),
  ['page-misses-v1'],
  { revalidate: 60 },
);

export const getSeasonTipRounds = unstable_cache(
  async (seasonId: number) => readSeasonTipRounds(seasonId),
  ['page-tip-rounds-v1'],
  { revalidate: 60 },
);

export const getStoppageStats = unstable_cache(
  async (seasonId: number) => readStoppageStats(seasonId),
  ['page-stoppage-v1'],
  { revalidate: 60 },
);

export const getWizardAndContinentStats = unstable_cache(
  async (seasonId: number) => readWizardAndContinentStats(seasonId),
  ['page-wizard-continent-v1'],
  { revalidate: 60 },
);
