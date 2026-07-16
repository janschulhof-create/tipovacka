import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCompetition, type CompetitionKey } from '@/lib/competitions';
import { dateWindow, fetchCompetitionFixtures, type CompetitionFixture } from '@/lib/espnCompetition';
import { selectionReason } from '@/lib/cupSelection';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

type SyncKey = Extract<CompetitionKey, 'liga' | 'evropa'>;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const key = req.nextUrl.searchParams.get('key');
  const auth = req.headers.get('authorization');
  return !!secret && (key === secret || auth === `Bearer ${secret}`);
}

function parseKeys(value: string | null): SyncKey[] {
  if (value === 'liga') return ['liga'];
  if (value === 'evropa') return ['evropa'];
  return ['liga', 'evropa'];
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const keys = parseKeys(req.nextUrl.searchParams.get('competition'));
  const full = req.nextUrl.searchParams.get('full') === '1';
  const requestedDates = req.nextUrl.searchParams.get('dates');
  const supabase = createAdminClient();
  const results: Record<string, unknown> = {};

  for (const key of keys) {
    const competition = getCompetition(key);
    let { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id, name')
      .eq('competition_key', key)
      .eq('is_active', true)
      .maybeSingle();

    // Pokud byla SQL migrace spuštěná, ale řádek sezony chybí, založí ho
    // první běh automaticky. Není tedy potřeba ručně zakládat sezonu.
    if (!season && !seasonError) {
      const seasonName = key === 'liga' ? 'Chance liga 2026/27' : 'Evropa 2026/27';
      const { data: savedSeason, error: saveError } = await supabase
        .from('seasons')
        .upsert(
          { name: seasonName, api_season: 2026, competition_key: key, is_active: true },
          { onConflict: 'competition_key,name' },
        )
        .select('id, name')
        .single();
      season = savedSeason;
      seasonError = saveError;
    }

    if (seasonError || !season) {
      results[key] = {
        ok: false,
        error: 'no active season; run the multi-competition SQL migration first',
        detail: seasonError?.message ?? null,
      };
      continue;
    }

    // Při úplně prvním běhu načti automaticky celou sezonu. Další běhy
    // používají kratší průběžné okno, takže stávající častý cron zůstává levný.
    const { count: existingCount, error: countError } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', season.id);
    const bootstrap = !countError && (existingCount ?? 0) === 0;
    const dates = requestedDates ?? ((full || bootstrap) ? '20260701-20270615' : dateWindow(7, 45));

    const fetched: CompetitionFixture[] = [];
    const sourceErrors: { slug: string; error: string }[] = [];
    for (const slug of competition.espnSlugs) {
      try {
        fetched.push(
          ...(await fetchCompetitionFixtures(slug, dates, key === 'liga' ? 'league' : 'europe')),
        );
      } catch (error) {
        sourceErrors.push({ slug, error: String(error) });
      }
    }

    const selected = key === 'evropa'
      ? fetched
          .map((m) => ({ ...m, selection_reason: selectionReason(m.home_team, m.away_team) }))
          .filter((m) => m.selection_reason !== null)
      : fetched.map((m) => ({ ...m, selection_reason: 'all' as const }));

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let skippedOvertime = 0;

    type ExistingMatch = {
      id: number;
      external_api_id: number | null;
      source_league: string | null;
      round: number;
      round_label: string | null;
      kickoff: string;
      home_team: string;
      away_team: string;
      home_score: number | null;
      away_score: number | null;
      status: string;
      minute: number | null;
      clock: string | null;
      duration: string | null;
      selection_reason: string | null;
    };

    const { data: existingRows, error: existingError } = await supabase
      .from('matches')
      .select(
        'id, external_api_id, source_league, round, round_label, kickoff, home_team, away_team, home_score, away_score, status, minute, clock, duration, selection_reason',
      )
      .eq('season_id', season.id);

    if (existingError) {
      results[key] = { ok: false, error: existingError.message };
      continue;
    }

    const existingBySourceId = new Map<string, ExistingMatch>();
    for (const row of (existingRows as ExistingMatch[]) ?? []) {
      if (row.source_league && row.external_api_id != null) {
        existingBySourceId.set(`${row.source_league}|${row.external_api_id}`, row);
      }
    }

    const inserts: Record<string, unknown>[] = [];
    const updates: { id: number; payload: Record<string, unknown> }[] = [];
    const sameValue = (a: unknown, b: unknown): boolean => {
      if (a == null && b == null) return true;
      return String(a) === String(b);
    };

    for (const m of selected) {
      if (m.status === 'finished' && m.duration !== 'REGULAR') skippedOvertime++;

      const payload = {
        season_id: season.id,
        external_api_id: m.external_api_id,
        source_league: m.source_league,
        round: m.round,
        round_label: m.round_label,
        kickoff: m.kickoff,
        home_team: m.home_team,
        away_team: m.away_team,
        home_score: m.home_score,
        away_score: m.away_score,
        status: m.status,
        minute: m.minute,
        clock: m.clock,
        duration: m.duration,
        selection_reason: m.selection_reason,
      };

      const existing = existingBySourceId.get(`${m.source_league}|${m.external_api_id}`);
      if (!existing) {
        inserts.push(payload);
        continue;
      }

      const changed =
        !sameValue(existing.round, payload.round) ||
        !sameValue(existing.round_label, payload.round_label) ||
        new Date(existing.kickoff).getTime() !== new Date(payload.kickoff).getTime() ||
        !sameValue(existing.home_team, payload.home_team) ||
        !sameValue(existing.away_team, payload.away_team) ||
        !sameValue(existing.home_score, payload.home_score) ||
        !sameValue(existing.away_score, payload.away_score) ||
        !sameValue(existing.status, payload.status) ||
        !sameValue(existing.minute, payload.minute) ||
        !sameValue(existing.clock, payload.clock) ||
        !sameValue(existing.duration, payload.duration) ||
        !sameValue(existing.selection_reason, payload.selection_reason);

      if (changed) updates.push({ id: existing.id, payload });
      else unchanged++;
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from('matches').insert(inserts);
      if (error) sourceErrors.push({ slug: 'database-insert', error: error.message });
      else inserted = inserts.length;
    }

    // Aktualizujeme jen skutečně změněné zápasy. Běžný častý cron tak
    // nezapisuje znovu celý rozpis, ale typicky jen právě hrané zápasy.
    for (const item of updates) {
      const { error } = await supabase.from('matches').update(item.payload).eq('id', item.id);
      if (!error) updated++;
    }

    results[key] = {
      ok: sourceErrors.length < competition.espnSlugs.length,
      season: season.name,
      dates,
      bootstrap,
      fetched: fetched.length,
      selected: selected.length,
      inserted,
      updated,
      unchanged,
      skippedOvertime,
      sourceErrors,
    };
  }

  return NextResponse.json({ ok: true, results, at: new Date().toISOString() });
}
