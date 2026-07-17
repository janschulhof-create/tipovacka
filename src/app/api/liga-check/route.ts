import { NextRequest, NextResponse } from 'next/server';
import {
  fetchHighlightlyLeagues,
  fetchHighlightlyMatches,
  fetchOfficialLeagueFixtures,
  highlightlyConfigured,
} from '@/lib/espnCompetition';

export const dynamic = 'force-dynamic';

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
        const result = await fetchHighlightlyLeagues({
          countryCode: req.nextUrl.searchParams.get('country') ?? 'CZ',
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
      const result = await fetchHighlightlyMatches({
        date,
        leagueId: leagueId > 0 ? leagueId : undefined,
        leagueName: leagueId > 0
          ? undefined
          : req.nextUrl.searchParams.get('name')
            ?? (friendly ? process.env.HIGHLIGHTLY_FRIENDLY_LEAGUE_NAME ?? 'Club Friendlies' : process.env.HIGHLIGHTLY_CHANCE_LEAGUE_NAME ?? 'Chance Liga'),
        countryCode: friendly ? undefined : 'CZ',
        season: friendly ? undefined : 2026,
        limit: 100,
      });
      return NextResponse.json({
        ok: true,
        source,
        mode,
        date,
        requests: result.requests,
        requestsRemaining: result.remaining,
        requestsLimit: result.limit,
        totalCount: result.totalCount,
        fetched: result.data.length,
        sample: result.data.slice(0, 20),
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
