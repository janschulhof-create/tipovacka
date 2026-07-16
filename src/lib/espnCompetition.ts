import type { MatchStatus } from './types';
import { canonTeam } from './teamAliases';

export interface CompetitionFixture {
  external_api_id: number;
  source_league: string;
  source_label: string;
  round: number;
  round_label: string;
  kickoff: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
  minute: number | null;
  clock: string | null;
  duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  extra_home: number | null;
  extra_away: number | null;
  pen_home: number | null;
  pen_away: number | null;
}

export interface ApiFetchResult {
  fixtures: CompetitionFixture[];
  requests: number;
  remaining: number | null;
}

/**
 * SofaScore nemá veřejně garantované API, ale jeho web používá veřejné JSON
 * endpointy bez registrace a bez API klíče. Primárně voláme stejnou doménu jako
 * web a při blokaci zkusíme historickou API doménu.
 */
const SOFASCORE_BASES = [
  'https://www.sofascore.com/api/v1',
  'https://api.sofascore.com/api/v1',
] as const;

const SOURCE_LABELS: Record<string, string> = {
  'cze.1': 'Chance liga',
  'uefa.champions': 'Liga mistrů',
  'uefa.europa': 'Evropská liga',
  'uefa.europa.conf': 'Konferenční liga',
};

/** Stabilní SofaScore unique-tournament ID. */
const SOFASCORE_TOURNAMENT_IDS: Record<string, number> = {
  'cze.1': 172,
  'uefa.champions': 7,
  'uefa.europa': 679,
  'uefa.europa.conf': 17015,
};

const SOURCE_BY_TOURNAMENT_ID = new Map<number, string>(
  Object.entries(SOFASCORE_TOURNAMENT_IDS).map(([slug, id]) => [id, slug]),
);

export function sourceLabel(slug: string): string {
  return SOURCE_LABELS[slug] ?? slug;
}

export function sofascoreTournamentId(slug: string): number {
  const id = SOFASCORE_TOURNAMENT_IDS[slug];
  if (!id) throw new Error(`Neznámá SofaScore soutěž: ${slug}`);
  return id;
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function apiDateWindow(daysBack = 2, daysForward = 60): { from: string; to: string } {
  const now = new Date();
  return {
    from: ymd(new Date(now.getTime() - daysBack * 864e5)),
    to: ymd(new Date(now.getTime() + daysForward * 864e5)),
  };
}

interface SofaSeason {
  id?: number;
  name?: string;
  year?: string;
}

interface SofaTeam {
  name?: string;
  shortName?: string;
}

interface SofaScoreValue {
  current?: number | null;
  display?: number | null;
  normaltime?: number | null;
  overtime?: number | null;
  penalties?: number | null;
  period1?: number | null;
  period2?: number | null;
}

interface SofaEvent {
  id?: number;
  startTimestamp?: number;
  status?: {
    type?: string;
    description?: string;
    code?: number;
  };
  tournament?: {
    name?: string;
    uniqueTournament?: {
      id?: number;
      name?: string;
    };
  };
  season?: SofaSeason;
  roundInfo?: {
    round?: number;
    name?: string;
    slug?: string;
    cupRoundType?: number;
  };
  homeTeam?: SofaTeam;
  awayTeam?: SofaTeam;
  homeScore?: SofaScoreValue;
  awayScore?: SofaScoreValue;
  time?: {
    currentPeriodStartTimestamp?: number;
    injuryTime1?: number;
    injuryTime2?: number;
  };
  currentPeriodStartTimestamp?: number;
}

interface SofaEnvelope {
  seasons?: SofaSeason[];
  events?: SofaEvent[];
  event?: SofaEvent;
  hasNextPage?: boolean;
}

interface SofaResponse {
  data: SofaEnvelope | null;
  requests: number;
}

const BROWSER_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
  Referer: 'https://www.sofascore.com/',
  Origin: 'https://www.sofascore.com',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};

