import { NextRequest, NextResponse } from 'next/server';
import { toCz } from '@/lib/apiFootball';
import { fetchEspnResults, fetchEspnStats, pairKey } from '@/lib/espn';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';
const SCOREBOARD = `${BASE}/scoreboard?dates=20260611-20260720&limit=300`;

/**
 * Diagnostika ESPN statistik.
 *   GET /api/espn-debug?key=CRON_SECRET&q=mexiko
 *   GET /api/espn-debug?key=CRON_SECRET&event=<espnEventId>
 *
 * Vrátí syrové názvy/labely statistik ze scoreboardu i summary a to, co z nich
 * současný parser vytáhne – ať je vidět, kde je nesoulad v mapování.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const key = p.get('key');
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized – přidej ?key=CRON_SECRET' }, { status: 401 });
  }
  const q = (p.get('q') ?? '').toLowerCase().trim();
  const eventParam = p.get('event');
  if (!q && !eventParam) {
    return NextResponse.json({ error: 'zadej ?q=<část názvu týmu> nebo ?event=<id>' }, { status: 400 });
  }

  interface Competitor {
    homeAway?: string;
    score?: string;
    statistics?: { name?: string; displayValue?: string; label?: string }[];
    team?: { id?: string; name?: string; displayName?: string };
  }
  interface Ev {
    id?: string;
    competitions?: { competitors?: Competitor[] }[];
  }

  let sb: { events?: Ev[] };
  try {
    const r = await fetch(SCOREBOARD, { cache: 'no-store' });
    if (!r.ok) return NextResponse.json({ error: `ESPN scoreboard HTTP ${r.status}` }, { status: 502 });
    sb = (await r.json()) as { events?: Ev[] };
  } catch (e) {
    return NextResponse.json({ error: `scoreboard fetch failed: ${String(e)}` }, { status: 502 });
  }

  const events = sb.events ?? [];
  const ev = events.find((e) => {
    if (eventParam) return e.id === eventParam;
    const c = e.competitions?.[0];
    const h = c?.competitors?.find((x) => x.homeAway === 'home')?.team;
    const a = c?.competitors?.find((x) => x.homeAway === 'away')?.team;
    const names = [h?.name, h?.displayName, a?.name, a?.displayName, toCz(h?.name ?? ''), toCz(a?.name ?? '')]
      .map((s) => (s ?? '').toLowerCase());
    return names.some((n) => n.includes(q));
  });

  if (!ev) {
    const list = events.slice(0, 30).map((e) => {
      const c = e.competitions?.[0];
      const h = c?.competitors?.find((x) => x.homeAway === 'home')?.team;
      const a = c?.competitors?.find((x) => x.homeAway === 'away')?.team;
      return { id: e.id, home: h?.displayName, away: a?.displayName };
    });
    return NextResponse.json({ error: 'zápas nenalezen', tip: 'zkus jinou část názvu (anglicky i česky)', sample: list });
  }

  const comp = ev.competitions?.[0];
  const home = comp?.competitors?.find((x) => x.homeAway === 'home');
  const away = comp?.competitors?.find((x) => x.homeAway === 'away');
  const rawStats = (c?: Competitor) => (c?.statistics ?? []).map((s) => ({ name: s.name, label: s.label, value: s.displayValue }));

  // ── syrové statistiky ze summary/boxscore ──
  let summary: unknown = null;
  try {
    const r = await fetch(`${BASE}/summary?event=${ev.id}`, { cache: 'no-store' });
    if (r.ok) {
      const s = (await r.json()) as {
        boxscore?: { teams?: { team?: { id?: string }; statistics?: { name?: string; label?: string; displayValue?: string }[] }[] };
      };
      const teams = s?.boxscore?.teams ?? [];
      summary = {
        topLevelKeys: Object.keys(s ?? {}),
        boxscoreTeamCount: teams.length,
        teams: teams.map((t) => ({
          teamId: t?.team?.id,
          stats: (t?.statistics ?? []).map((x) => ({ name: x.name, label: x.label, value: x.displayValue })),
        })),
      };
    } else {
      summary = { error: `summary HTTP ${r.status}` };
    }
  } catch (e) {
    summary = { error: `summary fetch failed: ${String(e)}` };
  }

  // ── co z toho vytáhne SOUČASNÝ parser ──
  let parserScoreboard: unknown = null;
  let parserSummary: unknown = null;
  try {
    const map = await fetchEspnResults();
    parserScoreboard =
      map.get(pairKey(toCz(home?.team?.name ?? ''), toCz(away?.team?.name ?? '')))?.detail?.stats ?? null;
    if (home?.team?.id && away?.team?.id && ev.id) {
      parserSummary = await fetchEspnStats(ev.id, home.team.id, away.team.id);
    }
  } catch (e) {
    parserScoreboard = { error: String(e) };
  }

  return NextResponse.json({
    event: {
      id: ev.id,
      home: home?.team?.displayName,
      away: away?.team?.displayName,
      homeCz: toCz(home?.team?.name ?? ''),
      awayCz: toCz(away?.team?.name ?? ''),
      homeId: home?.team?.id,
      awayId: away?.team?.id,
      score: `${home?.score ?? '?'}:${away?.score ?? '?'}`,
    },
    hint: 'Podívej se na názvy/labely níže. Pošli mi je a napevno opravím mapování statistik.',
    scoreboard_raw: { home: rawStats(home), away: rawStats(away) },
    summary_raw: summary,
    parser_output: { scoreboard: parserScoreboard, summary: parserSummary },
  });
}
