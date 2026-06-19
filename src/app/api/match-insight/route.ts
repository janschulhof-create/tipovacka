import { NextResponse } from 'next/server';
import { createServerAuthClient } from '@/lib/supabase/server';
import { getSessionPlayer } from '@/lib/auth';
import { calculatePoints } from '@/lib/scoring';
import h2hData from '@/data/h2h.json';

export const dynamic = 'force-dynamic';

interface H2HMatch {
  date: string;
  home: string;
  away: string;
  hs: number;
  as: number;
  comp?: string;
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

  // ---------- Tvoje forma u těchto dvou týmů ----------
  let form: FormRow[] = [];
  const player = await getSessionPlayer();
  if (player) {
    const { data: finished } = await sb
      .from('matches')
      .select('id, home_team, away_team, home_score, away_score, kickoff')
      .eq('season_id', match.season_id)
      .not('home_score', 'is', null)
      .order('kickoff', { ascending: false });

    const relevant = (finished ?? []).filter(
      (m) =>
        m.id !== matchId &&
        (m.home_team === teams.home ||
          m.away_team === teams.home ||
          m.home_team === teams.away ||
          m.away_team === teams.away)
    );

    const ids = relevant.map((m) => m.id);
    if (ids.length) {
      const { data: preds } = await sb
        .from('predictions')
        .select('match_id, predicted_home, predicted_away, points')
        .eq('player_id', player.id)
        .in('match_id', ids);
      const byMatch = new Map((preds ?? []).map((p) => [p.match_id, p]));

      form = relevant
        .map((m): FormRow | null => {
          const p = byMatch.get(m.id);
          if (!p) return null;
          const hs = m.home_score as number;
          const as = m.away_score as number;
          const points = p.points ?? calculatePoints(hs, as, p.predicted_home, p.predicted_away);
          return { matchId: m.id, home: m.home_team, away: m.away_team, hs, as, ph: p.predicted_home, pa: p.predicted_away, points };
        })
        .filter((x): x is FormRow => x !== null)
        .slice(0, 6);
    }
  }

  return NextResponse.json({ teams, h2h, form, loggedIn: !!player });
}
