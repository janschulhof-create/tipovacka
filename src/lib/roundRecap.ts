import type { Match, Player, RoundPrediction, StandingRow } from './types';
import { calculatePoints } from './scoring';

export type RoundRecapMode = 'waiting' | 'progress' | 'final';
export type Outcome = 'home' | 'draw' | 'away';
export type CinemaReason = 'stoppage' | 'leader-swing' | 'goals' | 'cards' | 'crowd-shock';

export interface RoundRecapPreviousSeasonStat {
  name: string;
  avgPoints: number;
  bestRound: number;
  roundWins: number;
  zeros: number;
}

export interface RoundRecapXbSnapshot {
  name: string;
  actualPoints: number;
  expectedXb: number;
}

export interface RoundRecapPlayer {
  name: string;
  points: number;
  evaluatedTips: number;
  exactHits: number;
  zeros: number;
  roundAverage: number;
  bestTip: string | null;
  currentOverallRank: number | null;
  previousOverallRank: number | null;
  rankMovement: number;
  previousSeasonAverage: number | null;
  vsPreviousSeasonAverage: number | null;
  previousBestRound: number | null;
  beatPreviousBestRound: boolean;
  seasonActualPoints: number | null;
  seasonExpectedXb: number | null;
  seasonVsXb: number | null;
}

export interface RoundRecapMatch {
  id: number;
  label: string;
  homeTeam: string;
  awayTeam: string;
  score: string;
  totalGoals: number;
  goalDifference: number;
  tips: Array<{ name: string; tip: string; points: number }>;
  exactHitters: string[];
  zeroTipsters: string[];
  redCards: number;
  stoppageChangedScore: boolean;
  actualOutcome: Outcome;
  crowdFavorite: {
    outcome: Outcome;
    count: number;
    total: number;
    share: number;
    team: string | null;
  } | null;
  crowdShock: boolean;
}

export interface RoundRecapFacts {
  roundTitle: string;
  seasonName: string;
  previousSeasonName: string | null;
  mode: RoundRecapMode;
  completedMatches: number;
  totalMatches: number;
  remainingMatches: number;
  liveMatches: number;
  cancelledMatches: number;
  players: RoundRecapPlayer[];
  leader: RoundRecapPlayer | null;
  runnerUp: RoundRecapPlayer | null;
  worst: RoundRecapPlayer | null;
  dominantLeader: { name: string; points: number; gap: number } | null;
  totalExactHits: number;
  totalZeros: number;
  matches: RoundRecapMatch[];
  mostExactMatch: { label: string; count: number } | null;
  mostMissedMatch: { label: string; count: number } | null;
  biggestRise: { name: string; places: number } | null;
  biggestFall: { name: string; places: number } | null;
  lastMatchSwing: { match: string; beforeLeader: string; afterLeader: string } | null;
  xbOverperformer: { name: string; actual: number; expected: number; delta: number } | null;
  xbUnderperformer: { name: string; actual: number; expected: number; delta: number } | null;
  bestVsLastSeason: { name: string; roundAverage: number; previousAverage: number; delta: number } | null;
  worstVsLastSeason: { name: string; roundAverage: number; previousAverage: number; delta: number } | null;
  previousBestBeaten: { name: string; points: number; previousBest: number } | null;
  consensusShock: { match: string; score: string; favoriteTeam: string | null; share: number; zeros: number } | null;
  divizeCandidate: { team: string; match: string; score: string; share: number } | null;
  cinemaCandidate: { match: string; score: string; reason: CinemaReason } | null;
  snowman: { name: string; points: number; zeros: number; xbDelta: number | null } | null;
  blamageCandidate: { label: string; detail: string } | null;
  overallStandings: Array<{ name: string; points: number }>;
}

function redCardCount(match: Match): number {
  return (match.detail?.cards ?? []).filter((card) => card.color === 'red').length;
}

function scoreChangedInStoppage(match: Match): boolean {
  return match.status === 'finished'
    && match.reg_home != null
    && match.reg_away != null
    && match.home_score != null
    && match.away_score != null
    && (match.reg_home !== match.home_score || match.reg_away !== match.away_score)
    && match.duration !== 'EXTRA_TIME'
    && match.duration !== 'PENALTY_SHOOTOUT';
}

