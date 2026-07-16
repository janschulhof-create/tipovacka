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
  const dates = req.nextUrl.searchParams.get('dates') ?? (full ? '20260701-20270615' : dateWindow(7, 45));
  const supabase = createAdminClient();
  const results: Record<string, unknown> = {};

  for (const key of keys) {
    const competition = getCompetition(key);
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id, name')
      .eq('competition_key', key)
      .eq('is_active', true)
      .maybeSingle();

    if (seasonError || !season) {
      results[key] = { ok: false, error: 'no active season' };
      continue;
    }

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
    let skippedOvertime = 0;

    for (const m of selected) {
      if (m.status === 'finished' && m.duration !== 'REGULAR') skippedOvertime++;

      const { data: existing } = await supabase
        .from('matches')
        .select('id')
        .eq('season_id', season.id)
        .eq('source_league', m.source_league)
        .eq('external_api_id', m.external_api_id)
        .maybeSingle();

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

      if (existing?.id) {
        const { error } = await supabase.from('matches').update(payload).eq('id', existing.id);
        if (!error) updated++;
      } else {
        const { error } = await supabase.from('matches').insert(payload);
        if (!error) inserted++;
      }
    }

    results[key] = {
      ok: sourceErrors.length < competition.espnSlugs.length,
      season: season.name,
      dates,
      fetched: fetched.length,
      selected: selected.length,
      inserted,
      updated,
      skippedOvertime,
      sourceErrors,
    };
  }

  return NextResponse.json({ ok: true, results, at: new Date().toISOString() });
}
