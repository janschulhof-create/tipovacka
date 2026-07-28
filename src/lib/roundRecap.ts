import type { Match, Player, RoundPrediction, StandingRow } from './types';
import { calculatePoints } from './scoring';

export type RoundRecapMode = 'waiting' | 'progress' | 'final';

export interface RoundRecapPlayer {
  name: string;
  points: number;
  evaluatedTips: number;
  exactHits: number;
  zeros: number;
  bestTip: string | null;
  currentOverallRank: number | null;
  previousOverallRank: number | null;
  rankMovement: number;
}

export interface RoundRecapMatch {
  id: number;
  label: string;
  score: string;
  totalGoals: number;
  tips: Array<{ name: string; tip: string; points: number }>;
  exactHitters: string[];
  zeroTipsters: string[];
  redCards: number;
  stoppageChangedScore: boolean;
}

export interface RoundRecapFacts {
  roundTitle: string;
  seasonName: string;
  mode: RoundRecapMode;
  completedMatches: number;
  totalMatches: number;
  remainingMatches: number;
  liveMatches: number;
  cancelledMatches: number;
  players: RoundRecapPlayer[];
  leader: RoundRecapPlayer | null;
  worst: RoundRecapPlayer | null;
  totalExactHits: number;
  totalZeros: number;
  matches: RoundRecapMatch[];
  mostExactMatch: { label: string; count: number } | null;
  mostMissedMatch: { label: string; count: number } | null;
  biggestRise: { name: string; places: number } | null;
  biggestFall: { name: string; places: number } | null;
  lastMatchSwing: { match: string; beforeLeader: string; afterLeader: string } | null;
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

/**
 * Připraví pouze ověřitelná fakta. Claude z nich smí vytvořit styl, ale nikdy
 * nepočítá body ani nedoplňuje události sám.
 */
export function buildRoundRecapFacts(input: {
  matches: Match[];
  players: Player[];
  predictions: RoundPrediction[];
  standings?: StandingRow[];
  roundTitle: string;
  seasonName: string;
  /** Pořadí z dashboardu je aktuální; u ručně otevřeného staršího kola z něj nesmíme dopočítávat historický posun. */
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

  const playerRows: RoundRecapPlayer[] = input.players.map((player) => {
    const evaluated = resolvedPredictions.filter(
      (prediction) => prediction.name === player.name && prediction.points != null,
    );
    const points = evaluated.reduce((sum, prediction) => sum + (prediction.points ?? 0), 0);
    const exactHits = evaluated.filter((prediction) => prediction.points === 10).length;
    const zeros = evaluated.filter((prediction) => prediction.points === 0).length;
    const best = [...evaluated].sort(
      (a, b) => (b.points ?? 0) - (a.points ?? 0) || a.match_id - b.match_id,
    )[0];
    return {
      name: player.name,
      points,
      evaluatedTips: evaluated.length,
      exactHits,
      zeros,
      bestTip: best ? `${best.predicted_home}:${best.predicted_away} (${best.points ?? 0} b)` : null,
      currentOverallRank: null,
      previousOverallRank: null,
      rankMovement: 0,
    };
  });

  const currentStandings = [...(input.standings ?? [])]
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'cs'));
  if (input.includeStandingMovement !== false) {
    const roundPointsByName = new Map(playerRows.map((row) => [row.name, row.points] as const));
    const previousStandings = currentStandings
      .map((row) => ({ ...row, previousPoints: row.points - (roundPointsByName.get(row.name) ?? 0) }))
      // Pokud by byly standings během krátkého sync okna starší než vyhodnocené
      // tipy, záporný mezistav nepoužijeme k vymyšlenému posunu pořadím.
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

  // Člověka bez jediného vyhodnoceného tipu neoznačujeme za propadák kola.
  const ranked = playerRows
    .filter((row) => row.evaluatedTips > 0)
    .sort((a, b) => b.points - a.points || b.exactHits - a.exactHits || a.zeros - b.zeros || a.name.localeCompare(b.name, 'cs'));
  const leader = ranked[0] ?? null;
  const worst = ranked.length
    ? [...ranked].sort((a, b) => a.points - b.points || b.zeros - a.zeros || a.exactHits - b.exactHits || a.name.localeCompare(b.name, 'cs'))[0]
    : null;

  const matchRows: RoundRecapMatch[] = completed.map((match) => {
    const rows = predictionsByMatch.get(match.id) ?? [];
    return {
      id: match.id,
      label: `${match.home_team} – ${match.away_team}`,
      score: `${match.home_score}:${match.away_score}`,
      totalGoals: (match.home_score ?? 0) + (match.away_score ?? 0),
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

  return {
    roundTitle: input.roundTitle,
    seasonName: input.seasonName,
    mode,
    completedMatches: completed.length,
    totalMatches: relevantMatches.length,
    remainingMatches: Math.max(0, relevantMatches.length - completed.length),
    liveMatches,
    cancelledMatches,
    players: playerRows,
    leader,
    worst,
    totalExactHits: playerRows.reduce((sum, row) => sum + row.exactHits, 0),
    totalZeros: playerRows.reduce((sum, row) => sum + row.zeros, 0),
    matches: matchRows,
    mostExactMatch: mostExactRow ? { label: mostExactRow.label, count: mostExactRow.exactHitters.length } : null,
    mostMissedMatch: mostMissedRow ? { label: mostMissedRow.label, count: mostMissedRow.zeroTipsters.length } : null,
    biggestRise: biggestRiseRow ? { name: biggestRiseRow.name, places: biggestRiseRow.rankMovement } : null,
    biggestFall: biggestFallRow ? { name: biggestFallRow.name, places: Math.abs(biggestFallRow.rankMovement) } : null,
    lastMatchSwing,
    overallStandings: currentStandings
      .slice(0, 8)
      .map((row) => ({ name: row.name, points: row.points })),
  };
}

export function fallbackRoundRecap(facts: RoundRecapFacts): string {
  if (facts.mode === 'waiting') {
    return 'Baroko teprve zahřívá hlasivky. Jakmile se dohraje první zápas kola, komise vytáhne zápis a začne s hodnocením.';
  }

  const leader = facts.leader
    ? `${facts.leader.name} má ${facts.leader.points} bodů${facts.leader.exactHits ? ` a ${facts.leader.exactHits} přesný zásah${facts.leader.exactHits > 1 ? 'y' : ''}` : ''}`
    : 'Pořadí kola zatím nemá dost vyhodnocených tipů';
  const worst = facts.worst && facts.worst.name !== facts.leader?.name
    ? `${facts.worst.name} zatím tahá ze zápisu ${facts.worst.points} bodů a ${facts.worst.zeros} nul.`
    : '';

  if (facts.mode === 'progress') {
    return `${facts.completedMatches} z ${facts.totalMatches} zápasů je dohráno a kolo ještě pokračuje. ${leader}. ${worst} Zbývá ${facts.remainingMatches} zápasů, takže komise zatím razítko do kapsy neschovává.`.replace(/\s+/g, ' ').trim();
  }

  const exact = facts.totalExactHits
    ? `Přesných desítek padlo ${facts.totalExactHits}.`
    : 'Přesná desítka tentokrát zůstala zamčená v kabině.';
  return `Kolo je dohráno a zápis je zavřený. ${leader}. ${exact} ${worst} Komise výsledky ponechala v platnosti.`.replace(/\s+/g, ' ').trim();
}
