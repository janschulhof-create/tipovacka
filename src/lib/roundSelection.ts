import { POSTPONED_ROUND } from './postponed';
import type { Match } from './types';

type CurrentRoundRow = Pick<Match, 'round' | 'kickoff' | 'status'>;

const MATCH_ESTIMATED_DURATION_MS = 2 * 60 * 60 * 1000;
/** Jak dlouho se kolo drží po dohrání posledního zápasu. */
const FINISHED_ROUND_GRACE_MS = 24 * 60 * 60 * 1000;
/** Jak dlouho předem se kolo zobrazí, i když předchozí ještě „doznívá“. */
const UPCOMING_ROUND_LEAD_MS = 24 * 60 * 60 * 1000;

export function selectCurrentRound(
  rows: CurrentRoundRow[],
  nowMs: number = Date.now(),
): number | null {
  const byRound = new Map<number, CurrentRoundRow[]>();

  for (const row of rows) {
    const kickoffMs = new Date(row.kickoff).getTime();
    if (!Number.isFinite(row.round) || !Number.isFinite(kickoffMs)) continue;

    // Odložené zápasy tvoří vlastní pohled (POSTPONED_ROUND). Do svého
    // původního kola se počítají BODY, ale pro výběr zobrazeného kola se
    // řadí zvlášť – jinak by zápas odložený o měsíc držel staré kolo
    // otevřené, nebo by naopak zmizel z dohledu.
    const bucketRound = row.status === 'postponed' ? POSTPONED_ROUND : row.round;

    const bucket = byRound.get(bucketRound) ?? [];
    bucket.push(row);
    byRound.set(bucketRound, bucket);
  }

  const rounds = [...byRound.entries()].map(([round, matches]) => {
    // Zrušený zápas nesmí držet kolo otevřené. Odložený se z běžného kola
    // vyjímá už při rozdělení výše; ve vlastní skupině je naopak jediný obsah.
    const playable = round === POSTPONED_ROUND
      ? matches.filter((match) => match.status !== 'cancelled')
      : matches.filter(
        (match) => match.status !== 'cancelled' && match.status !== 'postponed',
      );
    const relevant = playable.length > 0 ? playable : matches;
    const kickoffs = relevant
      .map((match) => new Date(match.kickoff).getTime())
      .filter(Number.isFinite);
    const firstKickoff = Math.min(...kickoffs);
    const lastKickoff = Math.max(...kickoffs);
    const hasLiveMatch = relevant.some((match) => match.status === 'live');
    const hasStarted = hasLiveMatch
      || relevant.some((match) => match.status === 'finished')
      || firstKickoff <= nowMs;

    return {
      round,
      firstKickoff,
      lastKickoff,
      hasLiveMatch,
      hasStarted,
      retainUntil: lastKickoff + MATCH_ESTIMATED_DURATION_MS + FINISHED_ROUND_GRACE_MS,
    };
  }).filter((round) => Number.isFinite(round.firstKickoff) && Number.isFinite(round.lastKickoff));

  if (rounds.length === 0) return null;

  // Živý zápas má vždy přednost.
  const liveRound = rounds
    .filter((round) => round.hasLiveMatch)
    .sort((a, b) => b.firstKickoff - a.firstKickoff)[0];
  if (liveRound) return liveRound.round;

  // Kolo, jehož první zápas je na spadnutí (do 24 h). Má PŘEDNOST před
  // doháněním právě dohraného kola: co se teprve chystá, je užitečnější
  // než to, co už proběhlo.
  const imminentRound = rounds
    .filter((round) => round.firstKickoff > nowMs
      && round.firstKickoff - nowMs <= UPCOMING_ROUND_LEAD_MS)
    .sort((a, b) => a.firstKickoff - b.firstKickoff)[0];
  if (imminentRound) return imminentRound.round;

  // Probíhající nebo čerstvě dohrané kolo držíme ještě 24 hodin.
  const retainedRound = rounds
    .filter((round) => round.hasStarted && nowMs <= round.retainUntil)
    .sort((a, b) => b.firstKickoff - a.firstKickoff)[0];
  if (retainedRound) return retainedRound.round;

  // Poté se přepneme na nejbližší budoucí kolo.
  const upcomingRound = rounds
    .filter((round) => round.firstKickoff > nowMs)
    .sort((a, b) => a.firstKickoff - b.firstKickoff)[0];
  if (upcomingRound) return upcomingRound.round;

  // Po konci sezóny zůstane poslední odehrané kolo.
  return rounds.sort((a, b) => b.lastKickoff - a.lastKickoff)[0]?.round ?? null;
}
