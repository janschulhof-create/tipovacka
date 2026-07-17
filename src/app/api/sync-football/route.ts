import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCompetition, type CompetitionKey } from '@/lib/competitions';
import {
  apiDateWindow,
  fetchOfficialFixturesByIds,
  fetchOfficialLeagueFixtures,
  fetchHighlightlyEvents,
  fetchHighlightlyLeagues,
  fetchHighlightlyLineups,
  fetchHighlightlyMatches,
  fetchHighlightlyStatistics,
  highlightlyConfigured,
  highlightlyToFixture,
  type CompetitionFixture,
  type HighlightlyMatch,
} from '@/lib/espnCompetition';
import { selectionReason } from '@/lib/cupSelection';
import { runRoastBatch } from '@/lib/roastBatch';
import { canonTeam } from '@/lib/teamAliases';
import type { MatchDetail, HighlightlySyncMeta } from '@/lib/espn';

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
  detail: MatchDetail | null;
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


const CHANCE_TEAMS = new Set([
  'Sparta', 'Slavia', 'Baník', 'Plzeň', 'Liberec', 'Zlín', 'Teplice', 'Bohemians',
  'Zbrojovka Brno', 'Slovácko', 'Jablonec', 'Olomouc', 'Hradec Králové', 'Pardubice',
  'Artis Brno', 'Boleslav',
]);

const HIGHLIGHTLY_PREP_FROM = '2026-07-17';
const HIGHLIGHTLY_PREP_TO = '2026-07-24';

type HighlightlyReport = {
  configured: boolean;
  requests: number;
  remaining: number | null;
  limit: number | null;
  pollMinutes: number;
  reserve: number;
  prep: { requested: boolean; fetched: number; selected: number; inserted: number; updated: number; league: string | null };
  live: {
    due: boolean;
    date: string | null;
    fetched: number;
    matched: number;
    updated: number;
    details: number;
    scoreCorrections: number;
    league: string | null;
  };
  warnings: string[];
};

