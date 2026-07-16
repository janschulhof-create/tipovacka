import { NextRequest, NextResponse } from 'next/server';
import { fetchOfficialLeagueFixtures } from '@/lib/espnCompetition';

export const dynamic = 'force-dynamic';

/** Read-only diagnostika oficiálního rozpisu Chance Ligy a ESPN Evropy. */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('key') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const source = req.nextUrl.searchParams.get('source') ?? 'cze.1';
  const allowed = new Set([
    'cze.1',
    'uefa.champions_qual', 'uefa.champions',
    'uefa.europa_qual', 'uefa.europa',
    'uefa.europa.conf_qual', 'uefa.europa.conf',
  ]);
  if (!allowed.has(source)) {
    return NextResponse.json({ ok: false, error: 'unsupported source', allowed: Array.from(allowed) });
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