async function fetchWithTimeout(url: string, timeoutMs = 12_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: BROWSER_HEADERS,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Jeden veřejný SofaScore JSON požadavek. HTTP 404 je u prázdného seznamu
 * odehraných zápasů běžný stav, proto jej lze explicitně povolit.
 */
async function sofaGet(path: string, allow404 = false): Promise<SofaResponse> {
  const errors: string[] = [];
  let requests = 0;

  for (const base of SOFASCORE_BASES) {
    const url = `${base}${path}`;
    requests++;
    try {
      const response = await fetchWithTimeout(url);
      if (allow404 && response.status === 404) return { data: null, requests };
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        errors.push(`${new URL(base).host}: HTTP ${response.status}${body ? ` (${body.slice(0, 120)})` : ''}`);
        continue;
      }
      const data = (await response.json()) as SofaEnvelope;
      return { data, requests };
    } catch (error) {
      errors.push(`${new URL(base).host}: ${String(error)}`);
    }
  }

  throw new Error(`SofaScore se nepodařilo načíst (${path}): ${errors.join(' | ')}`);
}

function seasonTokens(startYear: number): string[] {
  const endYear = startYear + 1;
  const shortStart = String(startYear).slice(-2);
  const shortEnd = String(endYear).slice(-2);
  return [
    `${shortStart}/${shortEnd}`,
    `${startYear}/${endYear}`,
    `${startYear}-${endYear}`,
    `${startYear}/${shortEnd}`,
    `${startYear}-${shortEnd}`,
  ].map((s) => s.toLowerCase());
}

function pickSeason(seasons: SofaSeason[], startYear: number): SofaSeason | null {
  const tokens = seasonTokens(startYear);
  const exact = seasons.find((season) => {
    const haystack = `${season.year ?? ''} ${season.name ?? ''}`.toLowerCase();
    return tokens.some((token) => haystack.includes(token));
  });
  if (exact?.id) return exact;

  // Na začátku nové sezony může být označení v feedu mírně jiné. SofaScore
  // vrací nejnovější sezonu jako první; bereme tedy první platný záznam.
  return seasons.find((season) => Number.isFinite(season.id) && (season.id ?? 0) > 0) ?? null;
}

async function resolveSeasonId(sourceLeague: string, startYear: number): Promise<{ id: number; requests: number }> {
  const tournamentId = sofascoreTournamentId(sourceLeague);
  const { data, requests } = await sofaGet(`/unique-tournament/${tournamentId}/seasons`);
  const season = pickSeason(data?.seasons ?? [], startYear);
  if (!season?.id) {
    throw new Error(
      `SofaScore nevrátil sezonu ${startYear}/${startYear + 1} pro ${sourceLabel(sourceLeague)} (tournament ${tournamentId}).`,
    );
  }
  return { id: season.id, requests };
}

function mapStatus(type: string | undefined): MatchStatus {
  switch ((type ?? '').toLowerCase()) {
    case 'inprogress':
    case 'live':
      return 'live';
    case 'finished':
      return 'finished';
    case 'postponed':
      return 'postponed';
    case 'canceled':
    case 'cancelled':
    case 'abandoned':
    case 'interrupted':
    case 'suspended':
      return 'cancelled';
    default:
      return 'scheduled';
  }
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function durationOf(event: SofaEvent): CompetitionFixture['duration'] {
  const penHome = numeric(event.homeScore?.penalties);
  const penAway = numeric(event.awayScore?.penalties);
  if (penHome != null || penAway != null) return 'PENALTY_SHOOTOUT';

  const homeCurrent = numeric(event.homeScore?.current);
  const awayCurrent = numeric(event.awayScore?.current);
  const homeNormal = numeric(event.homeScore?.normaltime);
  const awayNormal = numeric(event.awayScore?.normaltime);
  const description = event.status?.description ?? '';

  if (
    /extra time|after extra time|prodlou/i.test(description) ||
    numeric(event.homeScore?.overtime) != null ||
    numeric(event.awayScore?.overtime) != null ||
    (homeNormal != null && homeCurrent != null && homeNormal !== homeCurrent) ||
    (awayNormal != null && awayCurrent != null && awayNormal !== awayCurrent)
  ) {
    return 'EXTRA_TIME';
  }
  return 'REGULAR';
}

function isoWeek(iso: string): { year: number; week: number } {
  const d = new Date(iso);
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const year = x.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((x.getTime() - start.getTime()) / 864e5) + 1) / 7);
  return { year, week };
}

