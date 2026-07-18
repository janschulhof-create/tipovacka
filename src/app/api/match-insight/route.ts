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
  const matchId = Number(new URL(req.url).searchParams.get('match'));
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
          home: m.home,
          away: m.away,
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
        home: m.home,
        away: m.away,
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

  const lastMatches = (team: string) =>
    played.filter((m) => m.home_team === team || m.away_team === team).slice(0, 5);

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

  const totalGoals = played.reduce((sum, m) => sum + m.home_score + m.away_score, 0);
  const leagueAvg = played.length ? totalGoals / (played.length * 2) : 0;
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

  // Personalizované očekávané body (xB) jsou pouze pro řádné zápasy Chance ligy.
  // Příprava má jiný zdroj a do dlouhodobého modelu se nezapočítává.
  let xb = null;
  if (player && match.source_league === 'cze.1' && Number(match.round) > 0) {
    const archiveTips: XbHistoryRow[] = archive.rounds.flatMap((round) =>
      round.matches.flatMap((m) => {
        const tip = m.tips[player.name];
        if (!tip || tip.pts == null || m.hs == null || m.as == null) return [];
        return [{ home: m.home, away: m.away, points: tip.pts }];
      }),
    );

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

    const regularFinished = played.filter(
      (playedMatch) => playedMatch.source_league === 'cze.1' && Number(playedMatch.round) > 0,
    );
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

    let tipExpectedPoints: number | null = null;
    if (prediction && currentPrediction) {
      const ph = Number(currentPrediction.predicted_home);
      const pa = Number(currentPrediction.predicted_away);
      if (Number.isFinite(ph) && Number.isFinite(pa)) {
        tipExpectedPoints = expectedPointsForTip(prediction.lambdaHome, prediction.lambdaAway, ph, pa);
      }
    }

    xb = computePersonalXb({
      home: teams.home,
      away: teams.away,
      archiveTips,
      priorAverage,
      seasonPoints,
      tipExpectedPoints,
      tipSample: prediction?.sample ?? 0,
    });
  }

  return NextResponse.json({
    teams,
    mutualMatches,
    form5,
    prediction,
    xb,
    loggedIn: !!player,
  });
}
