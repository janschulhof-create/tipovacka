import { createServerReadClient } from '@/lib/supabase/server';
import type { Match, StandingRow, GoalStatRow, MissRow, RoundPrediction, Player } from '@/lib/types';

export async function getActiveSeasonId(): Promise<number | null> {
  const sb = createServerReadClient();
  const { data } = await sb.from('seasons').select('id').eq('is_active', true).single();
  return data?.id ?? null;
}

export async function getActiveSeason(): Promise<{ id: number; name: string } | null> {
  const sb = createServerReadClient();
  const { data } = await sb
    .from('seasons')
    .select('id, name')
    .eq('is_active', true)
    .single();
  return (data as { id: number; name: string }) ?? null;
}

/** Aktuální kolo = nejbližší kolo s nejméně jedním nezačatým zápasem,
 *  jinak poslední odehrané. */
export async function getCurrentRound(seasonId: number): Promise<number | null> {
  const sb = createServerReadClient();
  const { data: upcoming } = await sb
    .from('matches')
    .select('round')
    .eq('season_id', seasonId)
    .eq('status', 'scheduled')
    .order('kickoff', { ascending: true })
    .limit(1);
  if (upcoming?.[0]) return upcoming[0].round;

  const { data: last } = await sb
    .from('matches')
    .select('round')
    .eq('season_id', seasonId)
    .order('round', { ascending: false })
    .limit(1);
  return last?.[0]?.round ?? null;
}

/** Předchozí kolo = nejvyšší číslo kola menší než `round`, které má zápasy. */
export async function getPreviousRound(seasonId: number, round: number): Promise<number | null> {
  const sb = createServerReadClient();
  const { data } = await sb
    .from('matches')
    .select('round')
    .eq('season_id', seasonId)
    .lt('round', round)
    .order('round', { ascending: false })
    .limit(1);
  return data?.[0]?.round ?? null;
}

/** Budoucí kola (mají aspoň jeden nezačatý zápas), od nejbližšího. */
export async function getUpcomingRounds(seasonId: number): Promise<number[]> {
  const sb = createServerReadClient();
  const { data } = await sb
    .from('matches')
    .select('round')
    .eq('season_id', seasonId)
    .eq('status', 'scheduled')
    .gt('kickoff', new Date().toISOString())
    .order('round', { ascending: true });
  return [...new Set((data ?? []).map((r: { round: number }) => r.round))];
}

/** Seřazený seznam všech kol sezóny (čísla kol, která mají zápasy). */
export async function getSeasonRounds(seasonId: number): Promise<number[]> {
  const sb = createServerReadClient();
  const { data } = await sb.from('matches').select('round').eq('season_id', seasonId);
  return [...new Set((data ?? []).map((r: { round: number }) => r.round))].sort((a, b) => a - b);
}

/** Kumulativní data pro graf vývoje pořadí (tvar pro StandingsChart). */
export async function getSeasonChartData(
  seasonId: number
): Promise<{ rounds: { round: number; matches: { tips: Record<string, { pts: number }> }[] }[]; players: string[] }> {
  const sb = createServerReadClient();
  const { data: ms } = await sb
    .from('matches')
    .select('id, round')
    .eq('season_id', seasonId);
  const matchRows = (ms as { id: number; round: number }[]) ?? [];
  if (matchRows.length === 0) return { rounds: [], players: [] };
  const roundOf = new Map(matchRows.map((m) => [m.id, m.round]));

  const { data: ps } = await sb
    .from('predictions')
    .select('match_id, points, players(name)')
    .in('match_id', matchRows.map((m) => m.id))
    .not('points', 'is', null);

  type Row = { match_id: number; points: number; players: { name: string } | { name: string }[] | null };
  const byRound = new Map<number, Record<string, number>>();
  const names = new Set<string>();
  for (const r of (ps as Row[]) ?? []) {
    const round = roundOf.get(r.match_id);
    if (round == null) continue;
    const name = Array.isArray(r.players) ? r.players[0]?.name : r.players?.name;
    if (!name) continue;
    names.add(name);
    const bucket = byRound.get(round) ?? {};
    bucket[name] = (bucket[name] ?? 0) + (r.points ?? 0);
    byRound.set(round, bucket);
  }

  const rounds = [...byRound.keys()]
    .sort((a, b) => a - b)
    .map((round) => ({
      round,
      matches: [
        {
          tips: Object.fromEntries(
            Object.entries(byRound.get(round)!).map(([n, pts]) => [n, { pts }])
          ),
        },
      ],
    }));

  return { rounds, players: [...names] };
}

export async function getRoundMatches(seasonId: number, round: number): Promise<Match[]> {
  const sb = createServerReadClient();
  const { data } = await sb
    .from('matches')
    .select('*')
    .eq('season_id', seasonId)
    .eq('round', round)
    .order('kickoff', { ascending: true });
  return (data as Match[]) ?? [];
}

export async function getStandings(seasonId: number): Promise<StandingRow[]> {
  const sb = createServerReadClient();
  const { data } = await sb
    .from('v_standings')
    .select('*')
    .eq('season_id', seasonId)
    .order('points', { ascending: false });
  return (data as StandingRow[]) ?? [];
}

