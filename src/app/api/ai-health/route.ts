import { NextRequest, NextResponse } from 'next/server';
import { generateAnthropicText, getRoastModel, getTimeoutMs } from '@/lib/anthropicText';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Diagnostika dostupnosti Claude API.
 *
 * Provede minimální levný požadavek a vrátí BEZPEČNOU kategorii výsledku.
 * Nikdy nevrací API klíč, prompt, ani celý payload od poskytovatele.
 *
 * Ochrana: `Authorization: Bearer <AI_HEALTH_SECRET>`.
 * Když secret není nastavený nebo nesouhlasí, vrací 404 bez detailů —
 * endpoint tak z venku nejde ani odhalit.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.AI_HEALTH_SECRET;
  const header = req.headers.get('authorization');

  if (!secret || header !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 404 });
  }

  const configured = Boolean(process.env.ANTHROPIC_API_KEY);
  const model = getRoastModel();

  // Nejlevnější možný test: krátká přesná odpověď.
  const vysledek = await generateAnthropicText('Odpověz přesně: OK', 8);

  if (vysledek.ok) {
    return NextResponse.json({
      configured,
      model,
      timeoutMs: getTimeoutMs(),
      reachable: true,
      durationMs: vysledek.durationMs,
      requestId: vysledek.requestId,
      attempts: vysledek.attempts,
      stopReason: vysledek.stopReason,
    });
  }

  return NextResponse.json({
    configured,
    model,
    timeoutMs: getTimeoutMs(),
    reachable: false,
    reason: vysledek.reason,
    httpStatus: vysledek.httpStatus,
    providerType: vysledek.providerType,
    requestId: vysledek.requestId,
    durationMs: vysledek.durationMs,
    attempts: vysledek.attempts,
  });
}
