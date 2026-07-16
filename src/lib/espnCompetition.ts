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

const API_BASE = 'https://v3.football.api-sports.io';

const SOURCE_LABELS: Record<string, string> = {
  'cze.1': 'Chance liga',
  'uefa.champions': 'Liga mistrů',
  'uefa.europa': 'Evropská liga',
  'uefa.europa.conf': 'Konferenční liga',
};

const DEFAULT_LEAGUE_IDS: Record<string, number> = {
  'cze.1': 345,
  'uefa.champions': 2,
  'uefa.europa': 3,
  'uefa.europa.conf': 848,
};

const ENV_LEAGUE_IDS: Record<string, string> = {
  'cze.1': 'API_FOOTBALL_LIGA_ID',
  'uefa.champions': 'API_FOOTBALL_CHAMPIONS_ID',
  'uefa.europa': 'API_FOOTBALL_EUROPA_ID',
  'uefa.europa.conf': 'API_FOOTBALL_CONFERENCE_ID',
};

export function sourceLabel(slug: string): string {
  return SOURCE_LABELS[slug] ?? slug;
}

export function apiFootballKey(): string | null {
  return (
    process.env.API_FOOTBALL_KEY ??
    process.env.APISPORTS_KEY ??
    process.env.API_SPORTS_KEY ??
    null
  );
}

export function sourceLeagueId(slug: string): number {
  const envName = ENV_LEAGUE_IDS[slug];
  const configured = envName ? Number(process.env[envName]) : Number.NaN;
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_LEAGUE_IDS[slug];
}

