import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCompetition, type CompetitionKey } from '@/lib/competitions';
import {
  apiDateWindow,
  fetchOfficialFixturesByIds,
  fetchOfficialLeagueFixtures,
  type CompetitionFixture,
} from '@/lib/espnCompetition';
import { selectionReason } from '@/lib/cupSelection';
import { runRoastBatch } from '@/lib/roastBatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SyncKey = Extract<CompetitionKey, 'liga' | 'evropa'>;

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
  extra_home: number | null;
  extra_away: number | null;
  pen_home: number | null;
  pen_away: number | null;
  selection_reason: string | null;
  updated_at: string;
};

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

function ymdFromCompact(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function parseRequestedRange(value: string | null): { from: string; to: string } | null {
  if (!value) return null;
  const compact = value.match(/^(\d{8})-(\d{8})$/);
  if (compact) return { from: ymdFromCompact(compact[1]), to: ymdFromCompact(compact[2]) };
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  return iso ? { from: iso[1], to: iso[2] } : null;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  return String(a) === String(b);
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function europeanWeek(fixture: CompetitionFixture, seasonYear: number): CompetitionFixture {
  const kickoff = new Date(fixture.kickoff);
  const utcDay = kickoff.getUTCDay() || 7;
  const monday = new Date(Date.UTC(
    kickoff.getUTCFullYear(), kickoff.getUTCMonth(), kickoff.getUTCDate() - utcDay + 1,
  ));
  const sunday = new Date(monday.getTime() + 6 * 864e5);
  const seasonMonday = new Date(Date.UTC(seasonYear, 5, 29));
  const round = Math.floor((monday.getTime() - seasonMonday.getTime()) / (7 * 864e5)) + 1;
  const fmt = (date: Date) => `${date.getUTCDate()}. ${date.getUTCMonth() + 1}.`;
  return {
    ...fixture,
    round: Math.max(1, round),
    round_label: `Evropský týden ${fmt(monday)}–${fmt(sunday)}`,
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const keys = parseKeys(req.nextUrl.searchParams.get('competition'));
  const full = req.nextUrl.searchParams.get('full') === '1';
  const repairRequested = req.nextUrl.searchParams.get('repair') === '1';
  const requestedRange = parseRequestedRange(req.nextUrl.searchParams.get('dates'));
  const supabase = createAdminClient();
  const results: Record<string, unknown> = {};
  const now = new Date();
  const nowMs = now.getTime();
  const liveRefreshMinutes = Math.max(5, Number(process.env.PUBLIC_FEED_LIVE_REFRESH_MINUTES ?? 10));
  const scheduleRefreshHours = Math.max(6, Number(process.env.PUBLIC_FEED_SCHEDULE_REFRESH_HOURS ?? 12));

  for (const key of keys) {
    const competition = getCompetition(key);
    let { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id, name, api_season')
      .eq('competition_key', key)
      .eq('is_active', true)
      .maybeSingle();

    if (!season && !seasonError) {
      const seasonName = key === 'liga' ? 'Chance liga 2026/27' : 'Evropa 2026/27';
      const { data: savedSeason, error: saveError } = await supabase
        .from('seasons')
        .upsert(
          { name: seasonName, api_season: 2026, competition_key: key, is_active: true },
          { onConflict: 'competition_key,name' },
        )
        .select('id, name, api_season')
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

    const { data: existingData, error: existingError } = await supabase
      .from('matches')
      .select(
        'id, external_api_id, source_league, round, round_label, kickoff, home_team, away_team, home_score, away_score, status, minute, clock, duration, extra_home, extra_away, pen_home, pen_away, selection_reason, updated_at',
      )
      .eq('season_id', season.id);

    if (existingError) {
      results[key] = { ok: false, error: existingError.message };
      continue;
    }

    const existingRows = ((existingData as ExistingMatch[]) ?? []);
    const bootstrap = existingRows.length === 0;
    const seasonStartMs = Date.UTC(Number(season.api_season ?? 2026), 6, 1);
    const firstRoundRows = existingRows.filter((match) => match.round === 1);
    const firstRoundTeams = new Set(firstRoundRows.flatMap((match) => [match.home_team, match.away_team]));
    const sourceRepairNeeded = repairRequested
      || (key === 'liga' && existingRows.length > 0 && (
        existingRows.length !== 240
        || firstRoundRows.length !== 8
        || firstRoundTeams.size !== 16
      ))
      || (key === 'evropa' && existingRows.some(
        (match) => new Date(match.kickoff).getTime() < seasonStartMs
          || !String(match.round_label ?? '').startsWith('Evropský týden '),
      ));
    const futureRows = existingRows
      .filter((m) => new Date(m.kickoff).getTime() > nowMs && m.status !== 'cancelled')
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
    const scheduleMarker = futureRows[0] ?? null;
    const scheduleDue = !!scheduleMarker && (
      nowMs - new Date(scheduleMarker.updated_at).getTime() >= scheduleRefreshHours * 3600_000
    );

    const liveLo = nowMs - 4 * 3600_000;
    const liveHi = nowMs + 30 * 60_000;
    const staleBefore = nowMs - liveRefreshMinutes * 60_000;
    const liveCandidates = existingRows.filter((m) => {
      const kickoff = new Date(m.kickoff).getTime();
      const lastTouch = new Date(m.updated_at).getTime();
      return m.status !== 'finished'
        && m.status !== 'cancelled'
        && m.external_api_id != null
        && kickoff >= liveLo
        && kickoff <= liveHi
        && lastTouch <= staleBefore;
    });

    const range = requestedRange ?? apiDateWindow(2, 60);
    const mode: 'full-season' | 'schedule-window' | 'live-ids' | 'idle' =
      full || bootstrap || sourceRepairNeeded
        ? 'full-season'
        : requestedRange || scheduleDue
          ? 'schedule-window'
          : liveCandidates.length > 0
            ? 'live-ids'
            : 'idle';

    const fetched: CompetitionFixture[] = [];
    const sourceErrors: { source: string; error: string }[] = [];
    const warnings: { source: string; error: string }[] = [];
    let requests = 0;
    let requestsRemaining: number | null = null;

    if (mode !== 'idle') {
      if (mode === 'live-ids') {
        const bySource = new Map<string, number[]>();
        for (const candidate of liveCandidates) {
          if (!candidate.source_league || candidate.external_api_id == null) continue;
          const list = bySource.get(candidate.source_league) ?? [];
          list.push(candidate.external_api_id);
          bySource.set(candidate.source_league, list);
        }
        for (const [sourceLeague, ids] of bySource) {
          for (const part of chunks(ids, 24)) {
            try {
              const fetchedPart = await fetchOfficialFixturesByIds(sourceLeague, part);
              fetched.push(...fetchedPart.fixtures);
              requests += fetchedPart.requests;
            } catch (error) {
              sourceErrors.push({ source: `official-live:${sourceLeague}`, error: String(error) });
            }
          }
        }
      } else {
        const jobs = competition.espnSlugs.map(async (slug) => {
          const result = await fetchOfficialLeagueFixtures(
            slug,
            Number(season.api_season ?? 2026),
            mode === 'schedule-window' ? range : undefined,
          );
          return { slug, result };
        });
        const settled = await Promise.allSettled(jobs);
        for (let i = 0; i < settled.length; i++) {
          const item = settled[i];
          const slug = competition.espnSlugs[i];
          if (item.status === 'fulfilled') {
            fetched.push(...item.value.result.fixtures);
            requests += item.value.result.requests;
          } else {
            sourceErrors.push({ source: `official:${slug}`, error: String(item.reason) });
          }
        }
      }
    }

    // ESPN může výjimečně vrátit stejný event zároveň pod hlavní soutěží
    // i kvalifikačním slugem. Event ID je globální, proto jej uložíme jen jednou.
    const uniqueFetchedRaw = Array.from(
      new Map(fetched.map((match) => [match.external_api_id, match])).values(),
    );
    const uniqueFetched = key === 'evropa'
      ? uniqueFetchedRaw.map((match) => europeanWeek(match, Number(season.api_season ?? 2026)))
      : uniqueFetchedRaw;
    const selected = key === 'evropa'
      ? uniqueFetched
          .map((m) => ({ ...m, selection_reason: selectionReason(m.home_team, m.away_team, m.source_league) }))
          .filter((m) => m.selection_reason !== null)
      : uniqueFetched.map((m) => ({ ...m, selection_reason: 'all' as const }));

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let removed = 0;
    let invalidatedPredictions = 0;

    const existingBySourceId = new Map<string, ExistingMatch>();
    for (const row of existingRows) {
      if (row.source_league && row.external_api_id != null) {
        existingBySourceId.set(`${row.source_league}|${row.external_api_id}`, row);
      }
    }

    // Jednorázová samooprava starých chybných importů. Mazání proběhne až po
    // úspěšném načtení nového zdroje; případné tipy se odstraní kaskádou,
    // protože byly vytvořené nad nesprávným zápasem/sezonou.
    if (sourceRepairNeeded && uniqueFetched.length > 0) {
      const selectedKeys = new Set(
        selected.map((match) => `${match.source_league}|${match.external_api_id}`),
      );
      const staleRows = existingRows.filter((match) => {
        if (key === 'evropa') {
          const sourceKey = match.source_league && match.external_api_id != null
            ? `${match.source_league}|${match.external_api_id}`
            : '';
          return new Date(match.kickoff).getTime() < seasonStartMs
            || !competition.espnSlugs.includes(match.source_league ?? '')
            || !sourceKey
            || !selectedKeys.has(sourceKey);
        }
        return match.source_league === 'cze.1'
          && match.external_api_id != null
          && !selectedKeys.has(`cze.1|${match.external_api_id}`);
      });

      if (staleRows.length > 0) {
        const staleIds = staleRows.map((match) => match.id);
        const { count } = await supabase
          .from('predictions')
          .select('id', { count: 'exact', head: true })
          .in('match_id', staleIds);
        const { error } = await supabase.from('matches').delete().in('id', staleIds);
        if (error) sourceErrors.push({ source: 'database-repair-delete', error: error.message });
        else {
          removed = staleIds.length;
          invalidatedPredictions += count ?? 0;
          for (const stale of staleRows) {
            if (stale.source_league && stale.external_api_id != null) {
              existingBySourceId.delete(`${stale.source_league}|${stale.external_api_id}`);
            }
          }
        }
      }
    }

    const inserts: Record<string, unknown>[] = [];
    const updates: { id: number; payload: Record<string, unknown>; pairingChanged: boolean }[] = [];

    for (const m of selected) {
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
        extra_home: m.extra_home,
        extra_away: m.extra_away,
        pen_home: m.pen_home,
        pen_away: m.pen_away,
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
        !sameValue(existing.extra_home, payload.extra_home) ||
        !sameValue(existing.extra_away, payload.extra_away) ||
        !sameValue(existing.pen_home, payload.pen_home) ||
        !sameValue(existing.pen_away, payload.pen_away) ||
        !sameValue(existing.selection_reason, payload.selection_reason);

      if (changed) updates.push({
        id: existing.id,
        payload,
        pairingChanged: existing.home_team !== payload.home_team || existing.away_team !== payload.away_team,
      });
      else unchanged++;
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from('matches').insert(inserts);
      if (error) sourceErrors.push({ source: 'database-insert', error: error.message });
      else inserted = inserts.length;
    }

    const pairingChangedIds = updates.filter((item) => item.pairingChanged).map((item) => item.id);
    if (pairingChangedIds.length > 0) {
      const { count } = await supabase
        .from('predictions')
        .select('id', { count: 'exact', head: true })
        .in('match_id', pairingChangedIds);
      const { error } = await supabase.from('predictions').delete().in('match_id', pairingChangedIds);
      if (error) warnings.push({ source: 'prediction-repair', error: error.message });
      else invalidatedPredictions += count ?? 0;
    }

    for (const item of updates) {
      const { error } = await supabase.from('matches').update(item.payload).eq('id', item.id);
      if (error) sourceErrors.push({ source: `database-update:${item.id}`, error: error.message });
      else updated++;
    }

    // updated_at používáme zároveň jako levný throttle. I když se skóre nezměnilo,
    // stejný live zápas nevoláme při každém běhu cronu, ale nejvýše jednou
    // za PUBLIC_FEED_LIVE_REFRESH_MINUTES (výchozí 10 minut).
    if (mode === 'live-ids' && liveCandidates.length > 0 && requests > 0) {
      await supabase
        .from('matches')
        .update({ updated_at: now.toISOString() })
        .in('id', liveCandidates.map((m) => m.id));
    }
    if ((mode === 'schedule-window' || mode === 'full-season') && scheduleMarker && requests > 0) {
      await supabase
        .from('matches')
        .update({ updated_at: now.toISOString() })
        .eq('id', scheduleMarker.id);
    }

    let roasts = { done: 0, remaining: 0 };
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        roasts = await runRoastBatch(supabase, season.id, 2);
      } catch (error) {
        warnings.push({ source: 'anthropic-roast', error: String(error) });
      }
    }

    if (mode !== 'idle' && uniqueFetched.length === 0 && sourceErrors.length === 0) {
      sourceErrors.push({
        source: key === 'liga' ? 'chanceliga-official' : 'espn-public',
        error: 'Zdroj vrátil 0 zápasů. Žádný API klíč není potřeba; podrobnost je uvedena v sourceErrors.',
      });
    }

    results[key] = {
      ok: sourceErrors.length === 0,
      idle: mode === 'idle',
      source: key === 'liga' ? 'chanceliga-official-validated' : 'espn-public',
      season: season.name,
      mode,
      range: mode === 'schedule-window' ? `${range.from}..${range.to}` : null,
      bootstrap,
      sourceRepairNeeded,
      fetched: uniqueFetched.length,
      selected: selected.length,
      inserted,
      updated,
      unchanged,
      removed,
      invalidatedPredictions,
      liveCandidates: liveCandidates.length,
      requests,
      requestsRemaining,
      roasts,
      sourceErrors,
      warnings,
    };
  }

  const overallOk = keys.every((key) => (results[key] as { ok?: boolean } | undefined)?.ok !== false);
  return NextResponse.json({ ok: overallOk, results, at: new Date().toISOString() });
}
