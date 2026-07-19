import { NextResponse } from 'next/server';
import { createServerAuthClient } from '@/lib/supabase/server';
import { getSessionPlayer } from '@/lib/auth';
import h2hData from '@/data/h2h.json';
import historie from '@/data/historie.json';
import { canonTeam } from '@/lib/teamAliases';
import {
  computePersonalXb,
  expectedPointsForTip,
  predictMatch,
  type TeamForm,
  type XbHistoryRow,
} from '@/lib/predict';

export const dynamic = 'force-dynamic';

interface H2HMatch {
  date: string;
  home: string;
  away: string;
  hs: number;
  as: number;
  comp?: string;
}

interface MutualMatchRow {
  round: number | null;
  date: string | null;
  home: string;
  away: string;
  hs: number;
  as: number;
  ph: number | null;
  pa: number | null;
  points: number | null;
  season: string | null;
}

interface ArchiveMatch {
  round: number;
  home: string;
  away: string;
  hs: number;
  as: number;
  tips: Record<string, { h: number; a: number; pts: number | null }>;
}

interface LeagueStandingRow {
  position: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  previousPosition: number;
  positionChange: number;
  pointsChange: number;
  live: boolean;
}

interface PlayedMatch {
  id: number;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  kickoff: string;
  source_league: string | null;
  round: number;
}


