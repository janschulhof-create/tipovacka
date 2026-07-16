import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OVĚŘOVACÍ ENDPOINT pro přípravu Chance ligy (nic nemění, jen čte z ESPN).
 *
 * Účel: než ligu napojíme, ověřit NAŽIVO, že ESPN `cze.1`:
 *   1) vůbec vrací zápasy (rozpis + výsledky),
 *   2) v jakém jazyce chodí názvy týmů (kvůli mapování na naše názvy),
 *   3) jestli je u zápasu číslo kola / matchday (klíčové pro rozdělení do kol),
 *   4) jaké stavy a skóre chodí (kvůli živému updatu ve stejné frekvenci jako MS).
 *
 * Použití (po nasazení):
 *   /api/liga-check?key=CRON_SECRET
 *   /api/liga-check?key=CRON_SECRET&league=cze.1&dates=20260718-20260815
 *
 * Bezpečné: read-only, žádný zápis do DB, neběží v cronu.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get('key') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized – přidej ?key=CRON_SECRET' }, { status: 401 });
  }

  const league = p.get('league') ?? 'cze.1';
  // Výchozí okno: od dneška 7 dní zpět a 21 dní dopředu (zachytí i rozpis i výsledky).
  const dates = p.get('dates') ?? defaultWindow();
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${dates}&limit=300`;

  let raw: unknown;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ ok: false, url, httpStatus: res.status }, { status: 200 });
    }
    raw = await res.json();
  } catch (e) {
    return NextResponse.json({ ok: false, url, error: String(e) }, { status: 200 });
  }

  const data = raw as {
    events?: EspnEvent[];
    leagues?: { name?: string; abbreviation?: string; calendar?: unknown[] }[];
  };
  const events = data.events ?? [];

  // Sonda: kde se u ligy schovává číslo kola? Zkusíme víc možných míst.
  const roundProbe = (ev: EspnEvent) => ({
    'competitions[0].notes[0].headline': ev.competitions?.[0]?.notes?.[0]?.headline ?? null,
    'competitions[0].type.text': ev.competitions?.[0]?.type?.text ?? null,
    'season.slug': ev.season?.slug ?? null,
    'week.number': ev.week?.number ?? null,
    matchday: (ev as { matchday?: unknown }).matchday ?? null,
  });

  const matches = events.map((ev) => {
    const comp = ev.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c) => c.homeAway === 'away');
    return {
      date: ev.date,
      home: home?.team?.displayName ?? home?.team?.name ?? null,
      away: away?.team?.displayName ?? away?.team?.name ?? null,
      homeScore: home?.score ?? null,
      awayScore: away?.score ?? null,
      state: comp?.status?.type?.state ?? null, // pre | in | post
      detail: comp?.status?.type?.shortDetail ?? null,
      completed: comp?.status?.type?.completed ?? null,
      roundHints: roundProbe(ev),
    };
  });

  return NextResponse.json({
    ok: true,
    url,
    league: data.leagues?.[0]?.name ?? data.leagues?.[0]?.abbreviation ?? league,
    hasCalendar: Array.isArray(data.leagues?.[0]?.calendar) && (data.leagues![0].calendar!.length > 0),
    pocetZapasu: matches.length,
    // Rychlá kontrola: jazyk názvů týmů (kvůli mapování na naše české názvy)
    ukazkaTymu: matches.slice(0, 6).map((m) => `${m.home} – ${m.away}`),
    // Kde ESPN drží číslo kola (uvidíme, které pole je vyplněné)
    roundHintsPrvni: matches[0]?.roundHints ?? null,
    zapasy: matches,
  });
}

function defaultWindow(): string {
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const from = new Date(Date.now() - 7 * 864e5);
  const to = new Date(Date.now() + 21 * 864e5);
  return `${fmt(from)}-${fmt(to)}`;
}

interface EspnEvent {
  date?: string;
  season?: { slug?: string };
  week?: { number?: number };
  competitions?: {
    notes?: { headline?: string }[];
    type?: { text?: string };
    status?: { type?: { state?: string; shortDetail?: string; completed?: boolean } };
    competitors?: {
      homeAway?: string;
      score?: string;
      team?: { displayName?: string; name?: string };
    }[];
  }[];
}
