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

const SOURCE_LABELS: Record<string, string> = {
  'cze.1': 'Chance liga',
  'uefa.champions': 'Liga mistrů',
  'uefa.europa': 'Evropská liga',
  'uefa.europa.conf': 'Konferenční liga',
};

const CHANCE_LIGA_URLS = [
  'https://www.chanceliga.cz/rozpis-zapasu',
  'https://en.chanceliga.cz/rozpis-zapasu?type=1',
] as const;

const UEFA_COMPETITIONS_URL = 'https://comp.uefa.com/v2/competitions';
const UEFA_MATCHES_URL = 'https://match.uefa.com/v5/matches';

// Stabilní veřejná ID hlavních mužských klubových soutěží UEFA.
// Díky nim synchronizace nepotřebuje API klíč ani placený katalog soutěží.
const UEFA_COMPETITION_IDS: Record<string, string> = {
  'uefa.champions': '1',
  'uefa.europa': '14',
  'uefa.europa.conf': '2019',
};

const PUBLIC_HEADERS = {
  Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
  'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};

export function sourceLabel(slug: string): string {
  return SOURCE_LABELS[slug] ?? slug;
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

async function fetchWithTimeout(url: string, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: PUBLIC_HEADERS,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

function stripTags(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stableNumericId(value: unknown): number | null {
  const stringValue = String(value ?? '').trim();
  if (!stringValue) return null;
  if (/^\d+$/.test(stringValue)) {
    const parsed = Number(stringValue);
    if (Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647) return parsed;
  }

  // FNV-1a převedené do kladného 31bit integeru, aby se vešlo do PostgreSQL INTEGER.
  let hash = 0x811c9dc5;
  for (let i = 0; i < stringValue.length; i++) {
    hash ^= stringValue.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 1) || 1;
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

function inRange(kickoff: string, range?: { from: string; to: string }): boolean {
  if (!range) return true;
  const time = new Date(kickoff).getTime();
  const from = new Date(`${range.from}T00:00:00.000Z`).getTime();
  const to = new Date(`${range.to}T23:59:59.999Z`).getTime();
  return time >= from && time <= to;
}

/* -------------------------------------------------------------------------- */
/* Chance Liga – oficiální web                                                 */
/* -------------------------------------------------------------------------- */

interface HtmlAnchor {
  start: number;
  end: number;
  href: string;
  text: string;
}

function extractAnchors(html: string): HtmlAnchor[] {
  const anchors: HtmlAnchor[] = [];
  const re = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    anchors.push({
      start: match.index,
      end: re.lastIndex,
      href: decodeHtml(match[2]),
      text: stripTags(match[3]),
    });
  }
  return anchors;
}

function lastMatch(text: string, re: RegExp): RegExpExecArray | null {
  let result: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((match = re.exec(text)) !== null) result = match;
  return result;
}

function pragueDateToIso(
  day: number,
  month: number,
  year: number,
  hour: number,
  minute: number,
): string {
  // Převod lokálního času Europe/Prague bez externí knihovny. Dvojí průchod
  // korektně pokryje i přechod mezi letním a zimním časem.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = desiredAsUtc;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]),
    );
    const displayedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess -= displayedAsUtc - desiredAsUtc;
  }
  return new Date(guess).toISOString();
}

interface ChanceCandidate extends CompetitionFixture {
  quality: number;
}

function cleanChanceTeam(value: string): string {
  // Oficiální web má v odkazu zároveň celý název a třípísmennou zkratku
  // (např. „FC Viktoria Plzeň PLZ"). Zkratka není součást názvu týmu.
  return canonTeam(value.replace(/\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{2,5}$/, '').trim());
}

export function parseChanceLigaHtml(html: string, range?: { from: string; to: string }): CompetitionFixture[] {
  const anchors = extractAnchors(html);
  const teamAnchors = anchors.filter((anchor) => /\/klub\//i.test(anchor.href));
  const matchAnchors = anchors.filter((anchor) => /\/zapas\/(\d+)(?:-|\/|$)/i.test(anchor.href));
  const byId = new Map<number, ChanceCandidate>();
  const now = Date.now();

  for (const anchor of matchAnchors) {
    const idMatch = anchor.href.match(/\/zapas\/(\d+)/i);
    const externalId = idMatch ? Number(idMatch[1]) : Number.NaN;
    if (!Number.isFinite(externalId) || externalId <= 0) continue;

    const homeAnchor = [...teamAnchors]
      .reverse()
      .find((team) => team.end <= anchor.start && anchor.start - team.end <= 2800);
    const awayAnchor = teamAnchors.find(
      (team) => team.start >= anchor.end && team.start - anchor.end <= 2800,
    );
    if (!homeAnchor || !awayAnchor) continue;

    const home = cleanChanceTeam(homeAnchor.text);
    const away = cleanChanceTeam(awayAnchor.text);
    if (!home || !away || home === away) continue;

    const beforeHtml = html.slice(Math.max(0, anchor.start - 5000), anchor.start);
    // Čas bereme jen z bezprostředního bloku konkrétního utkání. U pozdějších
    // kol web zobrazuje „-” místo času; širší výřez by jinak mohl omylem převzít
    // čas předchozího zápasu. Začátek bloku určí předchozí klubový odkaz.
    const homeTeamIndex = teamAnchors.indexOf(homeAnchor);
    const previousTeamEnd = homeTeamIndex > 0
      ? teamAnchors[homeTeamIndex - 1].end
      : Math.max(0, homeAnchor.start - 1200);
    const localBeforeHtml = html.slice(previousTeamEnd, anchor.start);
    const aroundHtml = html.slice(Math.max(0, homeAnchor.start - 600), Math.min(html.length, awayAnchor.end + 600));
    const beforeText = stripTags(beforeHtml);
    const localBeforeText = stripTags(localBeforeHtml);
    const aroundText = stripTags(aroundHtml);

    const dateMatch = lastMatch(localBeforeText, /(\d{2})\/(\d{2})\/(\d{4})/g)
      ?? lastMatch(beforeText, /(\d{2})\/(\d{2})\/(\d{4})/g);
    if (!dateMatch) continue;

    const timeInAnchor = anchor.text.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/);
    const timeBefore = lastMatch(localBeforeText, /(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/g);
    const timeMatch = timeInAnchor ?? timeBefore;
    const timeConfirmed = !!timeMatch;
    const hour = timeMatch ? Number(timeMatch[1]) : 12;
    const minute = timeMatch ? Number(timeMatch[2]) : 0;

    const kickoff = pragueDateToIso(
      Number(dateMatch[1]),
      Number(dateMatch[2]),
      Number(dateMatch[3]),
      hour,
      minute,
    );
    if (!inRange(kickoff, range)) continue;

    const roundMatch = lastMatch(beforeText, /(\d{1,2})\s*\.\s*(?:kolo|matchweek)/gi);
    const round = roundMatch ? Number(roundMatch[1]) : isoWeek(kickoff).week;
    const section = /nadstavba|championship group|relegation group|play.?off/i.test(aroundText)
      ? 'Nadstavba'
      : null;
    const roundLabel = section ? `${section} · ${round}. kolo` : `${round}. kolo`;

    const scores = Array.from(anchor.text.matchAll(/(\d+)\s*:\s*(\d+)/g));
    const homeScore = scores[0] ? Number(scores[0][1]) : null;
    const awayScore = scores[0] ? Number(scores[0][2]) : null;
    const penHome = scores[1] ? Number(scores[1][1]) : null;
    const penAway = scores[1] ? Number(scores[1][2]) : null;
    const scoreLike = /(?:\d+\s*:\s*\d+|-\s*:\s*-)/.test(anchor.text);

    const kickoffMs = new Date(kickoff).getTime();
    const inLiveWindow = timeConfirmed && now >= kickoffMs - 5 * 60_000 && now <= kickoffMs + 3 * 3600_000;
    let status: MatchStatus = 'scheduled';
    if (/odložen|postpon/i.test(aroundText)) status = 'postponed';
    else if (/zrušen|cancel|abandon/i.test(aroundText)) status = 'cancelled';
    else if (inLiveWindow) status = 'live';
    else if (homeScore != null && awayScore != null && now > kickoffMs + 2.5 * 3600_000) status = 'finished';

    const duration: CompetitionFixture['duration'] = penHome != null || penAway != null
      ? 'PENALTY_SHOOTOUT'
      : 'REGULAR';

    const candidate: ChanceCandidate = {
      external_api_id: externalId,
      source_league: 'cze.1',
      source_label: sourceLabel('cze.1'),
      round,
      round_label: roundLabel,
      kickoff,
      home_team: home,
      away_team: away,
      home_score: status === 'scheduled' ? null : homeScore,
      away_score: status === 'scheduled' ? null : awayScore,
      status,
      minute: null,
      clock: status === 'live' ? 'Živě' : null,
      duration,
      extra_home: null,
      extra_away: null,
      pen_home: penHome,
      pen_away: penAway,
      quality: (scoreLike ? 20 : 0) + (timeConfirmed ? 5 : 0) + (roundMatch ? 2 : 0),
    };

    const previous = byId.get(externalId);
    if (!previous || candidate.quality > previous.quality) byId.set(externalId, candidate);
  }

  return Array.from(byId.values())
    .map(({ quality: _quality, ...fixture }) => fixture)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
}

async function fetchChanceLigaPage(range?: { from: string; to: string }): Promise<ApiFetchResult> {
  const errors: string[] = [];
  let requests = 0;

  for (const url of CHANCE_LIGA_URLS) {
    requests++;
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        errors.push(`${new URL(url).host}: HTTP ${response.status}`);
        continue;
      }
      const html = await response.text();
      const fixtures = parseChanceLigaHtml(html, range);
      if (fixtures.length === 0) {
        const matchLinks = (html.match(/\/zapas\/\d+/gi) ?? []).length;
        errors.push(`${new URL(url).host}: stránka načtena, ale parser našel 0 zápasů (matchLinks=${matchLinks})`);
        continue;
      }
      return { fixtures, requests, remaining: null };
    } catch (error) {
      errors.push(`${new URL(url).host}: ${String(error)}`);
    }
  }

  throw new Error(`Oficiální web Chance Ligy se nepodařilo načíst: ${errors.join(' | ')}`);
}

/* -------------------------------------------------------------------------- */
/* Evropské poháry – veřejné endpointy UEFA                                    */
/* -------------------------------------------------------------------------- */

interface UefaCompetition {
  id?: string | number;
  code?: string;
  sportsType?: string;
  teamCategory?: string;
  age?: string;
  sex?: string;
  metaData?: { name?: string };
  translations?: {
    name?: Record<string, string>;
    tournamentName?: Record<string, string>;
  };
}

interface UefaScoreResult {
  home?: number;
  away?: number;
}

interface UefaMatch {
  id?: string | number;
  competition?: UefaCompetition;
  seasonYear?: string;
  kickOffTime?: { date?: string; dateTime?: string; utcOffsetInHours?: number };
  status?: 'UPCOMING' | 'FINISHED' | 'LIVE' | 'CURRENT' | 'ABANDONED' | 'CANCELED' | string;
  phase?: string;
  minute?: { normal?: number; injury?: number };
  homeTeam?: {
    internationalName?: string;
    isPlaceHolder?: boolean;
    translations?: { displayName?: Record<string, string>; displayOfficialName?: Record<string, string> };
  };
  awayTeam?: {
    internationalName?: string;
    isPlaceHolder?: boolean;
    translations?: { displayName?: Record<string, string>; displayOfficialName?: Record<string, string> };
  };
  round?: {
    orderInCompetition?: number;
    metaData?: { name?: string; type?: string };
    translations?: { name?: Record<string, string> };
  };
  matchday?: {
    sequenceNumber?: string;
    name?: string;
    longName?: string;
    translations?: { name?: Record<string, string>; longName?: Record<string, string> };
  };
  score?: {
    regular?: UefaScoreResult;
    total?: UefaScoreResult;
    penalty?: UefaScoreResult;
  };
}

let uefaCompetitionsPromise: Promise<UefaCompetition[]> | null = null;
let uefaCompetitionsLoadedAt = 0;

async function uefaGet<T>(url: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const target = query ? `${url}?${query}` : url;
  const response = await fetchWithTimeout(target);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`UEFA HTTP ${response.status}${body ? `: ${body.slice(0, 180)}` : ''}`);
  }
  const data = (await response.json()) as T | { error?: { title?: string; message?: string } };
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(`UEFA API: ${data.error.title ?? 'chyba'} – ${data.error.message ?? ''}`);
  }
  return data as T;
}