function leagueRound(event: SofaEvent, kickoff: string): { round: number; label: string } {
  const n = numeric(event.roundInfo?.round);
  const name = (event.roundInfo?.name ?? '').trim();
  const combined = `${event.tournament?.name ?? ''} ${name}`;

  if (n != null && /(championship|title group|mistrov|nadstav)/i.test(combined)) {
    return { round: 30 + n, label: `Nadstavba o titul · ${n}. kolo` };
  }
  if (n != null && /(relegation|play.?out|záchran|sestup)/i.test(combined)) {
    return { round: 36 + n, label: `Nadstavba o záchranu · ${n}. kolo` };
  }
  if (n != null && /(play.?off|placement|umístění)/i.test(combined)) {
    return { round: 45 + n, label: `Play-off · ${n}. zápas` };
  }
  if (n != null) return { round: n, label: name || `${n}. kolo` };

  const wk = isoWeek(kickoff);
  return { round: wk.week, label: name || `Týden ${wk.week}/${wk.year}` };
}

function europeRound(sourceLeague: string, event: SofaEvent, kickoff: string): { round: number; label: string } {
  const wk = isoWeek(kickoff);
  const phase = (event.roundInfo?.name ?? event.tournament?.name ?? '').trim();
  return {
    round: wk.year * 100 + wk.week,
    label: `${sourceLabel(sourceLeague)} · ${phase || `týden ${wk.week}/${wk.year}`}`,
  };
}

function inferredSource(event: SofaEvent): string | null {
  const tournamentId = event.tournament?.uniqueTournament?.id;
  return tournamentId != null ? (SOURCE_BY_TOURNAMENT_ID.get(tournamentId) ?? null) : null;
}

function liveClock(event: SofaEvent, nowMs = Date.now()): { minute: number | null; clock: string | null } {
  if (mapStatus(event.status?.type) !== 'live') return { minute: null, clock: null };

  const description = (event.status?.description ?? '').trim();
  if (/half.?time|break|poločas/i.test(description)) return { minute: 45, clock: 'Poločas' };
  if (/penalt/i.test(description)) return { minute: 120, clock: 'Penalty' };
  if (/extra time|prodlou/i.test(description)) return { minute: null, clock: description || 'Prodloužení' };

  const periodStart = numeric(event.time?.currentPeriodStartTimestamp ?? event.currentPeriodStartTimestamp);
  if (periodStart == null) return { minute: null, clock: description || 'Živě' };

  const elapsedInPeriod = Math.max(0, Math.floor((nowMs / 1000 - periodStart) / 60) + 1);
  const secondHalf = /2nd|second|2\. poločas/i.test(description);
  const minute = Math.min(secondHalf ? 45 + elapsedInPeriod : elapsedInPeriod, 120);
  return { minute, clock: `${minute}'` };
}

function normalizeFixture(event: SofaEvent, forcedSource?: string): CompetitionFixture | null {
  const eventId = numeric(event.id);
  const timestamp = numeric(event.startTimestamp);
  const sourceLeague = forcedSource ?? inferredSource(event);
  if (eventId == null || timestamp == null || !sourceLeague) return null;

  const kickoff = new Date(timestamp * 1000).toISOString();
  const home = canonTeam(event.homeTeam?.name ?? event.homeTeam?.shortName ?? '');
  const away = canonTeam(event.awayTeam?.name ?? event.awayTeam?.shortName ?? '');
  if (!home || !away || /\bTBD\b|to be determined|winner of|loser of/i.test(`${home} ${away}`)) return null;

  const status = mapStatus(event.status?.type);
  const duration = durationOf(event);
  const round = sourceLeague === 'cze.1'
    ? leagueRound(event, kickoff)
    : europeRound(sourceLeague, event, kickoff);

  const normalHome = numeric(event.homeScore?.normaltime);
  const normalAway = numeric(event.awayScore?.normaltime);
  const currentHome = numeric(event.homeScore?.current ?? event.homeScore?.display);
  const currentAway = numeric(event.awayScore?.current ?? event.awayScore?.display);

  // Tipovačka vyhodnocuje stav po základní hrací době. U prodloužení/penalt
  // proto použijeme normaltime; konečný stav po prodloužení držíme zvlášť.
  const homeScore = status === 'scheduled'
    ? null
    : (normalHome ?? currentHome);
  const awayScore = status === 'scheduled'
    ? null
    : (normalAway ?? currentAway);
  const clock = liveClock(event);

  return {
    external_api_id: eventId,
    source_league: sourceLeague,
    source_label: sourceLabel(sourceLeague),
    round: round.round,
    round_label: round.label,
    kickoff,
    home_team: home,
    away_team: away,
    home_score: homeScore,
    away_score: awayScore,
    status,
    minute: clock.minute,
    clock: clock.clock,
    duration,
    extra_home: duration !== 'REGULAR' ? currentHome : null,
    extra_away: duration !== 'REGULAR' ? currentAway : null,
    pen_home: numeric(event.homeScore?.penalties),
    pen_away: numeric(event.awayScore?.penalties),
  };
}