function outcome(home: number, away: number): Outcome {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

function crowdFavoriteFor(match: Match, rows: RoundPrediction[]) {
  if (!rows.length) return null;
  const counts: Record<Outcome, number> = { home: 0, draw: 0, away: 0 };
  for (const row of rows) counts[outcome(row.predicted_home, row.predicted_away)] += 1;
  const ordered: Outcome[] = ['home', 'draw', 'away'];
  const favorite = ordered.reduce((best, value) => counts[value] > counts[best] ? value : best, 'home' as Outcome);
  const max = counts[favorite];
  const tied = ordered.filter((value) => counts[value] === max).length > 1;
  if (tied || max === 0) return null;
  return {
    outcome: favorite,
    count: max,
    total: rows.length,
    share: max / rows.length,
    team: favorite === 'home' ? match.home_team : favorite === 'away' ? match.away_team : null,
  };
}

/**
 * Připraví pouze ověřitelná fakta. Claude z nich smí vytvořit styl, ale nikdy
 * nepočítá body ani nedoplňuje události sám.
 */
export function buildRoundRecapFacts(input: {
  matches: Match[];
  players: Player[];
  predictions: RoundPrediction[];
  standings?: StandingRow[];
  xbSnapshots?: RoundRecapXbSnapshot[];
  previousSeasonStats?: RoundRecapPreviousSeasonStat[];
  previousSeasonName?: string | null;
  roundTitle: string;
  seasonName: string;
  /** Pořadí z dashboardu je aktuální; u ručně otevřeného staršího kola z něj nesmíme dopočítávat historický posun ani aktuální xB snapshot. */
  includeStandingMovement?: boolean;
}): RoundRecapFacts {
  const relevantMatches = input.matches.filter((match) => match.status !== 'cancelled');
  const completed = relevantMatches.filter(
    (match) => match.status === 'finished' && match.home_score != null && match.away_score != null,
  );
  const completedIds = new Set(completed.map((match) => match.id));
  const liveMatches = relevantMatches.filter((match) => match.status === 'live').length;
  const cancelledMatches = input.matches.filter((match) => match.status === 'cancelled').length;
  const final = relevantMatches.length > 0 && completed.length === relevantMatches.length;
  const mode: RoundRecapMode = completed.length === 0 ? 'waiting' : final ? 'final' : 'progress';

  const completedById = new Map(completed.map((match) => [match.id, match] as const));
  const resolvedPredictions = input.predictions
    .filter((prediction) => completedIds.has(prediction.match_id))
    .map((prediction) => {
      if (prediction.points != null) return prediction;
      const match = completedById.get(prediction.match_id);
      if (!match || match.home_score == null || match.away_score == null) return prediction;
      return {
        ...prediction,
        points: calculatePoints(
          match.home_score,
          match.away_score,
          prediction.predicted_home,
          prediction.predicted_away,
        ),
      };
    });

  const predictionsByMatch = new Map<number, RoundPrediction[]>();
  for (const prediction of resolvedPredictions) {
    const rows = predictionsByMatch.get(prediction.match_id) ?? [];
    rows.push(prediction);
    predictionsByMatch.set(prediction.match_id, rows);
  }

  const previousByName = new Map((input.previousSeasonStats ?? []).map((row) => [row.name, row] as const));
  const xbByName = new Map((input.includeStandingMovement === false ? [] : input.xbSnapshots ?? []).map((row) => [row.name, row] as const));

  const playerRows: RoundRecapPlayer[] = input.players.map((player) => {
    const evaluated = resolvedPredictions.filter(
      (prediction) => prediction.name === player.name && prediction.points != null,
    );
    const points = evaluated.reduce((sum, prediction) => sum + (prediction.points ?? 0), 0);
    const exactHits = evaluated.filter((prediction) => prediction.points === 10).length;
    const zeros = evaluated.filter((prediction) => prediction.points === 0).length;
    const roundAverage = evaluated.length ? points / evaluated.length : 0;
    const previous = previousByName.get(player.name);
    const xb = xbByName.get(player.name);
    const best = [...evaluated].sort(
      (a, b) => (b.points ?? 0) - (a.points ?? 0) || a.match_id - b.match_id,
    )[0];
    return {
      name: player.name,
      points,
      evaluatedTips: evaluated.length,
      exactHits,
      zeros,
      roundAverage,
      bestTip: best ? `${best.predicted_home}:${best.predicted_away} (${best.points ?? 0} b)` : null,
      currentOverallRank: null,
      previousOverallRank: null,
      rankMovement: 0,
      previousSeasonAverage: previous?.avgPoints ?? null,
      vsPreviousSeasonAverage: previous && evaluated.length ? roundAverage - previous.avgPoints : null,
      previousBestRound: previous?.bestRound ?? null,
      beatPreviousBestRound: Boolean(final && previous && points > previous.bestRound),
      seasonActualPoints: xb?.actualPoints ?? null,
      seasonExpectedXb: xb?.expectedXb ?? null,
      seasonVsXb: xb ? xb.actualPoints - xb.expectedXb : null,
    };
  });

  const currentStandings = [...(input.standings ?? [])]
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'cs'));
  if (input.includeStandingMovement !== false) {
    const roundPointsByName = new Map(playerRows.map((row) => [row.name, row.points] as const));
    const previousStandings = currentStandings
      .map((row) => ({ ...row, previousPoints: row.points - (roundPointsByName.get(row.name) ?? 0) }))
      .filter((row) => row.previousPoints >= 0)
      .sort((a, b) => b.previousPoints - a.previousPoints || a.name.localeCompare(b.name, 'cs'));
    const currentRank = new Map(currentStandings.map((row, index) => [row.name, index + 1] as const));
    const previousRank = new Map(previousStandings.map((row, index) => [row.name, index + 1] as const));
    for (const row of playerRows) {
      row.currentOverallRank = currentRank.get(row.name) ?? null;
      row.previousOverallRank = previousRank.get(row.name) ?? null;
      row.rankMovement = row.currentOverallRank != null && row.previousOverallRank != null
        ? row.previousOverallRank - row.currentOverallRank
        : 0;
    }
  }

  const ranked = playerRows
    .filter((row) => row.evaluatedTips > 0)
    .sort((a, b) => b.points - a.points || b.exactHits - a.exactHits || a.zeros - b.zeros || a.name.localeCompare(b.name, 'cs'));
  const leader = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;
  const worst = ranked.length
    ? [...ranked].sort((a, b) => a.points - b.points || b.zeros - a.zeros || a.exactHits - b.exactHits || a.name.localeCompare(b.name, 'cs'))[0]
    : null;
  const dominantLeader = leader && runnerUp && leader.points - runnerUp.points >= 6
    ? { name: leader.name, points: leader.points, gap: leader.points - runnerUp.points }
    : null;

  const matchRows: RoundRecapMatch[] = completed.map((match) => {
    const rows = predictionsByMatch.get(match.id) ?? [];
    const favorite = crowdFavoriteFor(match, rows);
    const actual = outcome(match.home_score ?? 0, match.away_score ?? 0);
    return {
      id: match.id,
      label: `${match.home_team} – ${match.away_team}`,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      score: `${match.home_score}:${match.away_score}`,
      totalGoals: (match.home_score ?? 0) + (match.away_score ?? 0),
      goalDifference: Math.abs((match.home_score ?? 0) - (match.away_score ?? 0)),
      tips: rows
        .filter((prediction) => prediction.points != null)
        .map((prediction) => ({
          name: prediction.name,
          tip: `${prediction.predicted_home}:${prediction.predicted_away}`,
          points: prediction.points ?? 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'cs')),
      exactHitters: rows.filter((prediction) => prediction.points === 10).map((prediction) => prediction.name).sort((a, b) => a.localeCompare(b, 'cs')),
      zeroTipsters: rows.filter((prediction) => prediction.points === 0).map((prediction) => prediction.name).sort((a, b) => a.localeCompare(b, 'cs')),
      redCards: redCardCount(match),
      stoppageChangedScore: scoreChangedInStoppage(match),
      actualOutcome: actual,
      crowdFavorite: favorite,
      crowdShock: Boolean(favorite && favorite.share >= 0.67 && favorite.outcome !== actual),
    };
  });

  const mostExactRow = [...matchRows]
    .filter((row) => row.exactHitters.length > 0)
    .sort((a, b) => b.exactHitters.length - a.exactHitters.length || a.id - b.id)[0];
  const mostMissedRow = [...matchRows]
    .filter((row) => row.zeroTipsters.length > 0)
    .sort((a, b) => b.zeroTipsters.length - a.zeroTipsters.length || a.id - b.id)[0];
  const biggestRiseRow = [...playerRows]
    .filter((row) => row.rankMovement > 0)
    .sort((a, b) => b.rankMovement - a.rankMovement || a.name.localeCompare(b.name, 'cs'))[0];
  const biggestFallRow = [...playerRows]
    .filter((row) => row.rankMovement < 0)
    .sort((a, b) => a.rankMovement - b.rankMovement || a.name.localeCompare(b.name, 'cs'))[0];

  let lastMatchSwing: RoundRecapFacts['lastMatchSwing'] = null;
  if (completed.length >= 2) {
    const chronological = [...completed].sort(
      (a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id - b.id,
    );
    const last = chronological.at(-1)!;
    const beforeIds = new Set(chronological.slice(0, -1).map((match) => match.id));
    const pointsBefore = new Map<string, number>();
    for (const prediction of resolvedPredictions) {
      if (!beforeIds.has(prediction.match_id) || prediction.points == null) continue;
      pointsBefore.set(prediction.name, (pointsBefore.get(prediction.name) ?? 0) + prediction.points);
    }
    const beforeLeader = [...pointsBefore.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'cs'))[0]?.[0] ?? null;
    const afterLeader = leader?.name ?? null;
    if (beforeLeader && afterLeader && beforeLeader !== afterLeader) {
      lastMatchSwing = {
        match: `${last.home_team} – ${last.away_team}`,
        beforeLeader,
        afterLeader,
      };
    }
  }

  const xbRows = playerRows.filter((row) => row.seasonVsXb != null);
  const xbOverRow = [...xbRows].sort((a, b) => (b.seasonVsXb ?? 0) - (a.seasonVsXb ?? 0) || a.name.localeCompare(b.name, 'cs'))[0];
  const xbUnderRow = [...xbRows].sort((a, b) => (a.seasonVsXb ?? 0) - (b.seasonVsXb ?? 0) || a.name.localeCompare(b.name, 'cs'))[0];
  const lastSeasonRows = playerRows.filter((row) => row.vsPreviousSeasonAverage != null && row.evaluatedTips > 0);
  const bestLastSeason = [...lastSeasonRows].sort((a, b) => (b.vsPreviousSeasonAverage ?? 0) - (a.vsPreviousSeasonAverage ?? 0) || a.name.localeCompare(b.name, 'cs'))[0];
  const worstLastSeason = [...lastSeasonRows].sort((a, b) => (a.vsPreviousSeasonAverage ?? 0) - (b.vsPreviousSeasonAverage ?? 0) || a.name.localeCompare(b.name, 'cs'))[0];
  const previousBestRow = [...playerRows]
    .filter((row) => row.beatPreviousBestRound && row.previousBestRound != null)
    .sort((a, b) => b.points - (b.previousBestRound ?? 0) - (a.points - (a.previousBestRound ?? 0)) || a.name.localeCompare(b.name, 'cs'))[0];

  const shockRow = [...matchRows]
    .filter((row) => row.crowdShock && row.crowdFavorite)
    .sort((a, b) => (b.crowdFavorite?.share ?? 0) - (a.crowdFavorite?.share ?? 0) || b.zeroTipsters.length - a.zeroTipsters.length || a.id - b.id)[0];
  const divizeRow = [...matchRows]
    .filter((row) => row.crowdShock && row.crowdFavorite?.team && (row.crowdFavorite?.share ?? 0) >= 0.75)
    .sort((a, b) => (b.crowdFavorite?.share ?? 0) - (a.crowdFavorite?.share ?? 0) || b.goalDifference - a.goalDifference || a.id - b.id)[0];

  const cinemaRows = matchRows.map((row) => {
    const leaderSwing = lastMatchSwing?.match === row.label;
    const score = (row.stoppageChangedScore ? 8 : 0)
      + (leaderSwing ? 7 : 0)
      + (row.totalGoals >= 6 ? 5 : row.totalGoals >= 5 ? 3 : 0)
      + (row.redCards >= 2 ? 4 : row.redCards === 1 ? 2 : 0)
      + (row.crowdShock ? 3 : 0);
    const reason: CinemaReason = row.stoppageChangedScore
      ? 'stoppage'
      : leaderSwing
        ? 'leader-swing'
        : row.totalGoals >= 5
          ? 'goals'
          : row.redCards > 0
            ? 'cards'
            : 'crowd-shock';
    return { row, score, reason };
  }).filter((entry) => entry.score >= 3).sort((a, b) => b.score - a.score || a.row.id - b.row.id);
  const cinema = cinemaRows[0] ?? null;

  const snowmanRow = [...playerRows]
    .filter((row) => row.evaluatedTips >= 2 && (row.points === 0 || row.zeros >= Math.ceil(row.evaluatedTips / 2) || (row.seasonVsXb ?? 0) <= -6))
    .sort((a, b) => a.points - b.points || b.zeros - a.zeros || (a.seasonVsXb ?? 0) - (b.seasonVsXb ?? 0) || a.name.localeCompare(b.name, 'cs'))[0];

  let blamageCandidate: RoundRecapFacts['blamageCandidate'] = null;
  if (shockRow && shockRow.zeroTipsters.length >= Math.max(2, Math.ceil(shockRow.tips.length / 2))) {
    blamageCandidate = {
      label: shockRow.label,
      detail: `${shockRow.zeroTipsters.length} nul z ${shockRow.tips.length} vyhodnocených tipů; ${Math.round((shockRow.crowdFavorite?.share ?? 0) * 100)} % tipovalo opačný výsledek.`,
    };
  } else if (worst && mode === 'final' && worst.points === 0 && worst.evaluatedTips >= 2) {
    blamageCandidate = {
      label: worst.name,
      detail: `0 bodů z ${worst.evaluatedTips} vyhodnocených tipů a ${worst.zeros} nul.`,
    };
  } else if (mostMissedRow && mostMissedRow.zeroTipsters.length >= Math.max(3, Math.ceil(mostMissedRow.tips.length / 2))) {
    blamageCandidate = {
      label: mostMissedRow.label,
      detail: `${mostMissedRow.zeroTipsters.length} tipérů skončilo za nula bodů.`,
    };
  }

  return {
    roundTitle: input.roundTitle,
    seasonName: input.seasonName,
    previousSeasonName: input.previousSeasonName ?? null,
    mode,
    completedMatches: completed.length,
    totalMatches: relevantMatches.length,
    remainingMatches: Math.max(0, relevantMatches.length - completed.length),
    liveMatches,
    cancelledMatches,
    players: playerRows,
    leader,
    runnerUp,
    worst,
    dominantLeader,
    totalExactHits: playerRows.reduce((sum, row) => sum + row.exactHits, 0),
    totalZeros: playerRows.reduce((sum, row) => sum + row.zeros, 0),
    matches: matchRows,
    mostExactMatch: mostExactRow ? { label: mostExactRow.label, count: mostExactRow.exactHitters.length } : null,
    mostMissedMatch: mostMissedRow ? { label: mostMissedRow.label, count: mostMissedRow.zeroTipsters.length } : null,
    biggestRise: biggestRiseRow ? { name: biggestRiseRow.name, places: biggestRiseRow.rankMovement } : null,
    biggestFall: biggestFallRow ? { name: biggestFallRow.name, places: Math.abs(biggestFallRow.rankMovement) } : null,
    lastMatchSwing,
    xbOverperformer: xbOverRow && xbOverRow.seasonVsXb != null && xbOverRow.seasonActualPoints != null && xbOverRow.seasonExpectedXb != null
      ? { name: xbOverRow.name, actual: xbOverRow.seasonActualPoints, expected: xbOverRow.seasonExpectedXb, delta: xbOverRow.seasonVsXb }
      : null,
    xbUnderperformer: xbUnderRow && xbUnderRow.seasonVsXb != null && xbUnderRow.seasonActualPoints != null && xbUnderRow.seasonExpectedXb != null
      ? { name: xbUnderRow.name, actual: xbUnderRow.seasonActualPoints, expected: xbUnderRow.seasonExpectedXb, delta: xbUnderRow.seasonVsXb }
      : null,
    bestVsLastSeason: bestLastSeason && bestLastSeason.previousSeasonAverage != null && bestLastSeason.vsPreviousSeasonAverage != null
      ? { name: bestLastSeason.name, roundAverage: bestLastSeason.roundAverage, previousAverage: bestLastSeason.previousSeasonAverage, delta: bestLastSeason.vsPreviousSeasonAverage }
      : null,
    worstVsLastSeason: worstLastSeason && worstLastSeason.previousSeasonAverage != null && worstLastSeason.vsPreviousSeasonAverage != null
      ? { name: worstLastSeason.name, roundAverage: worstLastSeason.roundAverage, previousAverage: worstLastSeason.previousSeasonAverage, delta: worstLastSeason.vsPreviousSeasonAverage }
      : null,
    previousBestBeaten: previousBestRow && previousBestRow.previousBestRound != null
      ? { name: previousBestRow.name, points: previousBestRow.points, previousBest: previousBestRow.previousBestRound }
      : null,
    consensusShock: shockRow
      ? { match: shockRow.label, score: shockRow.score, favoriteTeam: shockRow.crowdFavorite?.team ?? null, share: shockRow.crowdFavorite?.share ?? 0, zeros: shockRow.zeroTipsters.length }
      : null,
    divizeCandidate: divizeRow && divizeRow.crowdFavorite?.team
      ? { team: divizeRow.crowdFavorite.team, match: divizeRow.label, score: divizeRow.score, share: divizeRow.crowdFavorite.share }
      : null,
    cinemaCandidate: cinema
      ? { match: cinema.row.label, score: cinema.row.score, reason: cinema.reason }
      : null,
    snowman: snowmanRow
      ? { name: snowmanRow.name, points: snowmanRow.points, zeros: snowmanRow.zeros, xbDelta: snowmanRow.seasonVsXb }
      : null,
    blamageCandidate,
    overallStandings: currentStandings.slice(0, 8).map((row) => ({ name: row.name, points: row.points })),
  };
}