async function getUefaCompetitions(): Promise<UefaCompetition[]> {
  const now = Date.now();
  if (!uefaCompetitionsPromise || now - uefaCompetitionsLoadedAt > 6 * 3600_000) {
    uefaCompetitionsLoadedAt = now;
    uefaCompetitionsPromise = uefaGet<UefaCompetition[]>(UEFA_COMPETITIONS_URL).catch((error) => {
      uefaCompetitionsPromise = null;
      throw error;
    });
  }
  return uefaCompetitionsPromise;
}

function translated(record: Record<string, string> | undefined): string {
  if (!record) return '';
  return record.EN ?? record.en ?? record.CS ?? record.cs ?? Object.values(record)[0] ?? '';
}

function competitionName(competition: UefaCompetition): string {
  return [
    competition.metaData?.name,
    translated(competition.translations?.name),
    translated(competition.translations?.tournamentName),
  ]
    .filter(Boolean)
    .join(' ');
}

async function resolveUefaCompetition(sourceLeague: string): Promise<UefaCompetition> {
  const competitions = await getUefaCompetitions();
  const candidates = competitions.filter((competition) => {
    const code = (competition.code ?? '').toUpperCase();
    const name = competitionName(competition);
    if (competition.sportsType && competition.sportsType !== 'FOOTBALL') return false;
    if (competition.teamCategory && competition.teamCategory !== 'CLUB') return false;
    if (competition.sex && competition.sex !== 'MALE') return false;

    if (sourceLeague === 'uefa.champions') {
      return code === 'UCL' || /(?:UEFA\s+)?Champions League/i.test(name);
    }
    if (sourceLeague === 'uefa.europa') {
      return code === 'UEL' || (/Europa League/i.test(name) && !/Conference/i.test(name));
    }
    if (sourceLeague === 'uefa.europa.conf') {
      return code === 'UECL' || /Conference League|Europa Conference/i.test(name);
    }
    return false;
  });

  const competition = candidates[0];
  if (!competition?.id) {
    const known = competitions
      .map((item) => `${item.code ?? '?'}:${competitionName(item)}`)
      .filter((name) => /Champions|Europa|Conference/i.test(name))
      .slice(0, 15)
      .join(', ');
    throw new Error(`UEFA soutěž ${sourceLeague} nenalezena. Dostupné podobné soutěže: ${known || 'žádné'}`);
  }
  return competition;
}

