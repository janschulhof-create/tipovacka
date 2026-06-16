import { createServerReadClient } from '@/lib/supabase/server';
import type { Match, StandingRow, GoalStatRow, MissRow, RoundPrediction, Player } from '@/lib/types';
import { calculatePoints } from './scoring';

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


/** Body, které hráči právě nabírají z PRÁVĚ BĚŽÍCÍCH zápasů (pro živé pořadí). */
export async function getLivePointsByPlayer(seasonId: number): Promise<Record<string, number>> {
  const live = await getLiveMatches(seasonId);
  if (live.length === 0) return {};
  const scoreById = new Map(live.map((m) => [m.id, { hs: m.home_score, as: m.away_score }]));
  const preds = await getRoundPredictions(live.map((m) => m.id));
  const out: Record<string, number> = {};
  for (const pr of preds) {
    const sc = scoreById.get(pr.match_id);
    if (!sc || sc.hs == null || sc.as == null) continue;
    out[pr.name] = (out[pr.name] ?? 0) + (calculatePoints(sc.hs, sc.as, pr.predicted_home, pr.predicted_away) ?? 0);
  }
  return out;
}

// ===== Profil tipéra + H2H =====
export interface PlayerProfile {
  player_id: number;
  name: string;
  rank: number;
  total_players: number;
  points: number;
  scored_matches: number;
  exact_hits: number;
  avg_points: number;
  success_rate: number;
  dist: { p10: number; p6: number; p4: number; p2: number; p0: number };
  best_round: { round: number; points: number } | null;
  worst_round: { round: number; points: number } | null;
  rounds: { round: number; points: number }[];
}

export interface H2HSide {
  id: number; name: string; points: number; exact: number; avg: number; success: number; roundsWon: number;
}
export interface H2HResult {
  a: H2HSide; b: H2HSide; ties: number; rounds: { round: number; a: number; b: number }[];
}

export async function getPlayerProfile(seasonId: number, playerId: number): Promise<PlayerProfile | null> {
  const sb = createServerReadClient();
  const { data: pl } = await sb.from('players').select('name').eq('id', playerId).single();
  if (!pl) return null;
  const { data } = await sb
    .from('predictions')
    .select('points, matches!inner(round, status, season_id)')
    .eq('player_id', playerId)
    .eq('matches.season_id', seasonId);
  type M = { round: number; status: string; season_id: number };
  type Row = { points: number | null; matches: M | M[] | null };
  const rows = ((data as Row[]) ?? []).map((r) => ({
    points: r.points,
    m: Array.isArray(r.matches) ? r.matches[0] : r.matches,
  }));
  const fin = rows.filter((r) => r.m && r.m.status === 'finished' && r.points != null) as { points: number; m: M }[];
  const dist = { p10: 0, p6: 0, p4: 0, p2: 0, p0: 0 };
  const byRound = new Map<number, number>();
  let points = 0;
  for (const r of fin) {
    const pts = r.points;
    points += pts;
    if (pts === 10) dist.p10++;
    else if (pts === 6) dist.p6++;
    else if (pts === 4) dist.p4++;
    else if (pts === 2) dist.p2++;
    else dist.p0++;
    byRound.set(r.m.round, (byRound.get(r.m.round) ?? 0) + pts);
  }
  const scored = fin.length;
  const avg = scored ? Math.round((points / scored) * 100) / 100 : 0;
  const success = scored ? Math.round((100 * fin.filter((r) => r.points > 0).length) / scored) : 0;
  const roundsArr = [...byRound.entries()].sort((a, b) => a[0] - b[0]).map(([round, pts]) => ({ round, points: pts }));
  let best: { round: number; points: number } | null = null;
  let worst: { round: number; points: number } | null = null;
  for (const r of roundsArr) {
    if (!best || r.points > best.points) best = r;
    if (!worst || r.points < worst.points) worst = r;
  }
  const standings = await getStandings(seasonId);
  const idx = standings.findIndex((s) => s.player_id === playerId);
  return {
    player_id: playerId, name: pl.name,
    rank: idx >= 0 ? idx + 1 : 0, total_players: standings.length,
    points, scored_matches: scored, exact_hits: dist.p10, avg_points: avg, success_rate: success,
    dist, best_round: best, worst_round: worst, rounds: roundsArr,
  };
}

export async function getH2H(seasonId: number, aId: number, bId: number): Promise<H2HResult | null> {
  const [pa, pb] = await Promise.all([getPlayerProfile(seasonId, aId), getPlayerProfile(seasonId, bId)]);
  if (!pa || !pb) return null;
  const rmap = new Map<number, { a: number; b: number }>();
  for (const r of pa.rounds) rmap.set(r.round, { a: r.points, b: 0 });
  for (const r of pb.rounds) {
    const e = rmap.get(r.round) ?? { a: 0, b: 0 };
    e.b = r.points;
    rmap.set(r.round, e);
  }
  const rounds = [...rmap.entries()].sort((x, y) => x[0] - y[0]).map(([round, v]) => ({ round, a: v.a, b: v.b }));
  let aw = 0, bw = 0, ties = 0;
  for (const r of rounds) {
    if (r.a > r.b) aw++;
    else if (r.b > r.a) bw++;
    else ties++;
  }
  return {
    a: { id: aId, name: pa.name, points: pa.points, exact: pa.exact_hits, avg: pa.avg_points, success: pa.success_rate, roundsWon: aw },
    b: { id: bId, name: pb.name, points: pb.points, exact: pb.exact_hits, avg: pb.avg_points, success: pb.success_rate, roundsWon: bw },
    ties, rounds,
  };
}
