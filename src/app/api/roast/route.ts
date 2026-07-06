import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { loadStandingsText, runRoastBatch } from '@/lib/roastBatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Správa hodnocení zápasů.
 *   GET /api/roast?key=CRON_SECRET                 → vygeneruje dávku chybějících (volej opakovaně)
 *   GET /api/roast?key=CRON_SECRET&reset=finished  → smaže hodnocení u VŠECH dohraných (pak se přegenerují)
 *   GET /api/roast?key=CRON_SECRET&reset=1&id=123  → smaže hodnocení u jednoho zápasu
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get('key') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized – přidej ?key=CRON_SECRET' }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'chybí ANTHROPIC_API_KEY ve Vercelu' }, { status: 500 });
  }

  const supabase = createAdminClient();
  const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single();
  if (!season) return NextResponse.json({ error: 'aktivní season nenalezena' }, { status: 404 });

  const reset = p.get('reset');

  // Reset jednoho zápasu
  if (reset === '1') {
    const id = Number(p.get('id'));
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'chybí ?id=<číslo>' }, { status: 400 });
    await supabase.from('matches').update({ roast: null }).eq('id', id);
    return NextResponse.json({ reset: 1, id });
  }

  // Reset všech dohraných → přegenerují se (novým modelem / promptem)
  if (reset === 'finished' || reset === 'all') {
    const { count } = await supabase
      .from('matches')
      .update({ roast: null }, { count: 'exact' })
      .eq('season_id', season.id)
      .eq('status', 'finished');
    return NextResponse.json({
      reset: 'finished',
      vynulovano: count ?? 0,
      dalsi_krok: 'Nech běžet cron (3/min) nebo opakovaně volej /api/roast?key=… pro rychlejší doplnění.',
    });
  }

  // Dávkové generování v rámci časového rozpočtu (Sonnet je pomalejší → menší dávky).
  const started = Date.now();
  const standings = await loadStandingsText(supabase, season.id);
  let done = 0;
  let remaining = 0;
  do {
    const res = await runRoastBatch(supabase, season.id, 4, standings);
    done += res.done;
    remaining = res.remaining;
    if (res.done === 0) break; // nic dalšího / bez tipů
  } while (remaining > 0 && Date.now() - started < 24000);

  return NextResponse.json({
    vygenerovano: done,
    zbyva: remaining,
    hotovo: remaining === 0,
    tip: remaining > 0 ? 'Zavolej endpoint znovu pro další dávku (nebo počkej na cron).' : 'Všechna hodnocení jsou hotová.',
  });
}