function uefaStatus(value: string | undefined): MatchStatus {
  switch ((value ?? '').toUpperCase()) {
    case 'LIVE':
    case 'CURRENT':
      return 'live';
    case 'FINISHED':
      return 'finished';
    case 'POSTPONED':
      return 'postponed';
    case 'ABANDONED':
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'scheduled';
  }
}

function uefaTeamName(team: UefaMatch['homeTeam']): string {
  return canonTeam(
    team?.internationalName
      || translated(team?.translations?.displayOfficialName)
      || translated(team?.translations?.displayName)
      || '',
  );
}

function uefaRound(sourceLeague: string, match: UefaMatch, kickoff: string): { round: number; label: string } {
  const wk = isoWeek(kickoff);
  const sourceIndex = sourceLeague === 'uefa.champions' ? 1 : sourceLeague === 'uefa.europa' ? 2 : 3;
  const name = match.round?.metaData?.name
    ?? translated(match.round?.translations?.name)
    ?? match.matchday?.longName
    ?? translated(match.matchday?.translations?.longName)
    ?? match.matchday?.name
    ?? translated(match.matchday?.translations?.name)
    ?? `týden ${wk.week}/${wk.year}`;
  return {
    round: wk.year * 10_000 + wk.week * 10 + sourceIndex,
    label: `${sourceLabel(sourceLeague)} · ${name}`,
  };
}