function sourceSlugByLeagueId(id: number): string | null {
  for (const slug of Object.keys(DEFAULT_LEAGUE_IDS)) {
    if (sourceLeagueId(slug) === id) return slug;
  }
  return null;
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

interface ApiTeam {
  id?: number;
  name?: string;
}

interface ApiFixtureItem {
  fixture?: {
    id?: number;
    date?: string;
    status?: {
      long?: string;
      short?: string;
      elapsed?: number | null;
      extra?: number | null;
    };
  };
  league?: {
    id?: number;
    name?: string;
    round?: string;
  };
  teams?: {
    home?: ApiTeam;
    away?: ApiTeam;
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
  score?: {
    halftime?: { home?: number | null; away?: number | null } | null;
    fulltime?: { home?: number | null; away?: number | null } | null;
    extratime?: { home?: number | null; away?: number | null } | null;
    penalty?: { home?: number | null; away?: number | null } | null;
  };
}

interface ApiEnvelope {
  errors?: unknown;
  results?: number;
  response?: ApiFixtureItem[];
}

function errorText(errors: unknown): string | null {
  if (!errors) return null;
  if (Array.isArray(errors)) return errors.length ? errors.map(String).join('; ') : null;
  if (typeof errors === 'object') {
    const entries = Object.entries(errors as Record<string, unknown>);
    return entries.length ? entries.map(([k, v]) => `${k}: ${String(v)}`).join('; ') : null;
  }
  return String(errors);
}

async function apiGet(path: string): Promise<{ data: ApiEnvelope; remaining: number | null }> {
  const key = apiFootballKey();
  if (!key) {
    throw new Error(
      'Chybí API_FOOTBALL_KEY ve Vercelu. Stávající cron zůstává beze změny; je nutné pouze doplnit klíč API-Football do Environment Variables a udělat redeploy.',
    );
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-apisports-key': key },
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as ApiEnvelope;
  const apiError = errorText(data.errors);
  if (!res.ok || apiError) {
    throw new Error(
      `API-Football HTTP ${res.status}${apiError ? `: ${apiError}` : ''}`,
    );
  }

  const remainingRaw = res.headers.get('x-ratelimit-requests-remaining');
  const remaining = remainingRaw == null ? null : Number(remainingRaw);
  return { data, remaining: Number.isFinite(remaining) ? remaining : null };
}

function mapStatus(code: string | undefined): MatchStatus {
  if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(code ?? '')) return 'live';
  if (['FT', 'AET', 'PEN', 'AWD', 'WO'].includes(code ?? '')) return 'finished';
  if (code === 'PST') return 'postponed';
  if (['CANC', 'ABD', 'SUSP'].includes(code ?? '')) return 'cancelled';
  return 'scheduled';
}

function durationOf(item: ApiFixtureItem): CompetitionFixture['duration'] {
  const code = item.fixture?.status?.short;
  if (code === 'PEN' || item.score?.penalty?.home != null || item.score?.penalty?.away != null) {
    return 'PENALTY_SHOOTOUT';
  }
  if (code === 'AET' || item.score?.extratime?.home != null || item.score?.extratime?.away != null) {
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

function trailingNumber(text: string): number | null {
  const m = text.match(/(?:^|\D)(\d{1,2})\s*$/);
  return m ? Number(m[1]) : null;
}

function leagueRound(text: string, kickoff: string): { round: number; label: string } {
  const n = trailingNumber(text);
  if (/regular season/i.test(text) && n) return { round: n, label: `${n}. kolo` };
  if (/(championship|relegation|group|nadstav)/i.test(text) && n) {
    return { round: 30 + n, label: `Nadstavba · ${n}. kolo` };
  }
  if (/(play.?off|relegation play)/i.test(text) && n) {
    return { round: 40 + n, label: `Play-off · ${n}. zápas` };
  }
  if (n) return { round: n, label: text || `${n}. kolo` };
  const wk = isoWeek(kickoff);
  return { round: wk.week, label: text || `Týden ${wk.week}/${wk.year}` };
}

function europeRound(sourceLeague: string, text: string, kickoff: string): { round: number; label: string } {
  const wk = isoWeek(kickoff);
  return {
    round: wk.year * 100 + wk.week,
    label: `${sourceLabel(sourceLeague)} · ${text || `týden ${wk.week}/${wk.year}`}`,
  };
}

function normalizeFixture(item: ApiFixtureItem, forcedSource?: string): CompetitionFixture | null {
  const eventId = item.fixture?.id;
  const kickoff = item.fixture?.date;
  const leagueId = item.league?.id;
  const sourceLeague = forcedSource ?? (leagueId != null ? sourceSlugByLeagueId(leagueId) : null);
  if (!eventId || !kickoff || !sourceLeague) return null;

  const home = canonTeam(item.teams?.home?.name ?? '');
  const away = canonTeam(item.teams?.away?.name ?? '');
  if (!home || !away || /\bTBD\b|to be determined/i.test(`${home} ${away}`)) return null;

  const statusCode = item.fixture?.status?.short;
  const status = mapStatus(statusCode);
  const duration = durationOf(item);
  const roundText = item.league?.round ?? '';
  const r = sourceLeague === 'cze.1'
    ? leagueRound(roundText, kickoff)
    : europeRound(sourceLeague, roundText, kickoff);

  const finished = status === 'finished';
  const fullHome = item.score?.fulltime?.home ?? null;
  const fullAway = item.score?.fulltime?.away ?? null;
  const goalsHome = item.goals?.home ?? null;
  const goalsAway = item.goals?.away ?? null;

  // Pro AET/PEN je score.fulltime stav po 90 minutách. Pro běžný zápas je
  // bezpečná záloha goals, pokud fulltime ještě ve feedu chybí.
  const homeScore = finished
    ? (fullHome ?? (duration === 'REGULAR' ? goalsHome : null))
    : goalsHome;
  const awayScore = finished
    ? (fullAway ?? (duration === 'REGULAR' ? goalsAway : null))
    : goalsAway;

  const elapsed = item.fixture?.status?.elapsed ?? null;
  const extraMinute = item.fixture?.status?.extra ?? null;
  const clock = status === 'live' && elapsed != null
    ? `${elapsed}${extraMinute ? `+${extraMinute}` : ''}'`
    : null;

  return {
    external_api_id: eventId,
    source_league: sourceLeague,
    source_label: sourceLabel(sourceLeague),
    round: r.round,
    round_label: r.label,
    kickoff,
    home_team: home,
    away_team: away,
    home_score: homeScore,
    away_score: awayScore,
    status,
    minute: status === 'live' ? elapsed : null,
    clock,
    duration,
    extra_home: duration !== 'REGULAR' ? goalsHome : null,
    extra_away: duration !== 'REGULAR' ? goalsAway : null,
    pen_home: item.score?.penalty?.home ?? null,
    pen_away: item.score?.penalty?.away ?? null,
  };
}

/** Celá sezóna nebo omezené datumové okno jedné soutěže. */
export async function fetchApiFootballLeagueFixtures(
  sourceLeague: string,
  season: number,
  range?: { from: string; to: string },
): Promise<ApiFetchResult> {
  const leagueId = sourceLeagueId(sourceLeague);
  const params = new URLSearchParams({
    league: String(leagueId),
    season: String(season),
    timezone: 'UTC',
  });
  if (range) {
    params.set('from', range.from);
    params.set('to', range.to);
  }
  const { data, remaining } = await apiGet(`/fixtures?${params.toString()}`);
  const fixtures = (data.response ?? [])
    .map((item) => normalizeFixture(item, sourceLeague))
    .filter((item): item is CompetitionFixture => item !== null);
  return { fixtures, requests: 1, remaining };
}

/** Aktualizace konkrétních právě hraných zápasů jedním API voláním (max. 20 ID). */
export async function fetchApiFootballFixturesByIds(ids: number[]): Promise<ApiFetchResult> {
  const unique = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0))).slice(0, 20);
  if (unique.length === 0) return { fixtures: [], requests: 0, remaining: null };
  const { data, remaining } = await apiGet(`/fixtures?ids=${unique.join('-')}&timezone=UTC`);
  const fixtures = (data.response ?? [])
    .map((item) => normalizeFixture(item))
    .filter((item): item is CompetitionFixture => item !== null);
  return { fixtures, requests: 1, remaining };
}