export async function getGoalStats(seasonId: number): Promise<GoalStatRow[]> {
  const sb = createServerReadClient();
  const { data } = await sb.from('v_goal_stats').select('*').eq('season_id', seasonId);
  return (data as GoalStatRow[]) ?? [];
}

export async function getMisses(seasonId: number): Promise<MissRow[]> {
  const sb = createServerReadClient();
  const { data } = await sb.from('v_misses').select('*').eq('season_id', seasonId);
  return (data as MissRow[]) ?? [];
}

export async function getRoundPredictions(matchIds: number[]): Promise<RoundPrediction[]> {
  if (matchIds.length === 0) return [];
  const sb = createServerReadClient();
  const { data } = await sb
    .from('predictions')
    .select('match_id, predicted_home, predicted_away, points, players(name)')
    .in('match_id', matchIds);
  type Row = {
    match_id: number;
    predicted_home: number;
    predicted_away: number;
    points: number | null;
    players: { name: string } | { name: string }[] | null;
  };
  return ((data as Row[]) ?? []).map((r) => ({
    match_id: r.match_id,
    predicted_home: r.predicted_home,
    predicted_away: r.predicted_away,
    points: r.points,
    name: Array.isArray(r.players) ? r.players[0]?.name ?? '?' : r.players?.name ?? '?',
  }));
}

// ---- Síň slávy: data napříč všemi sezónami ----
export async function getAllStandings(): Promise<StandingRow[]> {
  const sb = createServerReadClient();
  const { data } = await sb.from('v_standings').select('*');
  return (data as StandingRow[]) ?? [];
}

export async function getAllGoalStats(): Promise<GoalStatRow[]> {
  const sb = createServerReadClient();
  const { data } = await sb.from('v_goal_stats').select('*');
  return (data as GoalStatRow[]) ?? [];
}

export async function getSeasonNames(): Promise<Record<number, string>> {
  const sb = createServerReadClient();
  const { data } = await sb.from('seasons').select('id, name');
  const map: Record<number, string> = {};
  for (const s of data ?? []) map[s.id] = s.name;
  return map;
}

export async function getPlayers(): Promise<Player[]> {
  const sb = createServerReadClient();
  const { data } = await sb
    .from('players')
    .select('*')
    .eq('is_active', true)
    .order('name');
  return (data as Player[]) ?? [];
}

/** Všechna kola sezóny v jednotném "tip" tvaru (pro detailní statistiky živé sezóny). */
export async function getSeasonTipRounds(
  seasonId: number
): Promise<{ round: number; matches: { home: string; away: string; hs: number | null; as: number | null; tips: Record<string, { h: number | null; a: number | null; pts: number | null }> }[] }[]> {
  const sb = createServerReadClient();
  const { data: ms } = await sb
    .from('matches')
    .select('id, round, home_team, away_team, home_score, away_score')
    .eq('season_id', seasonId)
    .order('round', { ascending: true });
  type M = { id: number; round: number; home_team: string; away_team: string; home_score: number | null; away_score: number | null };
  const matches = (ms as M[]) ?? [];
  if (matches.length === 0) return [];

  const { data: ps } = await sb
    .from('predictions')
    .select('match_id, predicted_home, predicted_away, points, players(name)')
    .in('match_id', matches.map((m) => m.id));
  type P = { match_id: number; predicted_home: number; predicted_away: number; points: number | null; players: { name: string } | { name: string }[] | null };
  const byMatch = new Map<number, { name: string; h: number; a: number; pts: number | null }[]>();
  for (const r of (ps as P[]) ?? []) {
    const name = Array.isArray(r.players) ? r.players[0]?.name : r.players?.name;
    if (!name) continue;
    const arr = byMatch.get(r.match_id) ?? [];
    arr.push({ name, h: r.predicted_home, a: r.predicted_away, pts: r.points });
    byMatch.set(r.match_id, arr);
  }

  const roundMap = new Map<number, M[]>();
  for (const m of matches) {
    const arr = roundMap.get(m.round) ?? [];
    arr.push(m);
    roundMap.set(m.round, arr);
  }
  return [...roundMap.keys()].sort((a, b) => a - b).map((round) => ({
    round,
    matches: roundMap.get(round)!.map((m) => ({
      home: m.home_team,
      away: m.away_team,
      hs: m.home_score,
      as: m.away_score,
      tips: Object.fromEntries((byMatch.get(m.id) ?? []).map((t) => [t.name, { h: t.h, a: t.a, pts: t.pts }])),
    })),
  }));
}

/** Aktuálně živé zápasy aktivní sezóny (pro zvýraznění na Domů). */
export async function getLiveMatches(seasonId: number) {
  const sb = createServerReadClient();
  const { data } = await sb
    .from('matches')
    .select('id, round, home_team, away_team, home_score, away_score, minute, kickoff')
    .eq('season_id', seasonId)
    .eq('status', 'live')
    .order('kickoff', { ascending: true });
  return (data ?? []) as {
    id: number; round: number; home_team: string; away_team: string;
    home_score: number | null; away_score: number | null; minute: number | null; kickoff: string;
  }[];
}
