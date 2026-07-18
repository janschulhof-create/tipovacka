import { createServerReadClient } from '@/lib/supabase/server';
import type { Match, StandingRow, GoalStatRow, MissRow, RoundPrediction, Player } from '@/lib/types';
import { calculatePoints } from './scoring';
import { CONTINENTS, matchContinents, type ContinentKey } from './continents';
import { LEAGUE_REGIONS, matchLeagueRegions, type LeagueRegionKey } from './leagueRegions';
import type { CompetitionKey } from './competitions';
import historie from '@/data/historie.json';
import { computePersonalXb, type XbHistoryRow } from './predict';

export interface ActiveSeason {
  id: number;
  name: string;
  competition_key: CompetitionKey;
}

export async function getActiveSeasonId(competitionKey: CompetitionKey = 'liga'): Promise<number | null> {
  const season = await getActiveSeason(competitionKey);
  return season?.id ?? null;
}

export async function getActiveSeason(competitionKey: CompetitionKey = 'liga'): Promise<ActiveSeason | null> {
  const sb = createServerReadClient();
  const { data } = await sb
    .from('seasons')
    .select('id, name, competition_key')
    .eq('competition_key', competitionKey)
    .eq('is_active', true)
    .maybeSingle();
  return (data as ActiveSeason | null) ?? null;
}

