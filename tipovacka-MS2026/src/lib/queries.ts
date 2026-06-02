import { createServerReadClient } from '@/lib/supabase/server';
import type { Match, StandingRow, GoalStatRow, Player } from '@/lib/types';

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
