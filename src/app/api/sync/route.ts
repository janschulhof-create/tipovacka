import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchSeasonFixtures, type NormalizedMatch } from '@/lib/apiFootball';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Synchronizace rozpisu a výsledků z API-Football do aktivní sezóny.
 * Volání:
 *   - Vercel Cron (Authorization: Bearer CRON_SECRET) — viz vercel.json,
 *   - ručně: GET /api/sync?key=CRON_SECRET
 *
 * DŮLEŽITÉ pro zachování tipů: zápasy se PÁRUJÍ na už existující řádky
 * (naseedované) podle (round, home_team, away_team) v rámci aktivní sezóny.
 * Existující zápas se jen AKTUALIZUJE (skóre/stav/čas/minuta/external_api_id),
 * takže jeho id zůstává a tipy na něj zůstávají navázané. Nový řádek vznikne
 * jen pro zápas, který v DB ještě není (typicky play-off po losu).
 *
 * Zápis skóre+status spustí DB trigger calculate_points (přepočet bodů).
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!(key === secret || auth === `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: season, error: seasonErr } = await supabase
    .from('seasons').select('id').eq('is_active', true).single();
  if (seasonErr || !season) {
    return NextResponse.json({ error: 'no active season' }, { status: 500 });
  }

  let fixtures: NormalizedMatch[];
  try {
    fixtures = await fetchSeasonFixtures();
  } catch (e) {
    return NextResponse.json({
      error: String(e),
      keySet: !!process.env.API_FOOTBALL_KEY,
      league: process.env.API_FOOTBALL_LEAGUE_ID ?? '1',
      season: process.env.API_FOOTBALL_SEASON ?? '2026',
    }, { status: 502 });
  }

  // existující zápasy aktivní sezóny → klíč podle (round|home|away)
  const { data: existing } = await supabase
    .from('matches')
    .select('id, round, home_team, away_team')
    .eq('season_id', season.id);
  const keyOf = (r: number, h: string, a: string) => `${r}|${h}|${a}`;
  const idByKey = new Map<string, number>();
  for (const m of (existing as { id: number; round: number; home_team: string; away_team: string }[]) ?? []) {
    idByKey.set(keyOf(m.round, m.home_team, m.away_team), m.id);
  }

  let updated = 0;
  let inserted = 0;
  const inserts: Record<string, unknown>[] = [];

  for (const f of fixtures) {
    const id = idByKey.get(keyOf(f.round, f.home_team, f.away_team));
    if (id) {
      // jen doplníme dynamická pole — id (a tím i tipy) zůstává
      const { error } = await supabase
        .from('matches')
        .update({
          external_api_id: f.external_api_id,
          kickoff: f.kickoff,
          home_score: f.home_score,
          away_score: f.away_score,
          status: f.status,
          minute: f.minute,
        })
        .eq('id', id);
      if (!error) updated++;
    } else {
      inserts.push({ ...f, season_id: season.id });
    }
  }

  if (inserts.length) {
    const { error, count } = await supabase
      .from('matches')
      .upsert(inserts, { onConflict: 'external_api_id', count: 'exact' });
    if (error) return NextResponse.json({ error: error.message, updated }, { status: 500 });
    inserted = count ?? inserts.length;
  }

  return NextResponse.json({ updated, inserted, fetched: fixtures.length, league: process.env.API_FOOTBALL_LEAGUE_ID ?? '1', season: process.env.API_FOOTBALL_SEASON ?? '2026', at: new Date().toISOString() });
}