async function fetchDirection(
  tournamentId: number,
  seasonId: number,
  direction: 'next' | 'last',
): Promise<{ events: SofaEvent[]; requests: number }> {
  const events: SofaEvent[] = [];
  let requests = 0;

  for (let page = 0; page < 40; page++) {
    const { data, requests: used } = await sofaGet(
      `/unique-tournament/${tournamentId}/season/${seasonId}/events/${direction}/${page}`,
      direction === 'last',
    );
    requests += used;
    if (!data) break;
    events.push(...(data.events ?? []));
    if (!data.hasNextPage) break;
  }

  return { events, requests };
}

function inRange(kickoff: string, range?: { from: string; to: string }): boolean {
  if (!range) return true;
  const time = new Date(kickoff).getTime();
  const from = new Date(`${range.from}T00:00:00.000Z`).getTime();
  const to = new Date(`${range.to}T23:59:59.999Z`).getTime();
  return time >= from && time <= to;
}

/** Celá sezóna nebo lokálně filtrované datumové okno jedné soutěže. */
export async function fetchSofascoreLeagueFixtures(
  sourceLeague: string,
  season: number,
  range?: { from: string; to: string },
): Promise<ApiFetchResult> {
  const tournamentId = sofascoreTournamentId(sourceLeague);
  const resolved = await resolveSeasonId(sourceLeague, season);
  let requests = resolved.requests;

  const [next, last] = await Promise.all([
    fetchDirection(tournamentId, resolved.id, 'next'),
    fetchDirection(tournamentId, resolved.id, 'last'),
  ]);
  requests += next.requests + last.requests;
  const raw: SofaEvent[] = [...next.events, ...last.events];

  const deduped = new Map<number, SofaEvent>();
  for (const event of raw) {
    const id = numeric(event.id);
    if (id != null) deduped.set(id, event);
  }

  const fixtures = Array.from(deduped.values())
    .map((event) => normalizeFixture(event, sourceLeague))
    .filter((item): item is CompetitionFixture => item !== null)
    .filter((item) => inRange(item.kickoff, range))
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  return { fixtures, requests, remaining: null };
}

/** Aktualizace konkrétních právě hraných zápasů přes veřejný detail eventu. */
export async function fetchSofascoreFixturesByIds(ids: number[]): Promise<ApiFetchResult> {
  const unique = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0))).slice(0, 24);
  if (unique.length === 0) return { fixtures: [], requests: 0, remaining: null };

  const fixtures: CompetitionFixture[] = [];
  let requests = 0;

  // Malé dávky šetří SofaScore i běhový čas Vercelu.
  for (let offset = 0; offset < unique.length; offset += 6) {
    const batch = unique.slice(offset, offset + 6);
    const settled = await Promise.allSettled(
      batch.map(async (id) => {
        const result = await sofaGet(`/event/${id}`);
        return result;
      }),
    );
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      requests += result.value.requests;
      const event = result.value.data?.event;
      if (!event) continue;
      const normalized = normalizeFixture(event);
      if (normalized) fixtures.push(normalized);
    }
  }

  return { fixtures, requests, remaining: null };
}

// Zpětná kompatibilita pro případ, že některá větev projektu stále používá
// původní názvy funkcí z API-Football implementace.
export const fetchApiFootballLeagueFixtures = fetchSofascoreLeagueFixtures;
export const fetchApiFootballFixturesByIds = fetchSofascoreFixturesByIds;
