import type { MatchStatus } from './types';
import type { MatchDetail, MatchLineups, LineupPlayer, TeamStats } from './espn';
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
  home_source_name?: string;
  away_source_name?: string;
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
  'uefa.champions_qual': 'Liga mistrů · kvalifikace',
  'uefa.champions': 'Liga mistrů',
  'uefa.europa_qual': 'Evropská liga · kvalifikace',
  'uefa.europa': 'Evropská liga',
  'uefa.europa.conf_qual': 'Konferenční liga · kvalifikace',
  'uefa.europa.conf': 'Konferenční liga',
};

const CHANCE_LIGA_URLS = [
  'https://www.chanceliga.cz/rozpis-zapasu',
  'https://en.chanceliga.cz/rozpis-zapasu?type=1',
] as const;

const PUBLIC_HEADERS = {
  Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
  'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};

export function sourceLabel(slug: string): string {
  return SOURCE_LABELS[slug] ?? slug;
}

function isoYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function compactYmd(value: string): string {
  return value.replaceAll('-', '');
}

export function apiDateWindow(daysBack = 2, daysForward = 90): { from: string; to: string } {
  const now = new Date();
  return {
    from: isoYmd(new Date(now.getTime() - daysBack * 864e5)),
    to: isoYmd(new Date(now.getTime() + daysForward * 864e5)),
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

function lastMatch(text: string, re: RegExp): RegExpExecArray | null {
  let result: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((match = re.exec(text)) !== null) result = match;
  return result;
}

function inRange(kickoff: string, range?: { from: string; to: string }): boolean {
  if (!range) return true;
  const time = new Date(kickoff).getTime();
  const from = new Date(`${range.from}T00:00:00.000Z`).getTime();
  const to = new Date(`${range.to}T23:59:59.999Z`).getTime();
  return time >= from && time <= to;
}

function pragueDateToIso(
  day: number,
  month: number,
  year: number,
  hour: number,
  minute: number,
): string {
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

/* -------------------------------------------------------------------------- */
/* Chance Liga – oficiální web LFA                                             */
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

function cleanChanceTeam(value: string): string {
  return canonTeam(value.replace(/\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{2,5}$/, '').trim());
}

function isChanceScoreAnchor(anchor: HtmlAnchor): boolean {
  if (!/\/zapas\/(?:online\/)?\d+(?:-|\/|$)/i.test(anchor.href)) return false;
  const text = anchor.text.replace(/\s+/g, ' ').trim();
  // Důležité: postranní seznam používá stejný odkaz, ale text odkazu je čas
  // („so 17:00"). Přijímáme jen skutečné skóre hlavního řádku utkání.
  return /^(?:-\s*:\s*-|\d+\s*:\s*\d+(?:\s*\([^)]*\))?)$/i.test(text);
}

function nearestTeamAnchor(
  anchors: HtmlAnchor[],
  scoreIndex: number,
  direction: -1 | 1,
): HtmlAnchor | null {
  for (let step = 1; step <= 10; step++) {
    const candidate = anchors[scoreIndex + direction * step];
    if (!candidate) break;
    if (isChanceScoreAnchor(candidate)) break;
    if (/\/klub\//i.test(candidate.href) && candidate.text.trim()) return candidate;
  }
  return null;
}

function scorePair(text: string): { home: number | null; away: number | null } {
  const match = text.match(/(\d+)\s*:\s*(\d+)/);
  return match ? { home: Number(match[1]), away: Number(match[2]) } : { home: null, away: null };
}

function validateChanceSchedule(fixtures: CompetitionFixture[], requireComplete: boolean): void {
  const regular = fixtures.filter((fixture) => fixture.round >= 1 && fixture.round <= 30);
  const problems: string[] = [];
  const ids = new Set<number>();

  for (const fixture of regular) {
    if (ids.has(fixture.external_api_id)) problems.push(`duplicitní ID ${fixture.external_api_id}`);
    ids.add(fixture.external_api_id);
    if (!fixture.home_team || !fixture.away_team || fixture.home_team === fixture.away_team) {
      problems.push(`neplatná dvojice u ID ${fixture.external_api_id}`);
    }
  }

  const byRound = new Map<number, CompetitionFixture[]>();
  for (const fixture of regular) {
    const list = byRound.get(fixture.round) ?? [];
    list.push(fixture);
    byRound.set(fixture.round, list);
  }

  for (const [round, matches] of byRound) {
    const teams = matches.flatMap((match) => [match.home_team, match.away_team]);
    if (new Set(teams).size !== teams.length) problems.push(`${round}. kolo obsahuje tým vícekrát`);
    if (matches.length !== 8) problems.push(`${round}. kolo má ${matches.length} místo 8 zápasů`);
  }

  if (requireComplete) {
    for (let round = 1; round <= 30; round++) {
      if ((byRound.get(round)?.length ?? 0) !== 8) {
        problems.push(`${round}. kolo není kompletní`);
      }
    }
    if (regular.length !== 240) problems.push(`základní část má ${regular.length} místo 240 zápasů`);
  }

  if (problems.length > 0) {
    throw new Error(`Kontrola oficiálního rozpisu Chance Ligy selhala: ${Array.from(new Set(problems)).slice(0, 12).join('; ')}`);
  }
}

/**
 * Parser oficiálního rozpisu. Používá pouze trojici sousedních odkazů
 * „domácí klub – skóre – hostující klub“, takže ignoruje duplicitní odkazy
 * v postranním programu a nemůže posunout dvojice o jeden tým.
 */
export function parseChanceLigaHtml(
  html: string,
  range?: { from: string; to: string },
): CompetitionFixture[] {
  const anchors = extractAnchors(html);
  const scoreIndexes = anchors
    .map((anchor, index) => ({ anchor, index }))
    .filter(({ anchor }) => isChanceScoreAnchor(anchor));
  const fixtures: CompetitionFixture[] = [];
  const byId = new Map<number, CompetitionFixture>();
  const now = Date.now();
  let previousScoreEnd = 0;
  let currentRound: number | null = null;

  for (const { anchor, index } of scoreIndexes) {
    const idMatch = anchor.href.match(/\/zapas\/(?:online\/)?(\d+)/i);
    const externalId = idMatch ? Number(idMatch[1]) : Number.NaN;
    if (!Number.isSafeInteger(externalId) || externalId <= 0) continue;

    const homeAnchor = nearestTeamAnchor(anchors, index, -1);
    const awayAnchor = nearestTeamAnchor(anchors, index, 1);
    if (!homeAnchor || !awayAnchor) continue;

    const home = cleanChanceTeam(homeAnchor.text);
    const away = cleanChanceTeam(awayAnchor.text);
    if (!home || !away || home === away) continue;

    const rowPrefix = stripTags(html.slice(previousScoreEnd, anchor.start));
    previousScoreEnd = anchor.end;

    const roundMatch = lastMatch(rowPrefix, /(\d{1,2})\s*\.\s*(?:kolo|matchweek)/gi);
    if (roundMatch) currentRound = Number(roundMatch[1]);
    if (!currentRound) continue;

    const dateMatch = lastMatch(rowPrefix, /(\d{2})[\/.](\d{2})[\/.](\d{4})/g);
    if (!dateMatch) continue;

    const timeMatch = lastMatch(rowPrefix, /(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/g);
    const timeConfirmed = !!timeMatch;
    // Neurčené termíny se na oficiálním webu zobrazují jako „-“. Provizorní
    // čas se při každém běhu přepíše, jakmile LFA přesný výkop zveřejní.
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

    const score = scorePair(anchor.text);
    const aroundText = stripTags(
      html.slice(Math.max(0, homeAnchor.start - 400), Math.min(html.length, awayAnchor.end + 500)),
    );
    const kickoffMs = new Date(kickoff).getTime();
    const inLiveWindow = timeConfirmed && now >= kickoffMs - 10 * 60_000 && now <= kickoffMs + 4 * 3600_000;
    let status: MatchStatus = 'scheduled';
    if (/odložen|postpon/i.test(aroundText)) status = 'postponed';
    else if (/zrušen|cancel|abandon/i.test(aroundText)) status = 'cancelled';
    else if (/konec|dohráno|finished/i.test(aroundText)) status = 'finished';
    else if (inLiveWindow) status = 'live';
    else if (score.home != null && score.away != null && now > kickoffMs + 3.5 * 3600_000) status = 'finished';

    const fixture: CompetitionFixture = {
      external_api_id: externalId,
      source_league: 'cze.1',
      source_label: sourceLabel('cze.1'),
      round: currentRound,
      round_label: `${currentRound}. kolo`,
      kickoff,
      home_team: home,
      away_team: away,
      home_source_name: home,
      away_source_name: away,
      home_score: status === 'scheduled' ? null : score.home,
      away_score: status === 'scheduled' ? null : score.away,
      status,
      minute: null,
      clock: status === 'live' ? 'Živě' : null,
      duration: 'REGULAR',
      extra_home: null,
      extra_away: null,
      pen_home: null,
      pen_away: null,
    };

    byId.set(externalId, fixture);
  }

  fixtures.push(...byId.values());
  return fixtures.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
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
        errors.push(`${new URL(url).host}: stránka načtena, ale parser našel 0 skutečných řádků zápasů`);
        continue;
      }
      // U celé sezony přijmeme data jen tehdy, když projdou strukturální
      // kontrolou 30 kol × 8 utkání. Částečné datumové okno validujeme mírněji.
      validateChanceSchedule(fixtures, !range);
      return { fixtures, requests, remaining: null };
    } catch (error) {
      errors.push(`${new URL(url).host}: ${String(error)}`);
    }
  }

  throw new Error(`Oficiální web Chance Ligy se nepodařilo bezpečně načíst: ${errors.join(' | ')}`);
}

/* -------------------------------------------------------------------------- */
/* Evropské poháry – veřejný ESPN scoreboard                                  */
/* -------------------------------------------------------------------------- */

interface EspnTeam {
  displayName?: string;
  name?: string;
  shortDisplayName?: string;
}

interface EspnCompetitor {
  homeAway?: 'home' | 'away';
  score?: string;
  team?: EspnTeam;
}

interface EspnEvent {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  week?: { number?: number };
  competitions?: Array<{
    notes?: Array<{ headline?: string }>;
    type?: { text?: string };
    status?: {
      displayClock?: string;
      type?: {
        state?: string;
        completed?: boolean;
        detail?: string;
        shortDetail?: string;
        description?: string;
      };
    };
    competitors?: EspnCompetitor[];
  }>;
}

function parseScore(value: string | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMinute(clock: string | undefined): number | null {
  const match = (clock ?? '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function mapEspnStatus(event: EspnEvent): MatchStatus {
  const status = event.competitions?.[0]?.status;
  const state = status?.type?.state;
  const text = `${status?.type?.detail ?? ''} ${status?.type?.shortDetail ?? ''} ${status?.type?.description ?? ''}`;
  if (/postpon/i.test(text)) return 'postponed';
  if (/cancel|abandon/i.test(text)) return 'cancelled';
  if (status?.type?.completed || state === 'post') return 'finished';
  if (state === 'in') return 'live';
  return 'scheduled';
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

function translatedPhase(raw: string): { code: number; label: string } | null {
  const text = raw.trim();
  const phases: Array<[RegExp, number, string]> = [
    [/first qualifying|1st qualifying/i, 1, '1. předkolo'],
    [/second qualifying|2nd qualifying/i, 2, '2. předkolo'],
    [/third qualifying|3rd qualifying/i, 3, '3. předkolo'],
    [/qualifying play.?off|play.?off round/i, 4, 'Play-off kvalifikace'],
    [/league phase|group stage/i, 10, 'Ligová fáze'],
    [/knockout.*play.?off/i, 11, 'Play-off vyřazovací fáze'],
    [/round of 16|last 16/i, 12, 'Osmifinále'],
    [/quarter/i, 13, 'Čtvrtfinále'],
    [/semi/i, 14, 'Semifinále'],
    [/final/i, 15, 'Finále'],
  ];
  for (const [pattern, code, label] of phases) {
    if (pattern.test(text)) return { code, label };
  }
  return text ? { code: 50, label: text } : null;
}

function europeRound(event: EspnEvent, slug: string): { round: number; label: string } {
  const competition = event.competitions?.[0];
  const phaseText = [
    ...(competition?.notes?.map((note) => note.headline) ?? []),
    competition?.type?.text,
  ]
    .filter((value): value is string => !!value)
    .join(' ');
  const phase = translatedPhase(phaseText);
  const slugIndex = [
    'uefa.champions_qual',
    'uefa.champions',
    'uefa.europa_qual',
    'uefa.europa',
    'uefa.europa.conf_qual',
    'uefa.europa.conf',
  ].indexOf(slug) + 1;

  if (phase) {
    return {
      round: Math.max(1, slugIndex) * 100 + phase.code,
      label: `${sourceLabel(slug)} · ${phase.label}`,
    };
  }

  const week = isoWeek(event.date ?? new Date().toISOString());
  return {
    round: Math.max(1, slugIndex) * 100_000 + week.year * 100 + week.week,
    label: `${sourceLabel(slug)} · týden ${week.week}/${week.year}`,
  };
}

function normalizeEspnEvent(event: EspnEvent, slug: string): CompetitionFixture | null {
  const competition = event.competitions?.[0];
  if (!event.id || !event.date || !competition) return null;
  const externalId = Number(event.id);
  if (!Number.isSafeInteger(externalId) || externalId <= 0) return null;

  const home = competition.competitors?.find((item) => item.homeAway === 'home');
  const away = competition.competitors?.find((item) => item.homeAway === 'away');
  const homeSourceName = home?.team?.displayName ?? home?.team?.name ?? home?.team?.shortDisplayName ?? '';
  const awaySourceName = away?.team?.displayName ?? away?.team?.name ?? away?.team?.shortDisplayName ?? '';
  const homeTeam = canonTeam(homeSourceName);
  const awayTeam = canonTeam(awaySourceName);
  if (!homeTeam || !awayTeam || /\bTBD\b|to be determined/i.test(`${homeTeam} ${awayTeam}`)) return null;

  const status = mapEspnStatus(event);
  const clock = competition.status?.displayClock ?? competition.status?.type?.shortDetail ?? null;
  const statusText = `${competition.status?.type?.detail ?? ''} ${competition.status?.type?.shortDetail ?? ''}`;
  const duration: CompetitionFixture['duration'] = /penalt/i.test(statusText)
    ? 'PENALTY_SHOOTOUT'
    : /extra time|aet/i.test(statusText)
      ? 'EXTRA_TIME'
      : 'REGULAR';
  const round = europeRound(event, slug);
  const rawHomeScore = parseScore(home?.score);
  const rawAwayScore = parseScore(away?.score);

  return {
    external_api_id: externalId,
    source_league: slug,
    source_label: sourceLabel(slug),
    round: round.round,
    round_label: round.label,
    kickoff: event.date,
    home_team: homeTeam,
    away_team: awayTeam,
    home_source_name: homeSourceName,
    away_source_name: awaySourceName,
    // Bodování je založené na výsledku po základní hrací době. ESPN u zápasů
    // po prodloužení/penaltách ne vždy rozlišuje 90minutový stav, proto jej
    // raději necháme prázdný než spočítat body chybně.
    home_score: status === 'finished' && duration !== 'REGULAR' ? null : rawHomeScore,
    away_score: status === 'finished' && duration !== 'REGULAR' ? null : rawAwayScore,
    status,
    minute: status === 'live' ? parseMinute(clock ?? undefined) : null,
    clock: status === 'live' ? clock : null,
    duration,
    extra_home: null,
    extra_away: null,
    pen_home: null,
    pen_away: null,
  };
}

function dateChunks(range: { from: string; to: string }, days = 35): Array<{ from: string; to: string }> {
  const output: Array<{ from: string; to: string }> = [];
  let cursor = new Date(`${range.from}T00:00:00.000Z`);
  const end = new Date(`${range.to}T00:00:00.000Z`);
  while (cursor <= end) {
    const chunkEnd = new Date(Math.min(end.getTime(), cursor.getTime() + (days - 1) * 864e5));
    output.push({ from: isoYmd(cursor), to: isoYmd(chunkEnd) });
    cursor = new Date(chunkEnd.getTime() + 864e5);
  }
  return output;
}

async function fetchEspnWindow(slug: string, range: { from: string; to: string }): Promise<ApiFetchResult> {
  const chunks = dateChunks(range);
  const requests = chunks.map(async (chunk) => {
    const dates = `${compactYmd(chunk.from)}-${compactYmd(chunk.to)}`;
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dates}&limit=500`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`ESPN ${slug} HTTP ${response.status}`);
    return (await response.json()) as { events?: EspnEvent[] };
  });

  const responses = await Promise.all(requests);
  const byId = new Map<number, CompetitionFixture>();
  for (const response of responses) {
    for (const event of response.events ?? []) {
      const fixture = normalizeEspnEvent(event, slug);
      if (fixture && inRange(fixture.kickoff, range)) byId.set(fixture.external_api_id, fixture);
    }
  }
  return {
    fixtures: Array.from(byId.values()).sort(
      (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
    ),
    requests: chunks.length,
    remaining: null,
  };
}

async function fetchEspnLeagueFixtures(
  slug: string,
  season: number,
  range?: { from: string; to: string },
): Promise<ApiFetchResult> {
  // ESPN publikuje los postupně. Místo jednoho ročního dotazu (který může
  // vrátit nesprávnou sezonu nebo prázdná data) synchronizujeme kratší okna.
  // Výchozí okno nikdy nezačne před 1. červencem dané sezony, takže se do
  // Evropy 2026/27 nemohou znovu dostat zápasy z jara 2026.
  const moving = apiDateWindow(14, 120);
  const seasonRange = {
    from: `${season}-07-01`,
    to: `${season + 1}-06-30`,
  };
  const effective = range ?? {
    from: moving.from < seasonRange.from ? seasonRange.from : moving.from,
    to: moving.to > seasonRange.to ? seasonRange.to : moving.to,
  };
  return fetchEspnWindow(slug, effective);
}

async function fetchEspnFixturesByIds(slug: string, ids: number[]): Promise<ApiFetchResult> {
  const wanted = new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0));
  if (wanted.size === 0) return { fixtures: [], requests: 0, remaining: null };
  const result = await fetchEspnWindow(slug, apiDateWindow(2, 2));
  return { ...result, fixtures: result.fixtures.filter((fixture) => wanted.has(fixture.external_api_id)) };
}


/* -------------------------------------------------------------------------- */
/* Highlightly – volitelná live vrstva Chance ligy a přípravy                  */
/* -------------------------------------------------------------------------- */

const HIGHLIGHTLY_BASE = 'https://soccer.highlightly.net';

export interface HighlightlyBudget {
  requests: number;
  remaining: number | null;
  limit: number | null;
}

export interface HighlightlyLeague {
  id: number;
  name: string;
  season?: number | string | null;
  countryCode?: string | null;
  countryName?: string | null;
}

export interface HighlightlyMatch {
  id: number;
  date: string;
  round: number | null;
  league: HighlightlyLeague;
  home: { id: number | null; name: string; logo: string | null };
  away: { id: number | null; name: string; logo: string | null };
  status: MatchStatus;
  stateDescription: string;
  minute: number | null;
  clock: string | null;
  homeScore: number | null;
  awayScore: number | null;
  penHome: number | null;
  penAway: number | null;
  duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
}

export interface HighlightlyPage<T> extends HighlightlyBudget {
  data: T[];
  totalCount: number;
}

type JsonMap = Record<string, unknown>;

function asMap(value: unknown): JsonMap {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as JsonMap : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function numberValue(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(stringValue(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function intValue(value: unknown): number | null {
  const n = numberValue(value);
  return n == null ? null : Math.trunc(n);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return '';
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = numberValue(value);
    if (n != null) return n;
  }
  return null;
}

function parseScoreText(value: unknown): { home: number | null; away: number | null } {
  const map = asMap(value);
  const home = firstNumber(map.home, map.homeScore, map.homeTeam, map.local, map.scoreHome);
  const away = firstNumber(map.away, map.awayScore, map.awayTeam, map.visitor, map.scoreAway);
  if (home != null || away != null) return { home, away };
  const text = stringValue(value);
  const m = text.match(/(-?\d+(?:\.\d+)?)\s*[-:]\s*(-?\d+(?:\.\d+)?)/);
  return m ? { home: Number(m[1]), away: Number(m[2]) } : { home: null, away: null };
}

function highlightlyStatus(description: string): MatchStatus {
  const text = description.toLowerCase();
  if (/cancel|abandon/.test(text)) return 'cancelled';
  if (/postpon|suspend|interrupt/.test(text)) return 'postponed';
  if (/finish|full time|after penalties|after extra|awarded|ended/.test(text)) return 'finished';
  if (/first half|second half|half.?time|extra time|penalt|break|in progress|live|playing/.test(text)) return 'live';
  return 'scheduled';
}

function highlightlyDuration(description: string): 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' {
  const text = description.toLowerCase();
  if (/penalt/.test(text)) return 'PENALTY_SHOOTOUT';
  if (/extra time|after extra/.test(text)) return 'EXTRA_TIME';
  return 'REGULAR';
}

function parseHighlightlyClock(state: JsonMap): { minute: number | null; clock: string | null } {
  const raw = firstString(state.clock, state.minute, state.time, state.elapsed);
  if (!raw) return { minute: null, clock: null };
  const m = raw.match(/(\d{1,3})/);
  return { minute: m ? Number(m[1]) : null, clock: raw.includes("'") ? raw : `${raw}'` };
}

function normalizeHighlightlyLeague(value: unknown): HighlightlyLeague {
  const league = asMap(value);
  const country = asMap(league.country);
  return {
    id: intValue(league.id) ?? 0,
    name: firstString(league.name, league.leagueName, league.title),
    season: league.season as number | string | null | undefined,
    countryCode: firstString(country.code, league.countryCode) || null,
    countryName: firstString(country.name, league.countryName) || null,
  };
}

function normalizeHighlightlyTeam(value: unknown): { id: number | null; name: string; logo: string | null } {
  const team = asMap(value);
  return {
    id: intValue(team.id),
    name: firstString(team.name, team.displayName, team.teamName),
    logo: firstString(team.logo, team.image, team.badge) || null,
  };
}

function normalizeHighlightlyMatch(value: unknown): HighlightlyMatch | null {
  const raw = asMap(value);
  const id = intValue(raw.id);
  const date = firstString(raw.date, raw.startDate, raw.kickoff, raw.startTime);
  const home = normalizeHighlightlyTeam(raw.homeTeam ?? raw.home);
  const away = normalizeHighlightlyTeam(raw.awayTeam ?? raw.away);
  if (id == null || !date || !home.name || !away.name) return null;
  const state = asMap(raw.state ?? raw.status);
  const description = firstString(state.description, state.name, state.status, raw.status);
  const scoreMap = asMap(state.score ?? raw.score);
  const current = parseScoreText(scoreMap.current ?? scoreMap.fullTime ?? scoreMap);
  const penalties = parseScoreText(scoreMap.penalties ?? raw.penalties);
  const status = highlightlyStatus(description);
  const duration = highlightlyDuration(description);
  const clock = parseHighlightlyClock(state);
  return {
    id,
    date: new Date(date).toString() === 'Invalid Date' ? date : new Date(date).toISOString(),
    round: intValue(raw.round),
    league: normalizeHighlightlyLeague(raw.league),
    home,
    away,
    status,
    stateDescription: description,
    minute: status === 'live' ? clock.minute : null,
    clock: status === 'live' ? clock.clock : null,
    homeScore: current.home,
    awayScore: current.away,
    penHome: penalties.home,
    penAway: penalties.away,
    duration,
  };
}

function highlightlyKey(): string {
  return process.env.HIGHLIGHTLY_API_KEY?.trim() ?? '';
}

export function highlightlyConfigured(): boolean {
  return highlightlyKey().length > 0;
}

async function highlightlyGet(path: string, params: Record<string, string | number | undefined>): Promise<{
  json: unknown;
  requests: number;
  remaining: number | null;
  limit: number | null;
}> {
  const key = highlightlyKey();
  if (!key) throw new Error('Chybí HIGHLIGHTLY_API_KEY ve Vercelu.');
  const url = new URL(path, HIGHLIGHTLY_BASE);
  for (const [name, value] of Object.entries(params)) {
    if (value != null && String(value) !== '') url.searchParams.set(name, String(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'x-rapidapi-key': key,
      },
    });
    const bodyText = await response.text();
    let json: unknown = {};
    try { json = bodyText ? JSON.parse(bodyText) : {}; } catch { json = { raw: bodyText.slice(0, 1000) }; }
    const remaining = intValue(response.headers.get('x-ratelimit-requests-remaining'));
    const limit = intValue(response.headers.get('x-ratelimit-requests-limit'));
    if (!response.ok) {
      throw new Error(`Highlightly HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
    }
    return { json, requests: 1, remaining, limit };
  } finally {
    clearTimeout(timeout);
  }
}

function pageData(json: unknown): { data: unknown[]; totalCount: number } {
  const root = asMap(json);
  const pagination = asMap(root.pagination);
  const data = asArray(root.data ?? root.results ?? root.response);
  return { data, totalCount: intValue(pagination.totalCount ?? pagination.total ?? root.totalCount) ?? data.length };
}

export async function fetchHighlightlyLeagues(params: {
  countryCode?: string;
  countryName?: string;
  leagueName?: string;
  season?: number;
  limit?: number;
  offset?: number;
} = {}): Promise<HighlightlyPage<HighlightlyLeague>> {
  const response = await highlightlyGet('/leagues', {
    countryCode: params.countryCode,
    countryName: params.countryName,
    leagueName: params.leagueName,
    season: params.season,
    limit: params.limit ?? 100,
    offset: params.offset ?? 0,
  });
  const page = pageData(response.json);
  return {
    data: page.data.map(normalizeHighlightlyLeague).filter((league) => league.id > 0 && !!league.name),
    totalCount: page.totalCount,
    requests: response.requests,
    remaining: response.remaining,
    limit: response.limit,
  };
}

export async function fetchHighlightlyMatches(params: {
  date?: string;
  leagueId?: number;
  leagueName?: string;
  season?: number;
  countryCode?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
}): Promise<HighlightlyPage<HighlightlyMatch>> {
  const response = await highlightlyGet('/matches', {
    date: params.date,
    leagueId: params.leagueId,
    leagueName: params.leagueName,
    season: params.season,
    countryCode: params.countryCode,
    homeTeamName: params.homeTeamName,
    awayTeamName: params.awayTeamName,
    limit: params.limit ?? 100,
    offset: params.offset ?? 0,
    timezone: params.timezone ?? 'Europe/Prague',
  });
  const page = pageData(response.json);
  return {
    data: page.data.map(normalizeHighlightlyMatch).filter((match): match is HighlightlyMatch => match != null),
    totalCount: page.totalCount,
    requests: response.requests,
    remaining: response.remaining,
    limit: response.limit,
  };
}

function teamSide(rawTeam: unknown, homeTeam: string, awayTeam: string): 'home' | 'away' | null {
  const name = canonTeam(firstString(asMap(rawTeam).name, rawTeam));
  if (name === canonTeam(homeTeam)) return 'home';
  if (name === canonTeam(awayTeam)) return 'away';
  return null;
}

function playerName(value: unknown): string {
  const map = asMap(value);
  return firstString(map.name, map.displayName, map.shortName, map.fullName, value);
}

function playerRow(position: string): LineupPlayer['row'] {
  const p = position.toLowerCase();
  if (/goal|^gk?$/.test(p)) return 'gk';
  if (/back|def|^d$|cb|lb|rb/.test(p)) return 'def';
  if (/wing|attacking mid|am/.test(p)) return 'am';
  if (/forward|striker|^f$|st|cf/.test(p)) return 'fwd';
  return 'mid';
}

function lineupPlayers(value: unknown, starter: boolean): LineupPlayer[] {
  const flat = asArray(value).flatMap((item) => Array.isArray(item) ? item : [item]);
  return flat.map((item) => {
    const row = asMap(item);
    const player = asMap(row.player ?? item);
    const name = playerName(row.player ?? item);
    const pos = firstString(row.position, player.position, row.pos, player.pos);
    return {
      name,
      jersey: firstString(row.shirtNumber, row.jerseyNumber, row.number, player.shirtNumber, player.number) || undefined,
      pos: pos || undefined,
      row: playerRow(pos),
      starter,
    };
  }).filter((player) => !!player.name);
}

function normalizeTeamLineup(value: unknown) {
  const team = asMap(value);
  const startersRaw = team.initialLineup ?? team.startingLineup ?? team.starters ?? team.lineup;
  const subsRaw = team.substitutes ?? team.subs ?? team.bench;
  return {
    formation: firstString(team.formation) || undefined,
    starters: lineupPlayers(startersRaw, true),
    subs: lineupPlayers(subsRaw, false),
  };
}

export async function fetchHighlightlyLineups(
  matchId: number,
  homeTeam: string,
  awayTeam: string,
): Promise<{ lineups: MatchLineups | null } & HighlightlyBudget> {
  const response = await highlightlyGet(`/lineups/${matchId}`, {});
  const root = asMap(response.json);
  const data = Array.isArray(response.json) ? response.json : root.data ?? root.response ?? root;
  const map = asMap(data);
  const homeRaw = map.homeTeam ?? map.home;
  const awayRaw = map.awayTeam ?? map.away;
  let home = normalizeTeamLineup(homeRaw);
  let away = normalizeTeamLineup(awayRaw);
  // Některé varianty API vracejí pole týmů místo homeTeam/awayTeam.
  if (home.starters.length === 0 && away.starters.length === 0) {
    for (const item of asArray(data)) {
      const side = teamSide(asMap(item).team, homeTeam, awayTeam);
      if (side === 'home') home = normalizeTeamLineup(item);
      if (side === 'away') away = normalizeTeamLineup(item);
    }
  }
  const lineups = home.starters.length || away.starters.length || home.subs.length || away.subs.length
    ? { home, away }
    : null;
  return { lineups, requests: response.requests, remaining: response.remaining, limit: response.limit };
}

function statKey(name: string): keyof TeamStats | null {
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  if (/expected goals|\bxg\b/.test(n)) return 'xg';
  if (/shots on target|shots on goal/.test(n)) return 'sot';
  if (/total shots|shots total|^shots$/.test(n)) return 'shots';
  if (/corner/.test(n)) return 'corners';
  if (/possession/.test(n)) return 'possession';
  if (/accurate passes|completed passes|passes completed/.test(n)) return 'passes';
  if (/fouls?/.test(n)) return 'fouls';
  if (/cards?/.test(n)) return 'cards';
  return null;
}

function normalizeStats(value: unknown): TeamStats {
  const out: TeamStats = {};
  const map = asMap(value);
  const rows = asArray(map.statistics ?? map.stats ?? value);
  for (const rowValue of rows) {
    const row = asMap(rowValue);
    const name = firstString(row.displayName, row.name, row.type, row.key);
    const key = statKey(name);
    if (!key) continue;
    let valueText = firstString(row.displayValue, row.value, row.stat);
    if (!valueText) continue;
    if (key === 'possession') {
      const numeric = numberValue(valueText.replace('%', ''));
      if (numeric != null && numeric >= 0 && numeric <= 1) valueText = String(Math.round(numeric * 1000) / 10);
    }
    if (key === 'cards' && out.cards != null) {
      const previous = numberValue(out.cards) ?? 0;
      const next = numberValue(valueText) ?? 0;
      out.cards = String(previous + next);
    } else {
      out[key] = valueText;
    }
  }
  return out;
}

export async function fetchHighlightlyStatistics(
  matchId: number,
  homeTeam: string,
  awayTeam: string,
): Promise<{ stats: MatchDetail['stats'] | null } & HighlightlyBudget> {
  const response = await highlightlyGet(`/statistics/${matchId}`, {});
  const root = asMap(response.json);
  const data = Array.isArray(response.json) ? response.json : root.data ?? root.response ?? [];
  let home: TeamStats = {};
  let away: TeamStats = {};
  for (const item of asArray(data)) {
    const row = asMap(item);
    const side = teamSide(row.team, homeTeam, awayTeam);
    if (side === 'home') home = normalizeStats(item);
    if (side === 'away') away = normalizeStats(item);
  }
  const has = Object.keys(home).length > 0 || Object.keys(away).length > 0;
  return { stats: has ? { home, away } : null, requests: response.requests, remaining: response.remaining, limit: response.limit };
}

export async function fetchHighlightlyEvents(
  matchId: number,
  homeTeam: string,
  awayTeam: string,
): Promise<Pick<MatchDetail, 'goals' | 'cards' | 'substitutions'> & HighlightlyBudget> {
  const response = await highlightlyGet(`/events/${matchId}`, {});
  const root = asMap(response.json);
  const data = asArray(Array.isArray(response.json) ? response.json : root.data ?? root.response ?? []);
  const goals: NonNullable<MatchDetail['goals']> = [];
  const cards: NonNullable<MatchDetail['cards']> = [];
  const substitutions: NonNullable<MatchDetail['substitutions']> = [];
  for (const eventValue of data) {
    const event = asMap(eventValue);
    const type = firstString(event.type, event.eventType, event.description).toLowerCase();
    const side = teamSide(event.team, homeTeam, awayTeam);
    if (!side) continue;
    const minRaw = firstString(event.time, event.minute, event.clock);
    const min = minRaw ? (minRaw.includes("'") ? minRaw : `${minRaw}'`) : '?';
    if (/goal/.test(type)) {
      goals.push({
        min,
        side,
        player: playerName(event.player ?? event.scorer) || 'Neznámý střelec',
        kind: /own/.test(type) ? 'own' : /penalt/.test(type) ? 'penalty' : 'goal',
      });
    } else if (/yellow|red|card/.test(type)) {
      cards.push({
        min,
        side,
        player: playerName(event.player) || 'Neznámý hráč',
        color: /red/.test(type) ? 'red' : 'yellow',
      });
    } else if (/substitut|change/.test(type)) {
      substitutions.push({
        min,
        side,
        playerIn: playerName(event.playerIn ?? event.inPlayer ?? event.player),
        playerOut: playerName(event.playerOut ?? event.outPlayer ?? event.substituted ?? event.assistingPlayer),
      });
    }
  }
  return {
    goals,
    cards,
    substitutions,
    requests: response.requests,
    remaining: response.remaining,
    limit: response.limit,
  };
}

export function highlightlyToFixture(match: HighlightlyMatch, sourceLeague: string, round = 0, roundLabel = 'Příprava'): CompetitionFixture {
  return {
    external_api_id: match.id,
    source_league: sourceLeague,
    source_label: sourceLeague === 'highlightly.friendlies' ? 'Příprava' : 'Chance liga · Highlightly',
    round,
    round_label: roundLabel,
    kickoff: match.date,
    home_team: canonTeam(match.home.name),
    away_team: canonTeam(match.away.name),
    home_source_name: match.home.name,
    away_source_name: match.away.name,
    home_score: match.homeScore,
    away_score: match.awayScore,
    status: match.status,
    minute: match.minute,
    clock: match.clock,
    duration: match.duration,
    extra_home: null,
    extra_away: null,
    pen_home: match.penHome,
    pen_away: match.penAway,
  };
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
  if (sourceLeague.startsWith('uefa.')) return fetchEspnLeagueFixtures(sourceLeague, season, range);
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
  if (sourceLeague.startsWith('uefa.')) return fetchEspnFixturesByIds(sourceLeague, ids);
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
