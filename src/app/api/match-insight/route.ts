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

  // ---------- Tvoje forma: VŠECHNY tvé tipnuté zápasy KAŽDÉHO z obou týmů na tomto MS ----------
  let form: FormRow[] = [];
  const player = await getSessionPlayer();
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

  return NextResponse.json({ teams, h2h, form, loggedIn: !!player });
}
