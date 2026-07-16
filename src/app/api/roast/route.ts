import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { loadStandingsText, runRoastBatch } from '@/lib/roastBatch';
import type { CompetitionKey } from '@/lib/competitions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SeasonRow = { id: number; name: string; competition_key: CompetitionKey };

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const p = req.nextUrl.searchParams;
  return !!secret && (
    p.get('key') === secret ||
    req.headers.get('authorization') === `Bearer ${secret}`
  );
}

/**
 * Správa automatického hodnocení zápasů pro všechny soutěže.
 *   GET /api/roast?key=...                         → MS + Liga + Evropa
 *   GET /api/roast?key=...&competition=liga      → jen Chance liga
 *   GET /api/roast?key=...&reset=finished        → smaže hodnocení vybraných soutěží
 *   GET /api/roast?key=...&reset=1&id=123        → smaže hodnocení jednoho zápasu
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'chybí ANTHROPIC_API_KEY ve Vercelu' }, { status: 500 });
  }

  const supabase = createAdminClient();
  const requested = p.get('competition');
  const competition = requested === 'ms' || requested === 'liga' || requested === 'evropa'
    ? requested
    : null;

  let seasonQuery = supabase
    .from('seasons')
    .select('id, name, competition_key')
    .eq('is_active', true);
  if (competition) seasonQuery = seasonQuery.eq('competition_key', competition);

  const { data: seasonsData, error: seasonsError } = await seasonQuery;
  if (seasonsError) return NextResponse.json({ error: seasonsError.message }, { status: 500 });
  const seasons = (seasonsData as SeasonRow[]) ?? [];
  if (seasons.length === 0) {
    return NextResponse.json({ error: 'aktivní sezóna nenalezena' }, { status: 404 });
  }

  const reset = p.get('reset');

  if (reset === '1') {
    const id = Number(p.get('id'));
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'chybí ?id=<číslo>' }, { status: 400 });
    await supabase.from('matches').update({ roast: null }).eq('id', id);
    return NextResponse.json({ reset: 1, id });
  }

  if (reset === 'finished' || reset === 'all') {
    let total = 0;
    const resetResults: Record<string, number> = {};
    for (const season of seasons) {
      const { count } = await supabase
        .from('matches')
        .update({ roast: null }, { count: 'exact' })
        .eq('season_id', season.id)
        .eq('status', 'finished');
      const value = count ?? 0;
      resetResults[season.competition_key] = value;
      total += value;
    }
    return NextResponse.json({
      reset: 'finished',
      vynulovano: total,
      souteze: resetResults,
      dalsi_krok: 'Nech běžet stávající cron nebo endpoint zavolej znovu pro rychlejší doplnění.',
    });
  }

  const started = Date.now();
  const results: Record<string, { name: string; vygenerovano: number; zbyva: number }> = {};

  for (const season of seasons) {
    const standings = await loadStandingsText(supabase, season.id);
    let done = 0;
    let remaining = 0;
    do {
      const res = await runRoastBatch(supabase, season.id, 3, standings);
      done += res.done;
      remaining = res.remaining;
      if (res.done === 0) break;
    } while (remaining > 0 && Date.now() - started < 24000);

    results[season.competition_key] = {
      name: season.name,
      vygenerovano: done,
      zbyva: remaining,
    };

    if (Date.now() - started >= 24000) break;
  }

  const remainingTotal = Object.values(results).reduce((sum, item) => sum + item.zbyva, 0);
  return NextResponse.json({
    souteze: results,
    vygenerovano: Object.values(results).reduce((sum, item) => sum + item.vygenerovano, 0),
    zbyva: remainingTotal,
    hotovo: remainingTotal === 0,
    tip: remainingTotal > 0 ? 'Zavolej endpoint znovu nebo počkej na další běh stávajícího cronu.' : 'Všechna hodnocení jsou hotová.',
  });
}
