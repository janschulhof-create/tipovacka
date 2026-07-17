import { NextResponse } from 'next/server';
import { createServerAuthClient } from '@/lib/supabase/server';
import { getSessionPlayer } from '@/lib/auth';
import { calculatePoints } from '@/lib/scoring';
import h2hData from '@/data/h2h.json';
import historie from '@/data/historie.json';
import { canonTeam } from '@/lib/teamAliases';
import { predictMatch } from '@/lib/predict';

export const dynamic = 'force-dynamic';

interface H2HMatch {
  date: string;
  home: string;
  away: string;
  hs: number;
  as: number;
  comp?: string;
}

interface HistoricalTipRow {
  round: number;
  home: string;
  away: string;
  hs: number | null;
  as: number | null;
  ph: number;
  pa: number;
  points: number | null;
}

interface FormRow {
  matchId: number;
  home: string;
  away: string;
  hs: number;
  as: number;
  ph: number;
  pa: number;
  points: number;
}

export async function GET(req: Request) {
  const matchId = Number(new URL(req.url).searchParams.get('match'));
  if (!matchId) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const sb = await createServerAuthClient();
  const { data: match } = await sb
    .from('matches')
    .select('id, home_team, away_team, season_id')
    .eq('id', matchId)
    .single();
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const teams = { home: match.home_team as string, away: match.away_team as string };

  // ---------- Vzájemné zápasy (z přibaleného datasetu mezinárodních výsledků) ----------
  const pairKey = [teams.home, teams.away].sort().join('|');
  const h2h: H2HMatch[] = ((h2hData as unknown as Record<string, H2HMatch[]>)[pairKey] ?? []).slice(0, 5);

  const player = await getSessionPlayer();

  // ---------- Minulá sezona Chance ligy: tvůj tip, výsledek a body ----------
  let previousSeasonTips: HistoricalTipRow[] = [];
  if (player) {
    const archive = historie as unknown as {
      season: string;
      rounds: {
        round: number;
        matches: {
          home: string; away: string; hs: number | null; as: number | null;
          tips: Record<string, { h: number; a: number; pts: number | null }>;
        }[];
      }[];
    };
    const currentPair = [canonTeam(teams.home), canonTeam(teams.away)].sort().join('|');
    previousSeasonTips = archive.rounds.flatMap((round) =>
      round.matches.flatMap((m) => {
        const archivedPair = [canonTeam(m.home), canonTeam(m.away)].sort().join('|');
        const tip = m.tips[player.name];
        if (archivedPair !== currentPair || !tip) return [];
        return [{
          round: round.round, home: m.home, away: m.away, hs: m.hs, as: m.as,
          ph: tip.h, pa: tip.a, points: tip.pts,
        }];
      }),
    );
  }

  // ---------- Tvoje forma: VŠECHNY tvé tipnuté zápasy KAŽDÉHO z obou týmů na tomto MS ----------
  let form: FormRow[] = [];
  if (player) {
    const { data: finished } = await sb
      .from('matches')
      .select('id, home_team, away_team, home_score, away_score, kickoff')
      .eq('season_id', match.season_id)
      .not('home_score', 'is', null)
      .order('kickoff', { ascending: false });

    const all = (finished ?? []).filter((m) => m.id !== matchId);
    const involving = (team: string) => all.filter((m) => m.home_team === team || m.away_team === team);
    const aMatches = involving(teams.home);
    const bMatches = involving(teams.away);

    const candidateIds = Array.from(new Set([...aMatches, ...bMatches].map((m) => m.id)));
    if (candidateIds.length) {
      const { data: preds } = await sb
        .from('predictions')
        .select('match_id, predicted_home, predicted_away, points')
        .eq('player_id', player.id)
        .in('match_id', candidateIds);
      const byMatch = new Map((preds ?? []).map((p) => [p.match_id, p]));
      const kickoffById = new Map(all.map((m) => [m.id, m.kickoff as string]));

      // všechny tipnuté zápasy daného týmu (finished je už seřazené desc dle kickoff)
      const takeAll = (ms: typeof aMatches): FormRow[] =>
        ms
          .map((m) => {
            const p = byMatch.get(m.id);
            if (!p) return null;
            const hs = m.home_score as number;
            const as = m.away_score as number;
            const points = p.points ?? calculatePoints(hs, as, p.predicted_home, p.predicted_away);
            return { matchId: m.id, home: m.home_team, away: m.away_team, hs, as, ph: p.predicted_home, pa: p.predicted_away, points } as FormRow;
          })
          .filter((x): x is FormRow => x !== null);

      const seen = new Set<number>();
      form = [...takeAll(aMatches), ...takeAll(bMatches)]
        .filter((r) => (seen.has(r.matchId) ? false : (seen.add(r.matchId), true)))
        .sort((x, y) => (kickoffById.get(y.matchId) ?? '').localeCompare(kickoffById.get(x.matchId) ?? ''));
    }
  }

  // ---------- Predikce: síla útoku/obrany z odehraných zápasů turnaje ----------
  const { data: played } = await sb
    .from('matches')
    .select('home_team, away_team, home_score, away_score')
    .eq('season_id', match.season_id)
    .eq('status', 'finished')
    .not('home_score', 'is', null);

  type PM = { home_team: string; away_team: string; home_score: number; away_score: number };
  const pms = ((played as PM[]) ?? []).filter((m) => m.home_team && m.away_team);

  const formOf = (team: string) => {
    const acc = { scored: 0, conceded: 0, played: 0 };
    for (const m of pms) {
      if (m.home_team === team) {
        acc.scored += m.home_score;
        acc.conceded += m.away_score;
        acc.played++;
      } else if (m.away_team === team) {
        acc.scored += m.away_score;
        acc.conceded += m.home_score;
        acc.played++;
      }
    }
    return acc;
  };

  const totalGoals = pms.reduce((s, m) => s + m.home_score + m.away_score, 0);
  const leagueAvg = pms.length ? totalGoals / (pms.length * 2) : 0; // góly na tým a zápas
  const prediction = predictMatch(formOf(teams.home), formOf(teams.away), leagueAvg, h2h, teams.home);

  // ---------- Forma týmů: posledních 5 zápasů každého z nich na turnaji ----------
  const { data: recent } = await sb
    .from('matches')
    .select('home_team, away_team, home_score, away_score, kickoff')
    .eq('season_id', match.season_id)
    .eq('status', 'finished')
    .not('home_score', 'is', null)
    .order('kickoff', { ascending: false });

  type RM = { home_team: string; away_team: string; home_score: number; away_score: number };
  const teamForm = (team: string) =>
    ((recent as RM[]) ?? [])
      .filter((m) => m.home_team === team || m.away_team === team)
      .slice(0, 5)
      .map((m) => {
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

  const form5 = { home: teamForm(teams.home), away: teamForm(teams.away) };

  return NextResponse.json({ teams, h2h, previousSeasonTips, form, form5, prediction, loggedIn: !!player });
}