function normalizeUefaMatch(match: UefaMatch, forcedSource: string): CompetitionFixture | null {
  const id = stableNumericId(match.id);
  const kickoffValue = match.kickOffTime?.dateTime
    ?? (match.kickOffTime?.date ? `${match.kickOffTime.date}T12:00:00Z` : null);
  if (id == null || !kickoffValue) return null;

  const kickoffDate = new Date(kickoffValue);
  if (!Number.isFinite(kickoffDate.getTime())) return null;
  const kickoff = kickoffDate.toISOString();
  const home = uefaTeamName(match.homeTeam);
  const away = uefaTeamName(match.awayTeam);
  if (!home || !away || match.homeTeam?.isPlaceHolder || match.awayTeam?.isPlaceHolder) return null;

  const status = uefaStatus(match.status);
  const regularHome = numeric(match.score?.regular?.home);
  const regularAway = numeric(match.score?.regular?.away);
  const totalHome = numeric(match.score?.total?.home);
  const totalAway = numeric(match.score?.total?.away);
  const penHome = numeric(match.score?.penalty?.home);
  const penAway = numeric(match.score?.penalty?.away);
  const duration: CompetitionFixture['duration'] = penHome != null || penAway != null
    ? 'PENALTY_SHOOTOUT'
    : ((regularHome != null && totalHome != null && regularHome !== totalHome)
      || (regularAway != null && totalAway != null && regularAway !== totalAway))
      ? 'EXTRA_TIME'
      : 'REGULAR';
  const round = uefaRound(forcedSource, match, kickoff);
  const normalMinute = numeric(match.minute?.normal);
  const injuryMinute = numeric(match.minute?.injury);
  const minute = normalMinute == null ? null : normalMinute + (injuryMinute ?? 0);
  const clock = status === 'live'
    ? normalMinute == null
      ? (match.phase ?? 'Živě')
      : `${normalMinute}${injuryMinute ? `+${injuryMinute}` : ''}'`
    : null;

  return {
    external_api_id: id,
    source_league: forcedSource,
    source_label: sourceLabel(forcedSource),
    round: round.round,
    round_label: round.label,
    kickoff,
    home_team: home,
    away_team: away,
    home_score: status === 'scheduled' ? null : (regularHome ?? totalHome),
    away_score: status === 'scheduled' ? null : (regularAway ?? totalAway),
    status,
    minute,
    clock,
    duration,
    extra_home: duration !== 'REGULAR' ? totalHome : null,
    extra_away: duration !== 'REGULAR' ? totalAway : null,
    pen_home: penHome,
    pen_away: penAway,
  };
}