function pragueYmd(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function dateSeries(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = new Date(`${from}T12:00:00.000Z`);
  const end = new Date(`${to}T12:00:00.000Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 864e5);
  }
  return out;
}

function hlMeta(detail: MatchDetail | null | undefined): HighlightlySyncMeta | null {
  const meta = detail?._highlightly;
  return meta && Number.isFinite(meta.id) ? meta : null;
}

function mergeDetail(base: MatchDetail | null | undefined, patch: Partial<MatchDetail>): MatchDetail {
  return { ...(base ?? {}), ...patch };
}

function scoreFromStoredGoals(detail: MatchDetail | null | undefined): { home: number; away: number } | null {
  if (!detail?.goals?.length) return null;
  let home = 0;
  let away = 0;
  for (const goal of detail.goals) {
    if (goal.side === 'home') home++;
    else if (goal.side === 'away') away++;
  }
  return home + away > 0 ? { home, away } : null;
}

function reconcileHighlightlyScore(
  match: HighlightlyMatch,
  detail: MatchDetail | null | undefined,
): { home: number | null; away: number | null; corrected: boolean } {
  const api = { home: match.homeScore, away: match.awayScore };
  const events = scoreFromStoredGoals(detail);
  if (!events) return { ...api, corrected: false };

  // Highlightly u některých přátelských zápasů vrací týmy v jiném pořadí než
  // události zápasu. Skóre z gólových událostí je navázané přímo na název týmu,
  // proto ho použijeme, pokud jeho celkový počet gólů souhlasí s hlavním skóre.
  if (api.home != null && api.away != null) {
    const totalsAgree = api.home + api.away === events.home + events.away;
    const differs = api.home !== events.home || api.away !== events.away;
    if (totalsAgree && differs) return { ...events, corrected: true };
    return { ...api, corrected: false };
  }

  return { ...events, corrected: true };
}

function hlPair(home: string, away: string): string {
  return `${canonTeam(home)}|${canonTeam(away)}`;
}

function isChanceTeam(name: string): boolean {
  return CHANCE_TEAMS.has(canonTeam(name));
}

function bestChanceLeague(items: { id: number; name: string }[]): { id: number; name: string } | null {
  const scored = items.map((league) => {
    const name = league.name.toLowerCase();
    let score = 0;
    if (/chance liga|czech liga/.test(name)) score += 100;
    if (/first league|1\.? liga|czech first/.test(name)) score += 50;
    if (/national|fnl|2\.? liga|women|youth|u\d+/.test(name)) score -= 100;
    return { ...league, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0] : null;
}

function shouldPollHighlightly(rows: ExistingMatch[], nowMs: number, pollMinutes: number, force: boolean): boolean {
  if (force) return rows.length > 0;
  if (rows.length === 0) return false;
  const kickoffs = rows.map((row) => new Date(row.kickoff).getTime()).filter(Number.isFinite);
  if (kickoffs.length === 0) return false;
  const starts = Math.min(...kickoffs) - 45 * 60_000;
  const ends = Math.max(...kickoffs) + 4 * 3600_000;
  if (nowMs < starts || nowMs > ends) return false;
  const last = rows
    .map((row) => hlMeta(row.detail)?.listFetchedAt)
    .filter((value): value is string => !!value)
    .map((value) => new Date(value).getTime());
  if (last.length < rows.length) return true;
  return nowMs - Math.min(...last) >= pollMinutes * 60_000;
}

async function syncHighlightlyLiga(args: {
  supabase: ReturnType<typeof createAdminClient>;
  seasonId: number;
  now: Date;
  bootstrapPrep: boolean;
  force: boolean;
}): Promise<HighlightlyReport> {
  const pollMinutes = Math.max(15, Number(process.env.HIGHLIGHTLY_LIVE_POLL_MINUTES ?? 20));
  const reserve = Math.max(8, Number(process.env.HIGHLIGHTLY_RESERVE_REQUESTS ?? 12));
  const report: HighlightlyReport = {
    configured: highlightlyConfigured(), requests: 0, remaining: null, limit: null,
    pollMinutes, reserve,
    prep: { requested: args.bootstrapPrep, fetched: 0, selected: 0, inserted: 0, updated: 0, league: null },
    live: {
      due: false,
      date: null,
      fetched: 0,
      matched: 0,
      updated: 0,
      details: 0,
      scoreCorrections: 0,
      league: null,
    },
    warnings: [],
  };
  if (!report.configured) {
    if (args.bootstrapPrep) report.warnings.push('Chybí HIGHLIGHTLY_API_KEY. Příprava nebyla načtena.');
    return report;
  }

  const absorb = (value: { requests: number; remaining: number | null; limit: number | null }) => {
    report.requests += value.requests;
    if (value.remaining != null) report.remaining = value.remaining;
    if (value.limit != null) report.limit = value.limit;
  };
  const canSpend = (needed = 1) => report.remaining == null || report.remaining - needed >= reserve;

  // Jednorázový import přípravy. Highlightly může přátelské zápasy vést
  // pod různými názvy soutěží. Proto se každý den načte jedním dotazem
  // a až lokálně se vyberou zápasy ligových klubů v přátelské soutěži.
  if (args.bootstrapPrep) {
    try {
      const configuredLeagueId = Number(process.env.HIGHLIGHTLY_FRIENDLY_LEAGUE_ID ?? 0);
      const matches: HighlightlyMatch[] = [];
      for (const date of dateSeries(HIGHLIGHTLY_PREP_FROM, HIGHLIGHTLY_PREP_TO)) {
        if (!canSpend()) {
          report.warnings.push('Import přípravy skončil předčasně kvůli bezpečné rezervě požadavků.');
          break;
        }
        const page = await fetchHighlightlyMatches({
          date,
          leagueId: configuredLeagueId > 0 ? configuredLeagueId : undefined,
          limit: 100,
        });
        absorb(page);
        matches.push(...page.data);
        if (page.totalCount > page.data.length && canSpend()) {
          const second = await fetchHighlightlyMatches({
            date,
            leagueId: configuredLeagueId > 0 ? configuredLeagueId : undefined,
            limit: 100,
            offset: 100,
          });
          absorb(second);
          matches.push(...second.data);
        }
      }
      report.prep.fetched = matches.length;
      const selected = Array.from(new Map(matches
        .filter((match) => (configuredLeagueId > 0 || /friend/i.test(match.league.name))
          && (isChanceTeam(match.home.name) || isChanceTeam(match.away.name)))
        .map((match) => [match.id, match])).values());
      report.prep.selected = selected.length;
      const friendlyNames = [...new Set(selected.map((match) => match.league.name).filter(Boolean))];
      report.prep.league = friendlyNames.join(', ') || null;
      if (selected.length === 0) {
        report.warnings.push(
          `Highlightly: v období ${HIGHLIGHTLY_PREP_FROM} až ${HIGHLIGHTLY_PREP_TO} nebyl nalezen žádný přátelský zápas ligového klubu. `
          + `Celkem bylo načteno ${matches.length} zápasů.`,
        );
      }

      const { data: existingPrep } = await args.supabase
        .from('matches')
        .select('id, external_api_id, detail')
        .eq('season_id', args.seasonId)
        .eq('source_league', 'highlightly.friendlies');
      const byId = new Map(((existingPrep as { id: number; external_api_id: number | null; detail: MatchDetail | null }[]) ?? [])
        .filter((row) => row.external_api_id != null)
        .map((row) => [row.external_api_id as number, row]));
      for (const match of selected) {
        const fixture = highlightlyToFixture(match, 'highlightly.friendlies', 0, 'Příprava');
        const existing = byId.get(match.id);
        const detail = mergeDetail(existing?.detail, {
          _highlightly: {
            id: match.id, leagueId: match.league.id,
            homeLogo: match.home.logo, awayLogo: match.away.logo,
            listFetchedAt: args.now.toISOString(),
          },
        });
        const payload = {
          season_id: args.seasonId, external_api_id: fixture.external_api_id,
          source_league: fixture.source_league, round: 0, round_label: 'Příprava',
          kickoff: fixture.kickoff, home_team: fixture.home_team, away_team: fixture.away_team,
          home_score: fixture.home_score, away_score: fixture.away_score, status: fixture.status,
          minute: fixture.minute, clock: fixture.clock, duration: fixture.duration,
          extra_home: null, extra_away: null, pen_home: fixture.pen_home, pen_away: fixture.pen_away,
          selection_reason: 'preparation', detail,
        };
        if (existing) {
          const { error } = await args.supabase.from('matches').update(payload).eq('id', existing.id);
          if (error) report.warnings.push(`Příprava update ${existing.id}: ${error.message}`);
          else report.prep.updated++;
        } else {
          const { error } = await args.supabase.from('matches').insert(payload);
          if (error) report.warnings.push(`Příprava insert ${match.id}: ${error.message}`);
          else report.prep.inserted++;
        }
      }
    } catch (error) {
      report.warnings.push(`Highlightly příprava: ${String(error)}`);
    }
  }

  // Live seznam se dotazuje jedním requestem za celý hrací den. Počet souběžných
  // zápasů tedy nezvyšuje cenu základního pollingu.
  try {
    const today = pragueYmd(args.now);
    const utcAnchor = new Date(`${today}T00:00:00.000Z`).getTime();
    const { data: dayData, error } = await args.supabase
      .from('matches')
      .select('id, external_api_id, source_league, round, round_label, kickoff, home_team, away_team, home_score, away_score, status, minute, clock, duration, extra_home, extra_away, pen_home, pen_away, selection_reason, detail, updated_at')
      .eq('season_id', args.seasonId)
      // Širší UTC okno bezpečně pokryje český zimní i letní čas; přesný den
      // následně ověříme přes Europe/Prague.
      .gte('kickoff', new Date(utcAnchor - 3 * 3600_000).toISOString())
      .lt('kickoff', new Date(utcAnchor + 27 * 3600_000).toISOString())
      .in('source_league', ['cze.1', 'highlightly.friendlies']);
    if (error) throw error;
    const dayRows = ((dayData as ExistingMatch[]) ?? []).filter((row) => pragueYmd(row.kickoff) === today);
    report.live.date = today;
    report.live.due = shouldPollHighlightly(dayRows, args.now.getTime(), pollMinutes, args.force);
    if (!report.live.due || !canSpend()) return report;

    // Throttle zapíšeme ještě před voláním API. I při 404/500 nebo nulovém
    // pokrytí tak další minutový cron nevyčerpá denní kvótu opakováním chyby.
    for (const row of dayRows) {
      const meta = hlMeta(row.detail);
      const throttled = mergeDetail(row.detail, {
        _highlightly: {
          ...(meta ?? { id: 0 }),
          listFetchedAt: args.now.toISOString(),
        },
      });
      await args.supabase.from('matches').update({ detail: throttled }).eq('id', row.id);
      row.detail = throttled;
    }

    const regular = dayRows.some((row) => row.source_league === 'cze.1');
    let leagueId = dayRows.map((row) => hlMeta(row.detail)?.leagueId).find((id): id is number => Number.isFinite(id) && (id ?? 0) > 0) ?? null;
    let leagueName = regular ? (process.env.HIGHLIGHTLY_CHANCE_LEAGUE_NAME ?? 'Chance Liga') : (process.env.HIGHLIGHTLY_FRIENDLY_LEAGUE_NAME ?? 'Club Friendlies');
    if (regular && !leagueId && canSpend()) {
      const configured = Number(process.env.HIGHLIGHTLY_CHANCE_LEAGUE_ID ?? 0);
      if (configured > 0) leagueId = configured;
      else {
        const leagues = await fetchHighlightlyLeagues({ countryCode: 'CZ', season: 2026, limit: 100 });
        absorb(leagues);
        const best = bestChanceLeague(leagues.data);
        if (best) { leagueId = best.id; leagueName = best.name; }
      }
    }
    if (!regular && !leagueId) {
      const configured = Number(process.env.HIGHLIGHTLY_FRIENDLY_LEAGUE_ID ?? 0);
      if (configured > 0) leagueId = configured;
    }
    report.live.league = leagueName;
    if (leagueId) {
      for (const row of dayRows) {
        const detail = mergeDetail(row.detail, {
          _highlightly: { ...(hlMeta(row.detail) ?? { id: 0 }), leagueId, listFetchedAt: args.now.toISOString() },
        });
        await args.supabase.from('matches').update({ detail }).eq('id', row.id);
        row.detail = detail;
      }
    }
    const page = await fetchHighlightlyMatches({
      date: today, leagueId: leagueId ?? undefined,
      leagueName: leagueId ? undefined : leagueName,
      countryCode: regular && !leagueId ? 'CZ' : undefined,
      season: regular ? 2026 : undefined,
      limit: 100,
    });
    absorb(page);
    const apiMatches = [...page.data];
    if (page.totalCount > apiMatches.length && canSpend()) {
      const second = await fetchHighlightlyMatches({
        date: today, leagueId: leagueId ?? undefined,
        leagueName: leagueId ? undefined : leagueName,
        countryCode: regular && !leagueId ? 'CZ' : undefined,
        season: regular ? 2026 : undefined,
        limit: 100, offset: 100,
      });
      absorb(second);
      apiMatches.push(...second.data);
    }
    report.live.fetched = apiMatches.length;
    const apiByPair = new Map(apiMatches.map((match) => [hlPair(match.home.name, match.away.name), match]));
    const apiById = new Map(apiMatches.map((match) => [match.id, match]));

    const matchedRows: Array<{ row: ExistingMatch; match: HighlightlyMatch }> = [];
    for (const row of dayRows) {
      const meta = hlMeta(row.detail);
      const match = (meta ? apiById.get(meta.id) : null) ?? apiByPair.get(hlPair(row.home_team, row.away_team));
      if (match) matchedRows.push({ row, match });
    }
    report.live.matched = matchedRows.length;
    const activeCount = matchedRows.filter(({ match }) => match.status === 'live').length;

    for (const { row, match } of matchedRows) {
      let detail = mergeDetail(row.detail, {
        _highlightly: {
          ...(hlMeta(row.detail) ?? { id: match.id }), id: match.id,
          leagueId: match.league.id || leagueId,
          homeLogo: match.home.logo, awayLogo: match.away.logo,
          listFetchedAt: args.now.toISOString(),
        },
      });
      let detailRequests = 0;
      const meta = detail._highlightly!;
      const kickoffMs = new Date(row.kickoff).getTime();
      const nowMs = args.now.getTime();
      const lineupWindow = nowMs >= kickoffMs - 60 * 60_000 && nowMs <= kickoffMs + 3 * 3600_000;
      if (lineupWindow && !meta.lineupsFetchedAt && canSpend(1) && (report.remaining == null || report.remaining > 40)) {
        try {
          const result = await fetchHighlightlyLineups(match.id, row.home_team, row.away_team);
          absorb(result); detailRequests += result.requests;
          detail = mergeDetail(detail, { lineups: result.lineups ?? detail.lineups, _highlightly: { ...meta, lineupsFetchedAt: args.now.toISOString() } });
        } catch (detailError) {
          detail = mergeDetail(detail, { _highlightly: { ...detail._highlightly!, lineupsFetchedAt: args.now.toISOString() } });
          report.warnings.push(`Sestavy ${row.home_team}–${row.away_team}: ${String(detailError)}`);
        }
      }

      const currentMeta = detail._highlightly!;
      const isHalf = match.status === 'live' && (/half.?time/i.test(match.stateDescription) || (match.minute != null && match.minute >= 45 && match.minute <= 60));
      const isFinal = match.status === 'finished';
      const detailMilestone = isFinal ? 'final' : isHalf ? 'halftime' : null;
      const already = detailMilestone === 'final' ? currentMeta.finalDetailsAt : detailMilestone === 'halftime' ? currentMeta.halftimeDetailsAt : null;
      if (detailMilestone && !already && canSpend(2)) {
        try {
          const events = await fetchHighlightlyEvents(match.id, row.home_team, row.away_team);
          absorb(events); detailRequests += events.requests;
          detail = mergeDetail(detail, {
            goals: events.goals?.length ? events.goals : detail.goals,
            cards: events.cards?.length ? events.cards : detail.cards,
            substitutions: events.substitutions?.length ? events.substitutions : detail.substitutions,
            _highlightly: { ...detail._highlightly!, eventsFetchedAt: args.now.toISOString() },
          });
        } catch (detailError) {
          detail = mergeDetail(detail, { _highlightly: { ...detail._highlightly!, eventsFetchedAt: args.now.toISOString() } });
          report.warnings.push(`Události ${row.home_team}–${row.away_team}: ${String(detailError)}`);
        }
        if (canSpend()) {
          try {
            const stats = await fetchHighlightlyStatistics(match.id, row.home_team, row.away_team);
            absorb(stats); detailRequests += stats.requests;
            detail = mergeDetail(detail, {
              stats: stats.stats ?? detail.stats,
              _highlightly: { ...detail._highlightly!, statsFetchedAt: args.now.toISOString() },
            });
          } catch (detailError) {
            detail = mergeDetail(detail, { _highlightly: { ...detail._highlightly!, statsFetchedAt: args.now.toISOString() } });
            report.warnings.push(`Statistiky ${row.home_team}–${row.away_team}: ${String(detailError)}`);
          }
        }
        detail = mergeDetail(detail, {
          _highlightly: {
            ...detail._highlightly!,
            ...(detailMilestone === 'final' ? { finalDetailsAt: args.now.toISOString() } : { halftimeDetailsAt: args.now.toISOString() }),
          },
        });
      } else if (
        match.status === 'live'
        && activeCount <= 4
        && canSpend()
        && (args.force || report.remaining == null || report.remaining > 60)
      ) {
        // Při nejvýše čtyřech současných zápasech doplníme průběh i mezi poločasy,
        // nejvýše jednou za 40 minut. Explicitní highlightly_force=1 tento interval
        // obejde, aby šlo okamžitě ověřit a opravit nesoulad hlavního skóre s góly.
        const lastEvents = currentMeta.eventsFetchedAt ? new Date(currentMeta.eventsFetchedAt).getTime() : 0;
        if (args.force || nowMs - lastEvents >= 40 * 60_000) {
          try {
            const events = await fetchHighlightlyEvents(match.id, row.home_team, row.away_team);
            absorb(events); detailRequests += events.requests;
            detail = mergeDetail(detail, {
              goals: events.goals?.length ? events.goals : detail.goals,
              cards: events.cards?.length ? events.cards : detail.cards,
              substitutions: events.substitutions?.length ? events.substitutions : detail.substitutions,
              _highlightly: { ...detail._highlightly!, eventsFetchedAt: args.now.toISOString() },
            });
          } catch (detailError) {
            detail = mergeDetail(detail, { _highlightly: { ...detail._highlightly!, eventsFetchedAt: args.now.toISOString() } });
            report.warnings.push(`Průběh ${row.home_team}–${row.away_team}: ${String(detailError)}`);
          }
        }
      }

      const stableStatus = row.status === 'finished' && match.status !== 'finished' ? 'finished' : match.status;
      const reconciledScore = reconcileHighlightlyScore(match, detail);
      if (reconciledScore.corrected) {
        report.live.scoreCorrections++;
        report.warnings.push(
          `Highlightly: opraveno přiřazení skóre ${row.home_team}–${row.away_team} `
          + `${match.homeScore ?? '?'}:${match.awayScore ?? '?'} → `
          + `${reconciledScore.home ?? '?'}:${reconciledScore.away ?? '?'} podle gólových událostí.`,
        );
      }
      const payload = {
        home_score: reconciledScore.home ?? row.home_score,
        away_score: reconciledScore.away ?? row.away_score,
        status: stableStatus,
        minute: stableStatus === 'live' ? match.minute : null,
        clock: stableStatus === 'live' ? match.clock : null,
        duration: match.duration ?? row.duration,
        pen_home: match.penHome ?? row.pen_home,
        pen_away: match.penAway ?? row.pen_away,
        detail,
      };
      const { error: updateError } = await args.supabase.from('matches').update(payload).eq('id', row.id);
      if (updateError) report.warnings.push(`Live update ${row.id}: ${updateError.message}`);
      else { report.live.updated++; report.live.details += detailRequests; }
    }
  } catch (error) {
    report.warnings.push(`Highlightly live: ${String(error)}`);
  }
  return report;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const keys = parseKeys(req.nextUrl.searchParams.get('competition'));
  const full = req.nextUrl.searchParams.get('full') === '1';
  const repairRequested = req.nextUrl.searchParams.get('repair') === '1';
  const highlightlyBootstrap = req.nextUrl.searchParams.get('highlightly_bootstrap') === '1';
  const highlightlyForce = req.nextUrl.searchParams.get('highlightly_force') === '1';
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
        'id, external_api_id, source_league, round, round_label, kickoff, home_team, away_team, home_score, away_score, status, minute, clock, duration, extra_home, extra_away, pen_home, pen_away, selection_reason, detail, updated_at',
      )
      .eq('season_id', season.id);

    if (existingError) {
      results[key] = { ok: false, error: existingError.message };
      continue;
    }

    const existingRows = ((existingData as ExistingMatch[]) ?? []);
    const officialRows = key === 'liga' ? existingRows.filter((match) => match.source_league === 'cze.1') : existingRows;
    const bootstrap = officialRows.length === 0;
    const seasonStartMs = Date.UTC(Number(season.api_season ?? 2026), 6, 1);
    const firstRoundRows = officialRows.filter((match) => match.round === 1);
    const firstRoundTeams = new Set(firstRoundRows.flatMap((match) => [match.home_team, match.away_team]));
    const sourceRepairNeeded = repairRequested
      || (key === 'liga' && existingRows.length > 0 && (
        officialRows.length !== 240
        || firstRoundRows.length !== 8
        || firstRoundTeams.size !== 16
      ))
      || (key === 'evropa' && existingRows.some(
        (match) => new Date(match.kickoff).getTime() < seasonStartMs
          || !String(match.round_label ?? '').startsWith('Evropský týden ')
          // Starší filtr zaměnil irský Bohemian FC za české Bohemians 1905.
          // Přítomnost takového řádku vynutí jednorázovou plnou opravu.
          || (match.source_league?.startsWith('uefa.')
            && (match.home_team === 'Bohemians' || match.away_team === 'Bohemians')),
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
      if (!competition.espnSlugs.includes(m.source_league ?? '')) return false;
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
          .map((m) => ({
            ...m,
            selection_reason: selectionReason(
              m.home_team,
              m.away_team,
              m.source_league,
              m.home_source_name,
              m.away_source_name,
            ),
          }))
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

    const highlightly = key === 'liga'
      ? await syncHighlightlyLiga({
          supabase, seasonId: season.id, now,
          bootstrapPrep: highlightlyBootstrap, force: highlightlyForce,
        })
      : null;
    if (highlightly) {
      inserted += highlightly.prep.inserted;
      updated += highlightly.prep.updated + highlightly.live.updated;
      warnings.push(...highlightly.warnings.map((error) => ({ source: 'highlightly', error })));
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
      idle: mode === 'idle' && !highlightlyBootstrap && !(highlightly?.live.due ?? false),
      source: key === 'liga'
        ? (highlightly?.configured ? 'chanceliga-official-validated+highlightly' : 'chanceliga-official-validated')
        : 'espn-public',
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
      highlightly,
      roasts,
      sourceErrors,
      warnings,
    };
  }

  const overallOk = keys.every((key) => (results[key] as { ok?: boolean } | undefined)?.ok !== false);
  return NextResponse.json({ ok: overallOk, results, at: new Date().toISOString() });
}
