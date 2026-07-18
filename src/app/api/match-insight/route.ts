import { NextResponse } from 'next/server';
import { createServerAuthClient } from '@/lib/supabase/server';
import { getSessionPlayer } from '@/lib/auth';
import h2hData from '@/data/h2h.json';
import historie from '@/data/historie.json';
import { canonTeam } from '@/lib/teamAliases';
import { expectedPointsForTip, predictMatch, type TeamForm } from '@/lib/predict';

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
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  kickoff: string;
}

interface XbFactor {
  key: 'h2h' | 'home' | 'away' | 'overall' | 'season' | 'tip';
  label: string;
  value: number;
  sample: number;
}

interface XbPrediction {
  value: number;
  low: number;
  high: number;
  confidence: number;
  factors: XbFactor[];
  explanation: string;
  hasTip: boolean;
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
    .select('home_team, away_team, home_score, away_score, kickoff')
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

  // Personalizované očekávané body (xB) jsou zatím pouze pro řádné zápasy Chance ligy.
  // Příprava má jiný zdroj a do dlouhodobého modelu se nezapočítává.
  let xb: XbPrediction | null = null;
  if (player && match.source_league === 'cze.1' && Number(match.round) > 0) {
    type ArchiveTipRow = { home: string; away: string; points: number };
    const archiveTips: ArchiveTipRow[] = archive.rounds.flatMap((round) =>
      round.matches.flatMap((m) => {
        const tip = m.tips[player.name];
        if (!tip || tip.pts == null || m.hs == null || m.as == null) return [];
        return [{ home: canonTeam(m.home), away: canonTeam(m.away), points: tip.pts }];
      }),
    );

    const avg = (rows: ArchiveTipRow[]) =>
      rows.length ? rows.reduce((sum, row) => sum + row.points, 0) / rows.length : null;
    const overallRaw = avg(archiveTips) ?? 3;
    const pairRows = archiveTips.filter((row) => [row.home, row.away].sort().join('|') === currentPair);
    const homeCanon = canonTeam(teams.home);
    const awayCanon = canonTeam(teams.away);
    const homeRows = archiveTips.filter((row) => row.home === homeCanon || row.away === homeCanon);
    const awayRows = archiveTips.filter((row) => row.home === awayCanon || row.away === awayCanon);

    const shrink = (raw: number | null, sample: number, priorMatches: number) =>
      raw == null ? overallRaw : (raw * sample + overallRaw * priorMatches) / (sample + priorMatches);

    const factors: XbFactor[] = [
      { key: 'overall', label: 'Celková úspěšnost', value: overallRaw, sample: archiveTips.length },
      { key: 'home', label: `Úspěšnost u ${teams.home}`, value: shrink(avg(homeRows), homeRows.length, 8), sample: homeRows.length },
      { key: 'away', label: `Úspěšnost u ${teams.away}`, value: shrink(avg(awayRows), awayRows.length, 8), sample: awayRows.length },
    ];
    if (pairRows.length) {
      factors.unshift({
        key: 'h2h',
        label: 'Historie vzájemných zápasů',
        value: shrink(avg(pairRows), pairRows.length, 3),
        sample: pairRows.length,
      });
    }

    const { data: seasonPredictions } = await sb
      .from('predictions')
      .select('points, matches!inner(season_id, source_league, status, round)')
      .eq('player_id', player.id)
      .eq('matches.season_id', match.season_id)
      .eq('matches.source_league', 'cze.1')
      .eq('matches.status', 'finished')
      .gt('matches.round', 0)
      .not('points', 'is', null);

    const seasonPoints = ((seasonPredictions as unknown as { points: number | null }[]) ?? [])
      .map((row) => row.points)
      .filter((points): points is number => points != null && Number.isFinite(points));
    if (seasonPoints.length) {
      const raw = seasonPoints.reduce((sum, points) => sum + points, 0) / seasonPoints.length;
      factors.push({
        key: 'season',
        label: 'Forma tipera v této sezoně',
        value: shrink(raw, seasonPoints.length, 5),
        sample: seasonPoints.length,
      });
    }

    const { data: currentPrediction } = await sb
      .from('predictions')
      .select('predicted_home, predicted_away')
      .eq('player_id', player.id)
      .eq('match_id', matchId)
      .maybeSingle();

    if (prediction && currentPrediction) {
      const ph = Number(currentPrediction.predicted_home);
      const pa = Number(currentPrediction.predicted_away);
      if (Number.isFinite(ph) && Number.isFinite(pa)) {
        factors.push({
          key: 'tip',
          label: `Tvůj tip ${ph}:${pa}`,
          value: expectedPointsForTip(prediction.lambdaHome, prediction.lambdaAway, ph, pa),
          sample: prediction.sample,
        });
      }
    }

    const baseWeights: Record<XbFactor['key'], number> = {
      h2h: 0.30,
      home: 0.16,
      away: 0.14,
      overall: 0.25,
      season: Math.min(0.18, 0.04 + seasonPoints.length * 0.012),
      tip: factors.some((factor) => factor.key === 'tip') ? 0.28 : 0,
    };
    const activeWeight = factors.reduce((sum, factor) => sum + baseWeights[factor.key], 0);
    const value = factors.reduce((sum, factor) => sum + factor.value * baseWeights[factor.key], 0) / activeWeight;
    const evidence = archiveTips.length + pairRows.length * 4 + homeRows.length * 0.4 + awayRows.length * 0.4 + seasonPoints.length * 5;
    const confidence = Math.round(Math.max(38, Math.min(92, 42 + Math.log1p(evidence) * 8 + (factors.some((f) => f.key === 'tip') ? 5 : 0))));
    const spread = Math.max(1.2, 3.4 - confidence / 38);
    const rounded = Math.max(0, Math.min(10, value));
    const strongest = [...factors].sort((a, b) => b.value - a.value)[0];
    const weakest = [...factors].sort((a, b) => a.value - b.value)[0];

    xb = {
      value: Number(rounded.toFixed(1)),
      low: Number(Math.max(0, rounded - spread).toFixed(1)),
      high: Number(Math.min(10, rounded + spread).toFixed(1)),
      confidence,
      factors,
      explanation: strongest.value - weakest.value >= 1.2
        ? `${strongest.label} ti historicky sedí nejlépe. Největší rezervu máš v oblasti „${weakest.label}“.`
        : 'Jednotlivé historické faktory jsou vyrovnané, model proto čeká výkon blízko tvého dlouhodobého průměru.',
      hasTip: factors.some((factor) => factor.key === 'tip'),
    };
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