export function fallbackRoundRecap(facts: RoundRecapFacts): string {
  if (facts.mode === 'waiting') {
    return 'Kudy běží zajíc zatím nikdo neví. Jakmile se dohraje první zápas kola, studio otevře zápis a začne pitva.';
  }

  const leader = facts.leader
    ? `${facts.leader.name} má ${facts.leader.points} bodů${facts.leader.exactHits ? ` a ${facts.leader.exactHits} přesný zásah${facts.leader.exactHits > 1 ? 'y' : ''}` : ''}`
    : 'Pořadí kola zatím nemá dost vyhodnocených tipů';
  const xb = facts.xbOverperformer
    ? `${facts.xbOverperformer.name} je v sezoně ${facts.xbOverperformer.delta >= 0 ? '+' : ''}${facts.xbOverperformer.delta.toFixed(1)} bodu proti xB.`
    : '';
  const lastYear = facts.bestVsLastSeason
    ? `${facts.bestVsLastSeason.name} má v tomhle kole průměr ${facts.bestVsLastSeason.roundAverage.toFixed(1)} bodu na tip proti loňským ${facts.bestVsLastSeason.previousAverage.toFixed(1)}.`
    : '';
  const drama = facts.cinemaCandidate
    ? `Největší kino: ${facts.cinemaCandidate.match} ${facts.cinemaCandidate.score}.`
    : facts.blamageCandidate
      ? `Blamáž: ${facts.blamageCandidate.label}. ${facts.blamageCandidate.detail}`
      : '';

  if (facts.mode === 'progress') {
    return `${facts.completedMatches} z ${facts.totalMatches} zápasů je dohráno, takže verdikt je pořád průběžný. ${leader}. ${xb} ${lastYear} ${drama} Zbývá ${facts.remainingMatches} zápasů a zajíc ještě může změnit směr.`.replace(/\s+/g, ' ').trim();
  }

  const exact = facts.totalExactHits
    ? `Přesných desítek padlo ${facts.totalExactHits}.`
    : 'Přesná desítka tentokrát nepřišla.';
  return `Kolo je zavřené. ${leader}. ${exact} ${xb} ${lastYear} ${drama} Tohle je konečný zápis Kudy běží zajíc.`.replace(/\s+/g, ' ').trim();
}