async function fetchUefaLeagueFixtures(
  sourceLeague: string,
  season: number,
  range?: { from: string; to: string },
): Promise<ApiFetchResult> {
  const competitionId = UEFA_COMPETITION_IDS[sourceLeague]
    ?? String((await resolveUefaCompetition(sourceLeague)).id);
  const fixtures: CompetitionFixture[] = [];
  let requests = UEFA_COMPETITION_IDS[sourceLeague] ? 0 : 1;
  const pageSize = 100;

  for (let offset = 0; offset < 1000; offset += pageSize) {
    const matches = await uefaGet<UefaMatch[]>(UEFA_MATCHES_URL, {
      competitionId,
      seasonYear: String(season),
      limit: String(pageSize),
      offset: String(offset),
      order: 'ASC',
    });
    requests++;
    for (const match of matches) {
      const normalized = normalizeUefaMatch(match, sourceLeague);
      if (normalized && inRange(normalized.kickoff, range)) fixtures.push(normalized);
    }
    if (matches.length < pageSize) break;
  }

  const deduped = new Map<number, CompetitionFixture>();
  for (const fixture of fixtures) deduped.set(fixture.external_api_id, fixture);
  return {
    fixtures: Array.from(deduped.values()).sort(
      (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
    ),
    requests,
    remaining: null,
  };
}

async function fetchUefaFixturesByIds(sourceLeague: string, ids: number[]): Promise<ApiFetchResult> {
  const unique = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0))).slice(0, 80);
  if (unique.length === 0) return { fixtures: [], requests: 0, remaining: null };

  const matches = await uefaGet<UefaMatch[]>(UEFA_MATCHES_URL, {
    matchId: unique.join(','),
    order: 'ASC',
  });
  const fixtures = matches
    .map((match) => normalizeUefaMatch(match, sourceLeague))
    .filter((fixture): fixture is CompetitionFixture => fixture !== null);
  return { fixtures, requests: 1, remaining: null };
}

/* -------------------------------------------------------------------------- */
/* Veřejné rozhraní synchronizace                                              */
/* -------------------------------------------------------------------------- */

export async function fetchOfficialLeagueFixtures(
  sourceLeague: string,
  season: number,
  range?: { from: string; to: string },
): Promise<ApiFetchResult> {
  if (sourceLeague === 'cze.1') return fetchChanceLigaPage(range);
  if (sourceLeague.startsWith('uefa.')) return fetchUefaLeagueFixtures(sourceLeague, season, range);
  throw new Error(`Nepodporovaný veřejný zdroj soutěže: ${sourceLeague}`);
}

export async function fetchOfficialFixturesByIds(
  sourceLeague: string,
  ids: number[],
): Promise<ApiFetchResult> {
  if (sourceLeague === 'cze.1') {
    const all = await fetchChanceLigaPage();
    const wanted = new Set(ids);
    return { ...all, fixtures: all.fixtures.filter((fixture) => wanted.has(fixture.external_api_id)) };
  }
  if (sourceLeague.startsWith('uefa.')) return fetchUefaFixturesByIds(sourceLeague, ids);
  throw new Error(`Nepodporovaný veřejný zdroj soutěže: ${sourceLeague}`);
}

// Zpětná kompatibilita pro starší větve projektu.
export const fetchSofascoreLeagueFixtures = fetchOfficialLeagueFixtures;
export async function fetchSofascoreFixturesByIds(ids: number[]): Promise<ApiFetchResult> {
  throw new Error(
    `Staré volání bez sourceLeague už není podporované (${ids.length} ID). Použij fetchOfficialFixturesByIds(sourceLeague, ids).`,
  );
}
export const fetchApiFootballLeagueFixtures = fetchOfficialLeagueFixtures;
