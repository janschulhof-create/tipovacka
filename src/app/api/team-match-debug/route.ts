import { NextRequest, NextResponse } from 'next/server';
import { canonTeam, isSameFixture, isSameTeam, normalizeTeamName } from '@/lib/teamAliases';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Diagnostika párování týmů a zápasů.
 *
 * Účel: až se příště nespáruje živý zápas, nemá se hledat metodou pokus–omyl.
 * Endpoint ukáže, jak se název normalizuje, na jakou kanonickou identitu
 * se mapuje a proč konkrétní pár sedí či nesedí.
 *
 * BEZPEČNOST:
 *   • chráněno `Authorization: Bearer <AI_HEALTH_SECRET>`; bez něj vrací 404,
 *   • pouze čtení, žádný zápis do databáze ani volání poskytovatele,
 *   • nevrací tajemství, tokeny ani osobní údaje – jen názvy týmů ze vstupu.
 *
 * Použití:
 *   POST /api/team-match-debug
 *   { "appHome": "1.FC Slovácko", "appAway": "FC Artis Brno",
 *     "providerHome": "Slovacko", "providerAway": "SK Lisen" }
 */
export async function POST(req: NextRequest) {
  const secret = process.env.AI_HEALTH_SECRET;
  const header = req.headers.get('authorization');
  if (!secret || header !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 404 });
  }

  let telo: Record<string, unknown>;
  try {
    telo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Očekávám JSON tělo.' }, { status: 400 });
  }

  const text = (klic: string): string => (typeof telo[klic] === 'string' ? (telo[klic] as string) : '');

  const appHome = text('appHome');
  const appAway = text('appAway');
  const providerHome = text('providerHome');
  const providerAway = text('providerAway');

  if (!appHome || !appAway) {
    return NextResponse.json({ error: 'Chybí appHome nebo appAway.' }, { status: 400 });
  }

  const rozbor = (nazev: string) => {
    const { key, reserve } = normalizeTeamName(nazev);
    return { input: nazev, normalized: key, reserve, canonical: canonTeam(nazev) };
  };

  const app = { home: rozbor(appHome), away: rozbor(appAway) };

  // Bez protistrany jen ukážeme, jak se naše názvy normalizují.
  if (!providerHome || !providerAway) {
    return NextResponse.json({ app, hint: 'Pro porovnání doplň providerHome a providerAway.' });
  }

  const provider = { home: rozbor(providerHome), away: rozbor(providerAway) };
  const homeOk = isSameTeam(appHome, providerHome);
  const awayOk = isSameTeam(appAway, providerAway);
  const matched = isSameFixture(
    { home: appHome, away: appAway },
    { home: providerHome, away: providerAway },
  );

  // Kontrola obrácené orientace – pomáhá odhalit prohozené strany u zdroje.
  const reversed = isSameFixture(
    { home: appHome, away: appAway },
    { home: providerAway, away: providerHome },
  );

  const matchingReason = matched
    ? 'both_teams_matched'
    : reversed
      ? 'reversed_orientation'
      : homeOk
        ? 'away_team_mismatch'
        : awayOk
          ? 'home_team_mismatch'
          : 'no_team_matched';

  return NextResponse.json({
    app,
    provider,
    homeMatched: homeOk,
    awayMatched: awayOk,
    matched,
    reversedOrientation: reversed,
    matchingReason,
  });
}
