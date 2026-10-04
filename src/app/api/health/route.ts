import { NextResponse } from 'next/server';
import { buildHealthPayload } from '@/lib/health';

/**
 * Levná kontrola dostupnosti pro externí monitor (Sentry Uptime).
 *
 * Žádná databáze, žádný poskytovatel, žádné AI, žádný zámek. Viz `lib/health.ts`.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    buildHealthPayload(process.env as Record<string, string | undefined>, new Date()),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
