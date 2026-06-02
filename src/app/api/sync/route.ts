import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchSeasonFixtures } from '@/lib/apiFootball';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Synchronizace rozpisu a výsledků z API-Football.
 * Volá se:
 *   - automaticky přes Vercel Cron (viz vercel.json),
 *   - ručně: GET /api/sync?key=CRON_SECRET
 *
 * Zápis skóre + status do `matches` spustí DB trigger, který přepočítá
 * body všech tipů (calculate_points). Uzávěrku tipů hlídá druhý trigger.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  const authorized = key === secret || auth === `Bearer ${secret}`;
  if (!authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // aktivní sezóna
  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .single();
  if (seasonErr || !season) {
    return NextResponse.json({ error: 'no active season' }, { status: 500 });
  }

  let fixtures;
  try {
    fixtures = await fetchSeasonFixtures();
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  const rows = fixtures.map((f) => ({ ...f, season_id: season.id }));

  // upsert podle external_api_id → vloží nové, aktualizuje skóre/stav
  const { error, count } = await supabase
    .from('matches')
    .upsert(rows, { onConflict: 'external_api_id', count: 'exact' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ synced: count ?? rows.length, at: new Date().toISOString() });
}
