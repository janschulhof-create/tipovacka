import type { MatchDetail } from './espn';
import { canonTeam } from './teamAliases';

export type VerifiedMatchCorrection = {
  date: string;
  home: string;
  away: string;
  finalHome: number;
  finalAway: number;
  regHome: number;
  regAway: number;
  detail: Partial<MatchDetail>;
};

type MatchLike = {
  kickoff: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  reg_home?: number | null;
  reg_away?: number | null;
  detail?: MatchDetail | null;
};

/**
 * Ručně ověřené opravy používáme pouze jako poslední zálohu, pokud detailové
 * API nevrátí kompletní události. Zdrojové API má vždy přednost u všech ostatních
 * zápasů a u polí, která už jsou kompletně uložená.
 */
export const VERIFIED_MATCH_CORRECTIONS: VerifiedMatchCorrection[] = [
  {
    date: '2026-07-25',
    home: 'Plzeň',
    away: 'Liberec',
    finalHome: 1,
    finalAway: 3,
    regHome: 1,
    regAway: 2,
    detail: {
      venue: 'Doosan Arena',
      city: 'Plzeň',
      attendance: 10068,
      goals: [
        { min: "27'", side: 'away', player: 'Ladra', kind: 'own' },
        { min: "51'", side: 'home', player: 'Krčík', kind: 'penalty' },
        { min: "76'", side: 'away', player: 'Soliu', kind: 'goal' },
        { min: "90+5'", side: 'away', player: 'Dulay', kind: 'goal' },
      ],
      stats: {
        home: { possession: '58%', shots: '4', sot: '1', corners: '5', fouls: '12', cards: '2' },
        away: { possession: '42%', shots: '19', sot: '10', corners: '4', fouls: '17', cards: '5' },
      },
    },
  },
];

function pragueDate(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function hasStats(detail: MatchDetail | null | undefined): boolean {
  return !!detail?.stats
    && (Object.keys(detail.stats.home).length > 0 || Object.keys(detail.stats.away).length > 0);
}

function hasCompleteGoals(
  detail: MatchDetail | null | undefined,
  finalHome: number,
  finalAway: number,
): boolean {
  if (!detail?.goals?.length) return finalHome === 0 && finalAway === 0;
  let home = 0;
  let away = 0;
  for (const goal of detail.goals) {
    if (goal.side === 'home') home++;
    else away++;
  }
  return home === finalHome && away === finalAway;
}

export function getVerifiedMatchCorrection(match: MatchLike): VerifiedMatchCorrection | null {
  const date = pragueDate(match.kickoff);
  const home = canonTeam(match.home_team);
  const away = canonTeam(match.away_team);
  return VERIFIED_MATCH_CORRECTIONS.find((correction) => (
    correction.date === date
    && correction.home === home
    && correction.away === away
    && correction.finalHome === match.home_score
    && correction.finalAway === match.away_score
  )) ?? null;
}

export function mergeVerifiedMatchDetail(
  detail: MatchDetail | null | undefined,
  correction: VerifiedMatchCorrection | null,
): MatchDetail | null | undefined {
  if (!correction) return detail;
  const current = detail ?? {};
  return {
    ...current,
    venue: current.venue ?? correction.detail.venue,
    city: current.city ?? correction.detail.city,
    attendance: current.attendance ?? correction.detail.attendance,
    goals: hasCompleteGoals(current, correction.finalHome, correction.finalAway)
      ? current.goals
      : correction.detail.goals,
    stats: hasStats(current) ? current.stats : correction.detail.stats,
  };
}

export function applyVerifiedMatchCorrection<T extends MatchLike>(match: T): T {
  const correction = getVerifiedMatchCorrection(match);
  if (!correction) return match;
  return {
    ...match,
    reg_home: correction.regHome,
    reg_away: correction.regAway,
    detail: mergeVerifiedMatchDetail(match.detail, correction),
  };
}
