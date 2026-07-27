import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Veřejný, ale bezpečný spouštěč live synchronizace.
 * API klíče ani CRON_SECRET se neposílají do prohlížeče. Vlastní sync má
 * databázový throttle, takže opakované otevření stránky nevyčerpá kvótu.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET není nastaven.' }, { status: 503 });
  }

  const target = new URL('/api/sync-football', req.nextUrl.origin);
  target.searchParams.set('competition', 'liga');

  try {
    const response = await fetch(target, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${secret}` },
    });
    const text = await response.text();
    let payload: unknown = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text.slice(0, 1000) }; }
    return NextResponse.json({ ok: response.ok, status: response.status, payload }, {
      status: response.ok ? 200 : response.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 502 });
  }
}