/** Popisky kol uložené u zápasů (např. „Evropa · týden 31/2026"). */
export async function getRoundLabels(seasonId: number): Promise<Record<number, string>> {
  const sb = createServerReadClient();
  const { data } = await sb
    .from('matches')
    .select('round, round_label')
    .eq('season_id', seasonId)
    .not('round_label', 'is', null);
  const out: Record<number, string> = {};
  for (const row of (data as { round: number; round_label: string | null }[]) ?? []) {
    if (row.round_label && !out[row.round]) out[row.round] = row.round_label;
  }
  return out;
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

/** Kumulativní data pro graf vývoje pořadí (po zápasech – seskupení řeší komponenta). */
export async function getSeasonChartData(
  seasonId: number
): Promise<{ matches: { round: number; kickoff: string; pts: Record<string, number> }[]; players: string[] }> {
  const sb = createServerReadClient();
  const { data: ms } = await sb
    .from('matches')
    .select('id, round, kickoff')
    .eq('season_id', seasonId)
    .order('kickoff', { ascending: true });
  const matchRows = (ms as { id: number; round: number; kickoff: string }[]) ?? [];
  if (matchRows.length === 0) return { matches: [], players: [] };

  const { data: ps } = await sb
    .from('predictions')
    .select('match_id, points, players(name)')
    .in('match_id', matchRows.map((m) => m.id))
    .not('points', 'is', null);

  type Row = { match_id: number; points: number; players: { name: string } | { name: string }[] | null };
  const ptsByMatch = new Map<number, Record<string, number>>();
  const names = new Set<string>();
  for (const r of (ps as Row[]) ?? []) {
    const name = Array.isArray(r.players) ? r.players[0]?.name : r.players?.name;
    if (!name) continue;
    names.add(name);
    const bucket = ptsByMatch.get(r.match_id) ?? {};
    bucket[name] = (bucket[name] ?? 0) + (r.points ?? 0);
    ptsByMatch.set(r.match_id, bucket);
  }

  const matches = matchRows
    .filter((m) => ptsByMatch.has(m.id))
    .map((m) => ({ round: m.round, kickoff: m.kickoff, pts: ptsByMatch.get(m.id)! }));

  return { matches, players: [...names] };
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


export interface SeasonXbRow {
  player_id: number;
  name: string;
  actual_points: number;
  finished_matches: number;
  remaining_matches: number;
  total_matches: number;
  expected_remaining: number;
  projected_points: number;
  avg_xb_remaining: number;
  confidence: number;
}

/**
 * Odhad konečného bodového zisku v Chance lize.
 *
 * - Příprava (round 0) se zcela ignoruje.
 * - Odehrané zápasy používají skutečné body, včetně 0 za chybějící tip.
 * - Zbývající rozpis se odhaduje zápas po zápasu podle osobní historie hráče,
 *   konkrétních týmů, H2H a postupně i podle formy tipéra v aktuální sezoně.
 * - Neodehrané tajné tipy se do veřejného pořadí záměrně nezapočítávají.
 */
export async function getSeasonXbProjection(seasonId: number): Promise<SeasonXbRow[]> {
  const sb = createServerReadClient();
  const [{ data: playerData }, { data: matchData }] = await Promise.all([
    sb.from('players').select('id, name, is_active').eq('is_active', true).order('name'),
    sb
      .from('matches')
      .select('id, round, home_team, away_team, status')
      .eq('season_id', seasonId)
      .eq('source_league', 'cze.1')
      .gt('round', 0)
      .neq('status', 'cancelled')
      .order('kickoff', { ascending: true }),
  ]);

  const players = (playerData as Player[]) ?? [];
  type ProjectionMatch = {
    id: number;
    round: number;
    home_team: string;
    away_team: string;
    status: Match['status'];
  };
  const matches = (matchData as ProjectionMatch[]) ?? [];
  if (!players.length || !matches.length) return [];

  // PostgREST může mít limit 1000 řádků. Predikce proto čteme stránkovaně,
  // aby projekce fungovala i na konci sezony (240 × 8 tipů = 1920 řádků).
  type ProjectionTip = { player_id: number; match_id: number; points: number | null };
  const predictionRows: ProjectionTip[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data } = await sb
      .from('predictions')
      .select('player_id, match_id, points')
      .in('match_id', matches.map((match) => match.id))
      .order('match_id', { ascending: true })
      .order('player_id', { ascending: true })
      .range(from, from + pageSize - 1);
    const page = (data as ProjectionTip[]) ?? [];
    predictionRows.push(...page);
    if (page.length < pageSize) break;
  }

  const archive = historie as unknown as {
    rounds: {
      matches: {
        home: string;
        away: string;
        hs: number | null;
        as: number | null;
        tips: Record<string, { h: number; a: number; pts: number | null }>;
      }[];
    }[];
  };

  const allArchivePoints = archive.rounds.flatMap((round) =>
    round.matches.flatMap((match) =>
      Object.values(match.tips)
        .map((tip) => tip.pts)
        .filter((points): points is number => points != null && Number.isFinite(points)),
    ),
  );
  const priorAverage = allArchivePoints.length
    ? allArchivePoints.reduce((sum, points) => sum + points, 0) / allArchivePoints.length
    : 3.2;

  const tipsByPlayerMatch = new Map<string, number>();
  for (const row of predictionRows) {
    if (row.points != null && Number.isFinite(row.points)) {
      tipsByPlayerMatch.set(`${row.player_id}:${row.match_id}`, row.points);
    }
  }

  const finished = matches.filter((match) => match.status === 'finished');
  const remaining = matches.filter((match) => match.status !== 'finished');

  const rows: SeasonXbRow[] = players.map((player) => {
    const archiveTips: XbHistoryRow[] = archive.rounds.flatMap((round) =>
      round.matches.flatMap((match) => {
        const tip = match.tips[player.name];
        if (!tip || tip.pts == null || match.hs == null || match.as == null) return [];
        return [{ home: match.home, away: match.away, points: tip.pts }];
      }),
    );

    // Chybějící tip na dohraném zápase je reálně 0 bodů a má být součástí formy.
    const seasonPoints = finished.map(
      (match) => tipsByPlayerMatch.get(`${player.id}:${match.id}`) ?? 0,
    );
    const actualPoints = seasonPoints.reduce((sum, points) => sum + points, 0);

    let expectedRemaining = 0;
    let confidenceSum = 0;
    for (const match of remaining) {
      const xb = computePersonalXb({
        home: match.home_team,
        away: match.away_team,
        archiveTips,
        priorAverage,
        seasonPoints,
      });
      expectedRemaining += xb.value;
      confidenceSum += xb.confidence;
    }

    const avgXbRemaining = remaining.length ? expectedRemaining / remaining.length : 0;
    const confidence = remaining.length
      ? Math.round(confidenceSum / remaining.length)
      : Math.min(99, 80 + Math.min(19, finished.length));

    return {
      player_id: player.id,
      name: player.name,
      actual_points: actualPoints,
      finished_matches: finished.length,
      remaining_matches: remaining.length,
      total_matches: matches.length,
      expected_remaining: Number(expectedRemaining.toFixed(1)),
      projected_points: Math.round(actualPoints + expectedRemaining),
      avg_xb_remaining: Number(avgXbRemaining.toFixed(1)),
      confidence,
    };
  });

  return rows.sort(
    (a, b) => b.projected_points - a.projected_points || b.actual_points - a.actual_points || a.name.localeCompare(b.name, 'cs'),
  );
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
export interface TipCount { tip: string; count: number }

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
  zeros: number;
  unlucky: number;
  avg_goals: number;
  most_common_tip: TipCount | null;
  most_successful_tip: TipCount | null;
  matchPoints: Record<number, number>;
}

export interface H2HSide {
  id: number; name: string; points: number; exact: number; avg: number; success: number;
  matchWins: number; zeros: number; unlucky: number; avgGoals: number;
  mostCommonTip: TipCount | null; mostSuccessfulTip: TipCount | null;
}
export interface H2HResult { a: H2HSide; b: H2HSide; ties: number; commonMatches: number }

function topTip(m: Map<string, number>): TipCount | null {
  let bk: string | null = null;
  let bc = 0;
  for (const [k, c] of m) if (c > bc) { bc = c; bk = k; }
  return bk ? { tip: bk, count: bc } : null;
}

export async function getPlayerProfile(seasonId: number, playerId: number): Promise<PlayerProfile | null> {
  const sb = createServerReadClient();
  const { data: pl } = await sb.from('players').select('name').eq('id', playerId).single();
  if (!pl) return null;
  const { data } = await sb
    .from('predictions')
    .select('predicted_home, predicted_away, points, matches!inner(id, round, status, season_id, home_score, away_score)')
    .eq('player_id', playerId)
    .eq('matches.season_id', seasonId);
  type M = { id: number; round: number; status: string; home_score: number | null; away_score: number | null };
  type Row = { predicted_home: number; predicted_away: number; points: number | null; matches: M | M[] | null };
  const rows = ((data as Row[]) ?? []).map((r) => ({
    ph: r.predicted_home, pa: r.predicted_away, points: r.points,
    m: Array.isArray(r.matches) ? r.matches[0] : r.matches,
  }));

  const tipCount = new Map<string, number>();
  let predGoals = 0;
  for (const r of rows) {
    tipCount.set(`${r.ph}:${r.pa}`, (tipCount.get(`${r.ph}:${r.pa}`) ?? 0) + 1);
    predGoals += r.ph + r.pa;
  }

  const fin = rows.filter((r) => r.m && r.m.status === 'finished' && r.points != null) as
    { ph: number; pa: number; points: number; m: M }[];
  const dist = { p10: 0, p6: 0, p4: 0, p2: 0, p0: 0 };
  const byRound = new Map<number, number>();
  const matchPoints: Record<number, number> = {};
  const exactTip = new Map<string, number>();
  let points = 0;
  let unlucky = 0;
  for (const r of fin) {
    const pts = r.points;
    points += pts;
    if (pts === 10) { dist.p10++; exactTip.set(`${r.ph}:${r.pa}`, (exactTip.get(`${r.ph}:${r.pa}`) ?? 0) + 1); }
    else if (pts === 6) dist.p6++;
    else if (pts === 4) dist.p4++;
    else if (pts === 2) dist.p2++;
    else dist.p0++;
    byRound.set(r.m.round, (byRound.get(r.m.round) ?? 0) + pts);
    matchPoints[r.m.id] = pts;
    if (r.m.home_score != null && r.m.away_score != null) {
      const off = Math.abs(r.ph - r.m.home_score) + Math.abs(r.pa - r.m.away_score);
      if (off === 1) unlucky++;
    }
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
    zeros: dist.p0, unlucky,
    avg_goals: rows.length ? Math.round((predGoals / rows.length) * 100) / 100 : 0,
    most_common_tip: topTip(tipCount), most_successful_tip: topTip(exactTip),
    matchPoints,
  };
}

export async function getH2H(seasonId: number, aId: number, bId: number): Promise<H2HResult | null> {
  const [pa, pb] = await Promise.all([getPlayerProfile(seasonId, aId), getPlayerProfile(seasonId, bId)]);
  if (!pa || !pb) return null;
  let aWins = 0, bWins = 0, ties = 0, common = 0;
  const ids = new Set<number>([...Object.keys(pa.matchPoints), ...Object.keys(pb.matchPoints)].map(Number));
  for (const id of ids) {
    const av = pa.matchPoints[id];
    const bv = pb.matchPoints[id];
    if (av == null || bv == null) continue;
    common++;
    if (av > bv) aWins++;
    else if (bv > av) bWins++;
    else ties++;
  }
  const side = (p: PlayerProfile, wins: number): H2HSide => ({
    id: p.player_id, name: p.name, points: p.points, exact: p.exact_hits, avg: p.avg_points,
    success: p.success_rate, matchWins: wins, zeros: p.zeros, unlucky: p.unlucky, avgGoals: p.avg_goals,
    mostCommonTip: p.most_common_tip, mostSuccessfulTip: p.most_successful_tip,
  });
  return { a: side(pa, aWins), b: side(pb, bWins), ties, commonMatches: common };
}

/** „Pán nastavení": bilance bodů ze gólů v nastavení 2. poločasu (finále vs. stav v 90:00). */
export async function getStoppageStats(
  seasonId: number
): Promise<{ name: string; balance: number; affected: number }[]> {
  const sb = createServerReadClient();
  const { data: ms } = await sb
    .from('matches')
    .select('id, home_score, away_score, reg_home, reg_away')
    .eq('season_id', seasonId)
    .eq('status', 'finished')
    .not('home_score', 'is', null)
    .not('reg_home', 'is', null);

  type M = { id: number; home_score: number; away_score: number; reg_home: number; reg_away: number };
  const relevant = ((ms as M[]) ?? []).filter(
    (m) => m.reg_home !== m.home_score || m.reg_away !== m.away_score
  );
  if (relevant.length === 0) return [];

  const ids = relevant.map((m) => m.id);
  const byId = new Map(relevant.map((m) => [m.id, m]));

  const { data: ps } = await sb
    .from('predictions')
    .select('match_id, predicted_home, predicted_away, players(name)')
    .in('match_id', ids);

  type Row = { match_id: number; predicted_home: number; predicted_away: number; players: { name: string } | { name: string }[] | null };
  const agg = new Map<string, { balance: number; affected: number }>();
  for (const r of (ps as Row[]) ?? []) {
    const m = byId.get(r.match_id);
    if (!m) continue;
    const name = Array.isArray(r.players) ? r.players[0]?.name : r.players?.name;
    if (!name) continue;
    const after = calculatePoints(m.home_score, m.away_score, r.predicted_home, r.predicted_away);
    const before = calculatePoints(m.reg_home, m.reg_away, r.predicted_home, r.predicted_away);
    const swing = after - before;
    const cur = agg.get(name) ?? { balance: 0, affected: 0 };
    cur.balance += swing;
    if (swing !== 0) cur.affected += 1;
    agg.set(name, cur);
  }

  return [...agg.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}

/**
 * Černokněžník + tabulky kontinentů (jedno načtení dat, dva výstupy).
 * - Černokněžník: kolikrát tipér jako JEDINÝ bodoval v zápase (ostatní 0 b).
 * - Kontinenty: body získané v zápasech týmů daného kontinentu.
 */
export async function getWizardAndContinentStats(seasonId: number): Promise<{
  wizard: { name: string; count: number }[];
  spodina: { name: string; count: number }[];
  continents: { key: ContinentKey; label: string; icon: string; rows: { name: string; points: number; matches: number }[] }[];
  regions: { key: LeagueRegionKey; label: string; icon: string; rows: { name: string; points: number; matches: number }[] }[];
}> {
  const sb = createServerReadClient();
  const { data: seasonMeta } = await sb
    .from('seasons')
    .select('competition_key')
    .eq('id', seasonId)
    .maybeSingle();
  const isLeagueSeason = seasonMeta?.competition_key === 'liga';

  let matchQuery = sb
    .from('matches')
    .select('id, home_team, away_team, round, source_league')
    .eq('season_id', seasonId)
    .eq('status', 'finished')
    .not('home_score', 'is', null);

  if (isLeagueSeason) {
    matchQuery = matchQuery.gt('round', 0).eq('source_league', 'cze.1');
  }

  const { data: ms } = await matchQuery;

  type M = { id: number; home_team: string; away_team: string; round: number; source_league: string | null };
  const matches = (ms as M[]) ?? [];
  if (matches.length === 0) return { wizard: [], spodina: [], continents: [], regions: [] };

  const { data: ps } = await sb
    .from('predictions')
    .select('match_id, points, players(name)')
    .in('match_id', matches.map((m) => m.id))
    .not('points', 'is', null);

  type P = { match_id: number; points: number; players: { name: string } | { name: string }[] | null };
  const byMatch = new Map<number, { name: string; points: number }[]>();
  for (const r of (ps as P[]) ?? []) {
    const name = Array.isArray(r.players) ? r.players[0]?.name : r.players?.name;
    if (!name) continue;
    const arr = byMatch.get(r.match_id) ?? [];
    arr.push({ name, points: r.points });
    byMatch.set(r.match_id, arr);
  }

  const wizard = new Map<string, number>();
  const spodina = new Map<string, number>();
  const cont = new Map<ContinentKey, Map<string, { points: number; matches: number }>>();
  const regions = new Map<LeagueRegionKey, Map<string, { points: number; matches: number }>>();

  for (const m of matches) {
    const tips = byMatch.get(m.id) ?? [];
    if (tips.length === 0) continue;

    // Černokněžník: bodoval právě jeden, ostatní vyšli naprázdno
    const scorers = tips.filter((t) => t.points > 0);
    if (scorers.length === 1 && tips.length > 1) {
      wizard.set(scorers[0].name, (wizard.get(scorers[0].name) ?? 0) + 1);
    }
    // Spodina: jako JEDINÝ nebodoval (všichni ostatní body mají)
    const blanks = tips.filter((t) => t.points === 0);
    if (blanks.length === 1 && tips.length > 1) {
      spodina.set(blanks[0].name, (spodina.get(blanks[0].name) ?? 0) + 1);
    }

    // kontinenty: zápas přispěje do tabulky každého zúčastněného kontinentu
    for (const key of matchContinents(m.home_team, m.away_team)) {
      const tbl = cont.get(key) ?? new Map<string, { points: number; matches: number }>();
      for (const t of tips) {
        const cur = tbl.get(t.name) ?? { points: 0, matches: 0 };
        cur.points += t.points;
        cur.matches += 1;
        tbl.set(t.name, cur);
      }
      cont.set(key, tbl);
    }

    // Liga: stejné pravidlo jako u kontinentů MS, jen podle regionálních skupin.
    // Meziregionální zápas přispěje do obou tabulek, derby pouze jednou.
    if (isLeagueSeason) {
      for (const key of matchLeagueRegions(m.home_team, m.away_team)) {
        const tbl = regions.get(key) ?? new Map<string, { points: number; matches: number }>();
        for (const t of tips) {
          const cur = tbl.get(t.name) ?? { points: 0, matches: 0 };
          cur.points += t.points;
          cur.matches += 1;
          tbl.set(t.name, cur);
        }
        regions.set(key, tbl);
      }
    }
  }

  return {
    wizard: [...wizard.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'cs')),
    spodina: [...spodina.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'cs')),
    continents: CONTINENTS.filter((c) => cont.has(c.key)).map((c) => ({
      ...c,
      rows: [...(cont.get(c.key) ?? new Map()).entries()]
        .map(([name, v]) => ({ name, points: v.points, matches: v.matches }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'cs')),
    })),
    regions: LEAGUE_REGIONS.filter((region) => regions.has(region.key)).map((region) => ({
      ...region,
      rows: [...(regions.get(region.key) ?? new Map()).entries()]
        .map(([name, value]) => ({ name, points: value.points, matches: value.matches }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'cs')),
    })),
  };
}