export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = Number(url.searchParams.get('match'));
  const requestedScores = (url.searchParams.get('scores') ?? '')
    .split(',')
    .map((value) => value.match(/^(\d+)-(\d+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ home: Number(match[1]), away: Number(match[2]) }))
    .filter((score) => Number.isFinite(score.home) && Number.isFinite(score.away))
    .slice(0, 10);
  if (!matchId) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const sb = await createServerAuthClient();
  const { data: match } = await sb
    .from('matches')
    .select('id, home_team, away_team, season_id, source_league, round')
    .eq('id', matchId)
    .single();
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const teams = { home: match.home_team as string, away: match.away_team as string };
  const player = await getSessionPlayer();
  const currentPair = [canonTeam(teams.home), canonTeam(teams.away)].sort().join('|');

  // Minulá Chance liga je hlavním zdrojem H2H. Zápasy čteme nezávisle na tom,
  // zda je uživatel přihlášený; jeho tip a body se připojí jen tehdy, když existují.
  const archive = historie as unknown as {
    season: string;
    rounds: {
      round: number;
      matches: {
        home: string;
        away: string;
        hs: number | null;
        as: number | null;
        tips: Record<string, { h: number; a: number; pts: number | null }>;
      }[];
    }[];
  };

  const archivePairMatches: ArchiveMatch[] = archive.rounds
    .flatMap((round) =>
      round.matches.flatMap((m) => {
        const archivedPair = [canonTeam(m.home), canonTeam(m.away)].sort().join('|');
        if (archivedPair !== currentPair || m.hs == null || m.as == null) return [];
        return [{
          round: round.round,
          home: canonTeam(m.home),
          away: canonTeam(m.away),
          hs: m.hs,
          as: m.as,
          tips: m.tips,
        }];
      }),
    )
    .sort((a, b) => b.round - a.round)
    .slice(0, 6);

  // U reprezentací / Evropy zůstává záložní historický dataset. Do UI i modelu
  // se použije jen tehdy, když pro dvojici nemáme archiv Chance ligy.
  const pairKey = [teams.home, teams.away].sort().join('|');
  const fallbackH2h: H2HMatch[] = ((h2hData as unknown as Record<string, H2HMatch[]>)[pairKey] ?? [])
    .slice(0, 6);

  const mutualMatches: MutualMatchRow[] = archivePairMatches.length
    ? archivePairMatches.map((m) => {
        const tip = player ? m.tips[player.name] : undefined;
        return {
          round: m.round,
          date: null,
          home: m.home,
          away: m.away,
          hs: m.hs,
          as: m.as,
          ph: tip?.h ?? null,
          pa: tip?.a ?? null,
          points: tip?.pts ?? null,
          season: archive.season,
        };
      })
    : fallbackH2h.map((m) => ({
        round: null,
        date: m.date,
        home: canonTeam(m.home),
        away: canonTeam(m.away),
        hs: m.hs,
        as: m.as,
        ph: null,
        pa: null,
        points: null,
        season: m.comp ?? null,
      }));

  const { data: playedData } = await sb
    .from('matches')
    .select('id, home_team, away_team, home_score, away_score, kickoff, source_league, round')
    .eq('season_id', match.season_id)
    .eq('status', 'finished')
    .not('home_score', 'is', null)
    .not('away_score', 'is', null)
    .order('kickoff', { ascending: false });

  const played = ((playedData as PlayedMatch[]) ?? []).filter(
    (m) => m.home_team && m.away_team && Number.isFinite(m.home_score) && Number.isFinite(m.away_score),
  );

  // U Chance ligy se do formy, ligového průměru ani osobního xB nesmí dostat
  // přípravné zápasy. Ochrana funguje i před spuštěním databázové migrace.
  const isCurrentChanceMatch = match.source_league === 'cze.1' && Number(match.round) > 0;
  const modelPlayed = isCurrentChanceMatch
    ? played.filter((m) => m.source_league === 'cze.1' && Number(m.round) > 0)
    : played;

  const lastMatches = (team: string) =>
    modelPlayed.filter((m) => m.home_team === team || m.away_team === team).slice(0, 5);

  const homeRecent = lastMatches(teams.home);
  const awayRecent = lastMatches(teams.away);

  const statsFromRecent = (rows: PlayedMatch[], team: string): TeamForm => {
    const stats = { scored: 0, conceded: 0, played: 0 };
    for (const m of rows) {
      const isHome = m.home_team === team;
      stats.scored += isHome ? m.home_score : m.away_score;
      stats.conceded += isHome ? m.away_score : m.home_score;
      stats.played += 1;
    }
    return stats;
  };

  const totalGoals = modelPlayed.reduce((sum, m) => sum + m.home_score + m.away_score, 0);
  const leagueAvg = modelPlayed.length ? totalGoals / (modelPlayed.length * 2) : 0;
  const predictionH2h = mutualMatches.map((m) => ({
    home: canonTeam(m.home),
    away: canonTeam(m.away),
    hs: m.hs,
    as: m.as,
  }));

  const prediction = predictMatch(
    statsFromRecent(homeRecent, teams.home),
    statsFromRecent(awayRecent, teams.away),
    leagueAvg,
    predictionH2h,
    canonTeam(teams.home),
  );

  const formatForm = (rows: PlayedMatch[], team: string) =>
    rows.map((m) => {
      const isHome = m.home_team === team;
      const gf = isHome ? m.home_score : m.away_score;
      const ga = isHome ? m.away_score : m.home_score;
      return {
        opponent: isHome ? m.away_team : m.home_team,
        gf,
        ga,
        res: gf > ga ? ('W' as const) : gf < ga ? ('L' as const) : ('D' as const),
      };
    });

  const form5 = {
    home: formatForm(homeRecent, teams.home),
    away: formatForm(awayRecent, teams.away),
  };

  // Osobní xB počítáme pouze pro ostré zápasy Chance ligy. Kolo Příprava
  // je z uživatelského rozhraní odstraněné a do modelu se nezapočítává.
  let xb = null;
  let xbVariants: { home: number; away: number; xb: ReturnType<typeof computePersonalXb> }[] = [];
  if (player && isCurrentChanceMatch) {
    const archiveTips: XbHistoryRow[] = [...archive.rounds]
      .sort((a, b) => a.round - b.round)
      .flatMap((round) => round.matches.flatMap((m) => {
        const tip = m.tips[player.name];
        if (!tip || tip.pts == null || m.hs == null || m.as == null) return [];
        return [{ home: m.home, away: m.away, points: tip.pts }];
      }));

    const allArchivePoints = archive.rounds.flatMap((round) =>
      round.matches.flatMap((m) =>
        Object.values(m.tips)
          .map((tip) => tip.pts)
          .filter((points): points is number => points != null && Number.isFinite(points)),
      ),
    );
    const priorAverage = allArchivePoints.length
      ? allArchivePoints.reduce((sum, points) => sum + points, 0) / allArchivePoints.length
      : 3.2;

    const regularFinished = modelPlayed;
    const regularIds = regularFinished.map((playedMatch) => playedMatch.id);
    const { data: seasonPredictions } = regularIds.length
      ? await sb
          .from('predictions')
          .select('match_id, points')
          .eq('player_id', player.id)
          .in('match_id', regularIds)
      : { data: [] };
    const seasonPointMap = new Map(
      (((seasonPredictions as unknown as { match_id: number; points: number | null }[]) ?? []))
        .filter((row) => row.points != null && Number.isFinite(row.points))
        .map((row) => [row.match_id, row.points as number]),
    );
    // Chybějící tip na dohraném ligovém zápase je skutečných 0 bodů.
    const seasonPoints = regularFinished.map((playedMatch) => seasonPointMap.get(playedMatch.id) ?? 0);
    const { data: currentPrediction } = await sb
      .from('predictions')
      .select('predicted_home, predicted_away')
      .eq('player_id', player.id)
      .eq('match_id', matchId)
      .maybeSingle();

    const contextValue = prediction
      ? Math.max(0, Math.min(10, Math.max(prediction.pHome, prediction.pDraw, prediction.pAway) * 6 + prediction.bestTip.ev * 0.4))
      : null;
    const contextDescription = prediction
      ? `Čitelnost zápasu z aktuální formy a H2H. Model doporučuje ${prediction.bestTip.h}:${prediction.bestTip.a}; používá ${prediction.formSample} vstupů formy a ${prediction.h2hSample} vzájemných zápasů.`
      : 'Současná forma ani vzájemné zápasy zatím nestačí na samostatné vyhodnocení čitelnosti utkání.';

    const computeForScore = (score: { home: number; away: number } | null) => {
      const tipExpectedPoints = prediction && score
        ? expectedPointsForTip(prediction.lambdaHome, prediction.lambdaAway, score.home, score.away)
        : null;
      return computePersonalXb({
        home: teams.home,
        away: teams.away,
        archiveTips,
        priorAverage,
        seasonPoints,
        tipExpectedPoints,
        tipSample: score ? prediction?.sample ?? 0 : 0,
        contextValue,
        contextSample: prediction?.sample ?? 0,
        contextDescription,
        // Pro přepínač 5 / 10 / 20 / 35 posíláme kompletní chronologickou
        // historii minulé ligové sezony; výpočet vrátí posledních max. 35 bodů.
        trendPoints: archiveTips.map((row) => row.points),
      });
    };

    const storedScore = currentPrediction
      ? { home: Number(currentPrediction.predicted_home), away: Number(currentPrediction.predicted_away) }
      : null;
    const validStoredScore = storedScore && Number.isFinite(storedScore.home) && Number.isFinite(storedScore.away)
      ? storedScore
      : null;
    xb = computeForScore(validStoredScore);
    xbVariants = requestedScores.map((score) => ({ ...score, xb: computeForScore(score) }));
  }

  let leagueTable: LeagueStandingRow[] = [];
  if (isCurrentChanceMatch) {
    const { data: seasonMatchesData } = await sb
      .from('matches')
      .select('home_team, away_team, home_score, away_score, status, source_league, round')
      .eq('season_id', match.season_id)
      .eq('source_league', 'cze.1')
      .gt('round', 0);

    type TableBase = Omit<LeagueStandingRow, 'position' | 'previousPosition' | 'positionChange' | 'pointsChange' | 'goalDifference'>;
    const createTable = () => new Map<string, TableBase>();
    const ensure = (table: Map<string, TableBase>, team: string) => {
      if (!table.has(team)) table.set(team, { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, live: false });
      return table.get(team)!;
    };
    const apply = (table: Map<string, TableBase>, row: { home_team: string; away_team: string; home_score: number | null; away_score: number | null; status: string }, includeLive: boolean) => {
      const home = ensure(table, row.home_team);
      const away = ensure(table, row.away_team);
      const counts = row.status === 'finished' || (includeLive && row.status === 'live');
      if (!counts || row.home_score == null || row.away_score == null) return;
      if (row.status === 'live') { home.live = true; away.live = true; }
      home.played += 1; away.played += 1;
      home.goalsFor += row.home_score; home.goalsAgainst += row.away_score;
      away.goalsFor += row.away_score; away.goalsAgainst += row.home_score;
      if (row.home_score > row.away_score) { home.won += 1; home.points += 3; away.lost += 1; }
      else if (row.home_score < row.away_score) { away.won += 1; away.points += 3; home.lost += 1; }
      else { home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1; }
    };
    const sortTable = (table: Map<string, TableBase>) => [...table.values()]
      .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
      .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team, 'cs'));

    const baseline = createTable();
    const liveTable = createTable();
    for (const row of (seasonMatchesData ?? []) as { home_team: string; away_team: string; home_score: number | null; away_score: number | null; status: string }[]) {
      ensure(baseline, row.home_team); ensure(baseline, row.away_team);
      ensure(liveTable, row.home_team); ensure(liveTable, row.away_team);
      apply(baseline, row, false);
      apply(liveTable, row, true);
    }

    const baselineSorted = sortTable(baseline);
    const previousByTeam = new Map(baselineSorted.map((row, index) => [row.team, { position: index + 1, points: row.points }]));
    leagueTable = sortTable(liveTable).map((row, index) => {
      const previous = previousByTeam.get(row.team) ?? { position: index + 1, points: row.points };
      const position = index + 1;
      return {
        ...row,
        position,
        previousPosition: previous.position,
        positionChange: previous.position - position,
        pointsChange: row.points - previous.points,
      };
    });
  }


  return NextResponse.json({
    teams,
    mutualMatches,
    form5,
    prediction,
    xb,
    xbVariants,
    loggedIn: !!player,
    leagueTable,
  });
}
