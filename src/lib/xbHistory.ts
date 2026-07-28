import type { XbHistoryRow } from './predict';
import { calculatePoints } from './scoring';

export interface CurrentSeasonFinishedMatch {
  id: number;
  kickoff: string;
  home_team: string;
  away_team: string;
  home_score?: number | null;
  away_score?: number | null;
}

export interface CurrentSeasonPrediction {
  match_id: number;
  points: number | null;
  predicted_home?: number | null;
  predicted_away?: number | null;
}

export interface PersonalXbHistoryResult {
  combined: XbHistoryRow[];
  currentSeason: XbHistoryRow[];
  eligibleMatchIds: Set<number>;
  predictionByMatch: Map<number, CurrentSeasonPrediction>;
}


/**
 * xB je predikce v čase daného zápasu. Při zpětném otevření staršího kola
 * proto nesmí použít výsledky, které se odehrály až později (hindsight leak).
 */
export function isMatchBeforeTarget(
  match: { id: number; kickoff: string },
  target: { id: number; kickoff: string },
): boolean {
  if (match.id === target.id) return false;
  const matchTime = Date.parse(match.kickoff);
  const targetTime = Date.parse(target.kickoff);
  if (!Number.isFinite(matchTime) || !Number.isFinite(targetTime)) return false;
  return matchTime < targetTime;
}

/**
 * Sjednotí statickou historickou Chance ligu s dokončenými zápasy právě
 * probíhající sezony.
 *
 * Důležitá pravidla:
 * - veterán s archivní historií má v aktuální sezoně za chybějící tip 0 bodů,
 * - nováček bez archivní historie začíná až prvním skutečně uloženým tipem;
 *   starší zápasy se mu zpětně jako nuly nepřipisují,
 * - od prvního tipu nováčka jsou další dokončené zápasy bez tipu opět 0 bodů,
 * - každý match id se započítá nejvýše jednou a pouze po dokončení zápasu.
 */
export function buildPersonalXbHistory(input: {
  archiveTips: XbHistoryRow[];
  finishedMatches: CurrentSeasonFinishedMatch[];
  predictions: CurrentSeasonPrediction[];
}): PersonalXbHistoryResult {
  const archiveTips = input.archiveTips
    .filter((row) => Number.isFinite(row.points))
    .map((row) => ({ ...row, source: row.source ?? 'archive' as const }));

  const predictionByMatch = new Map<number, CurrentSeasonPrediction>();
  for (const prediction of input.predictions) {
    if (!Number.isFinite(prediction.match_id)) continue;
    predictionByMatch.set(prediction.match_id, prediction);
  }

  // Sync může v krajním případě vrátit duplicitní řádek. Pro osobní historii
  // je match id kanonický identifikátor a druhou kopii ignorujeme.
  const seen = new Set<number>();
  const finished = [...input.finishedMatches]
    .filter((match) => {
      if (!Number.isFinite(match.id) || seen.has(match.id)) return false;
      seen.add(match.id);
      return Boolean(match.home_team && match.away_team && Number.isFinite(Date.parse(match.kickoff)));
    })
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id - b.id);

  const firstPredictionIndex = finished.findIndex((match) => predictionByMatch.has(match.id));
  const eligible = archiveTips.length > 0
    ? finished
    : firstPredictionIndex >= 0
      ? finished.slice(firstPredictionIndex)
      : [];

  const currentSeason: XbHistoryRow[] = eligible.map((match) => {
    const prediction = predictionByMatch.get(match.id);
    const canResolvePoints = prediction
      && prediction.predicted_home != null
      && prediction.predicted_away != null
      && Number.isFinite(prediction.predicted_home)
      && Number.isFinite(prediction.predicted_away)
      && match.home_score != null
      && match.away_score != null
      && Number.isFinite(match.home_score)
      && Number.isFinite(match.away_score);
    const points = prediction?.points != null && Number.isFinite(prediction.points)
      ? prediction.points
      : canResolvePoints
        ? calculatePoints(
            match.home_score as number,
            match.away_score as number,
            prediction.predicted_home as number,
            prediction.predicted_away as number,
          )
        : 0;
    return {
      matchId: match.id,
      kickoff: match.kickoff,
      home: match.home_team,
      away: match.away_team,
      points,
      source: 'database',
    };
  });

  return {
    combined: [...archiveTips, ...currentSeason],
    currentSeason,
    eligibleMatchIds: new Set(currentSeason.map((row) => row.matchId).filter((id): id is number => id != null)),
    predictionByMatch,
  };
}
