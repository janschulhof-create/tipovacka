import { NextRequest, NextResponse } from 'next/server';
import {
  fetchHighlightlyLeagues,
  fetchHighlightlyMatches,
  fetchOfficialLeagueFixtures,
  highlightlyConfigured,
} from '@/lib/espnCompetition';
import { canonTeam } from '@/lib/teamAliases';

export const dynamic = 'force-dynamic';

const CHANCE_TEAMS = new Set([
  'Sparta', 'Slavia', 'Baník', 'Plzeň', 'Liberec', 'Zlín', 'Teplice', 'Bohemians',
  'Zbrojovka Brno', 'Slovácko', 'Jablonec', 'Olomouc', 'Hradec Králové', 'Pardubice',
  'Artis Brno', 'Boleslav',
]);

function isChanceTeam(name: string): boolean {
  return CHANCE_TEAMS.has(canonTeam(name));
}

/** Read-only diagnostika oficiálního rozpisu, ESPN Evropy a Highlightly. */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('key') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const source = req.nextUrl.searchParams.get('source') ?? 'cze.1';
  if (source === 'highlightly') {
    if (!highlightlyConfigured()) {
      return NextResponse.json({
        ok: false,
        source,
        error: 'Chybí HIGHLIGHTLY_API_KEY ve Vercelu.',
      });
    }
    const mode = req.nextUrl.searchParams.get('mode') ?? 'leagues';
    try {
      if (mode === 'leagues') {
        const country = req.nextUrl.searchParams.get('country');
        const result = await fetchHighlightlyLeagues({
          countryCode: country == null ? 'CZ' : country || undefined,
          leagueName: req.nextUrl.searchParams.get('name') ?? undefined,
          season: Number(req.nextUrl.searchParams.get('season') ?? 2026),
          limit: 100,
        });
        return NextResponse.json({
          ok: true,
          source,
          mode,
          requests: result.requests,
          requestsRemaining: result.remaining,
          requestsLimit: result.limit,
          fetched: result.data.length,
          leagues: result.data,
        });
      }

      const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
      const leagueId = Number(req.nextUrl.searchParams.get('leagueId') ?? 0);
      const friendly = mode === 'friendlies';
      const first = await fetchHighlightlyMatches({
        date,
        leagueId: leagueId > 0 ? leagueId : undefined,
        leagueName: friendly || leagueId > 0
          ? undefined
          : req.nextUrl.searchParams.get('name')
            ?? process.env.HIGHLIGHTLY_CHANCE_LEAGUE_NAME
            ?? 'Czech Liga',
        countryCode: friendly || leagueId > 0 ? undefined : 'CZ',
        season: friendly ? undefined : 2026,
        limit: 100,
      });
      const all = [...first.data];
      let requests = first.requests;
      let remaining = first.remaining;
      let limit = first.limit;
      if (first.totalCount > all.length) {
        const second = await fetchHighlightlyMatches({
          date,
          leagueId: leagueId > 0 ? leagueId : undefined,
          leagueName: friendly || leagueId > 0
            ? undefined
            : req.nextUrl.searchParams.get('name')
              ?? process.env.HIGHLIGHTLY_CHANCE_LEAGUE_NAME
              ?? 'Czech Liga',
          countryCode: friendly || leagueId > 0 ? undefined : 'CZ',
          season: friendly ? undefined : 2026,
          limit: 100,
          offset: 100,
        });
        all.push(...second.data);
        requests += second.requests;
        remaining = second.remaining;
        limit = second.limit;
      }

      const selected = friendly
        ? all.filter((match) => /friend/i.test(match.league.name)
          && (isChanceTeam(match.home.name) || isChanceTeam(match.away.name)))
        : all;
      return NextResponse.json({
        ok: true,
        source,
        mode,
        date,
        requests,
        requestsRemaining: remaining,
        requestsLimit: limit,
        totalCount: first.totalCount,
        rawFetched: all.length,
        fetched: selected.length,
        friendlyLeagues: friendly
          ? [...new Set(selected.map((match) => `${match.league.name} (${match.league.id})`))]
          : undefined,
        sample: selected.slice(0, 20),
      });
    } catch (error) {
      return NextResponse.json({ ok: false, source, mode, error: String(error) });
    }
  }

  const allowed = new Set([
    'cze.1',
    'uefa.champions_qual', 'uefa.champions',
    'uefa.europa_qual', 'uefa.europa',
    'uefa.europa.conf_qual', 'uefa.europa.conf',
  ]);
  if (!allowed.has(source)) {
    return NextResponse.json({ ok: false, error: 'unsupported source', allowed: [...allowed, 'highlightly'] });
  }

  try {
    const result = await fetchOfficialLeagueFixtures(source, 2026);
    return NextResponse.json({
      ok: result.fixtures.length > 0,
      source,
      requests: result.requests,
      fetched: result.fixtures.length,
      sample: result.fixtures.slice(0, 10),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, source, error: String(error) });
  }
}
