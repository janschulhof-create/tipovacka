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
      tokenSet: !!process.env.FOOTBALL_DATA_TOKEN,
      competition: process.env.FOOTBALL_DATA_COMPETITION ?? 'WC',
    }, { status: 502 });
  }

  // existující zápasy aktivní sezóny:
  //  - primárně párujeme podle stabilního API id (external_api_id),
  //  - sekundárně podle (round|home|away) — kvůli prvotnímu napárování seedu.
  const { data: existing } = await supabase
    .from('matches')
    .select('id, external_api_id, round, home_team, away_team')
    .eq('season_id', season.id);
  const keyOf = (r: number, h: string, a: string) => `${r}|${h}|${a}`;
  const idByApi = new Map<number, number>();
  const idByKey = new Map<string, number>();
  for (const m of (existing as { id: number; external_api_id: number | null; round: number; home_team: string; away_team: string }[]) ?? []) {
    if (m.external_api_id != null) idByApi.set(m.external_api_id, m.id);
    idByKey.set(keyOf(m.round, m.home_team, m.away_team), m.id);
  }

  // Diagnostika (?debug=1): nic nezapisuje, jen ukáže, co se děje.
  if (req.nextUrl.searchParams.get('debug')) {
    const ex = (existing as { id: number; external_api_id: number | null; round: number; home_team: string; away_team: string }[]) ?? [];
    const orphans = ex.filter((m) => m.external_api_id == null);
    const keyCount = new Map<string, number>();
    for (const m of ex) {
      const k = keyOf(m.round, m.home_team, m.away_team);
      keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    }
    const dupKeys = [...keyCount.entries()].filter(([, c]) => c > 1).map(([k]) => k);
    const finishedFromApi = fixtures
      .filter((f) => f.status === 'finished')
      .slice(0, 8)
      .map((f) => ({ round: f.round, home: f.home_team, away: f.away_team, hs: f.home_score, as: f.away_score, api: f.external_api_id }));
    return NextResponse.json({
      existingCount: ex.length,
      fetched: fixtures.length,
      orphanCount: orphans.length,
      orphansSample: orphans.slice(0, 12).map((m) => ({ round: m.round, home: m.home_team, away: m.away_team })),
      dupKeyCount: dupKeys.length,
      dupKeys: dupKeys.slice(0, 24),
      finishedFromApi,
    });
  }

  let updated = 0;
  let inserted = 0;
  const inserts: Record<string, unknown>[] = [];

  for (const f of fixtures) {
    const id = idByApi.get(f.external_api_id) ?? idByKey.get(keyOf(f.round, f.home_team, f.away_team));
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

  return NextResponse.json({ updated, inserted, fetched: fixtures.length, competition: process.env.FOOTBALL_DATA_COMPETITION ?? 'WC', at: new Date().toISOString() });
}
