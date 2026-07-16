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
}

interface EspnTeam {
  id?: string;
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
  season?: { year?: number; slug?: string };
  competitions?: {
    notes?: { headline?: string }[];
    type?: { text?: string };
    status?: {
      displayClock?: string;
      type?: { state?: string; completed?: boolean; detail?: string; shortDetail?: string };
    };
    competitors?: EspnCompetitor[];
  }[];
}

const SOURCE_LABELS: Record<string, string> = {
  'cze.1': 'Chance liga',
  'uefa.champions': 'Liga mistrů',
  'uefa.europa': 'Evropská liga',
  'uefa.europa.conf': 'Konferenční liga',
};

export function sourceLabel(slug: string): string {
  return SOURCE_LABELS[slug] ?? slug;
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function dateWindow(daysBack = 7, daysForward = 45): string {
  const now = new Date();
  return `${ymd(new Date(now.getTime() - daysBack * 864e5))}-${ymd(new Date(now.getTime() + daysForward * 864e5))}`;
}

function parseScore(value: string | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseMinute(clock: string | undefined): number | null {
  const m = (clock ?? '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

function mapStatus(state: string | undefined, completed: boolean | undefined): MatchStatus {
  if (completed || state === 'post') return 'finished';
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

function roundNumberFromText(text: string): number | null {
  const patterns = [
    /(?:matchday|week|round|kolo)\s*(\d{1,2})/i,
    /(\d{1,2})\.\s*(?:kolo)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return Number(m[1]);
  }
  return null;
}

function leagueRound(ev: EspnEvent): { round: number; label: string } {
  const comp = ev.competitions?.[0];
  const text = [
    ev.name,
    ev.shortName,
    comp?.type?.text,
    ...(comp?.notes?.map((n) => n.headline) ?? []),
  ].filter(Boolean).join(' ');
  const n = ev.week?.number ?? roundNumberFromText(text);
  if (n && n > 0) {
    if (n >= 31 && n <= 35) return { round: n, label: `Nadstavba · ${n - 30}. kolo` };
    if (n > 35) return { round: n, label: `Baráž · ${n - 35}. kolo` };
    return { round: n, label: `${n}. kolo` };
  }
  const wk = isoWeek(ev.date ?? new Date().toISOString());
  return { round: wk.week, label: `Týden ${wk.week}/${wk.year}` };
}

function europeRound(ev: EspnEvent): { round: number; label: string } {
  const wk = isoWeek(ev.date ?? new Date().toISOString());
  // Stabilní číselný klíč i přes přelom roku; sezóna 2026/27 tak nekoliduje.
  return {
    round: wk.year * 100 + wk.week,
    label: `Evropa · týden ${wk.week}/${wk.year}`,
  };
}

/**
 * Načte rozpis a aktuální výsledky jedné soutěže z ESPN scoreboardu.
 * ESPN je zde best-effort zdroj bez SLA; route vrací chybu čitelně a nic nemaže.
 */
export async function fetchCompetitionFixtures(
  slug: string,
  dates: string,
  mode: 'league' | 'europe',
): Promise<CompetitionFixture[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dates}&limit=500`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN ${slug} HTTP ${res.status}`);
  const data = (await res.json()) as { events?: EspnEvent[] };
  const out: CompetitionFixture[] = [];

  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!ev.id || !ev.date || !comp) continue;
    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    const h = canonTeam(home?.team?.displayName ?? home?.team?.name ?? home?.team?.shortDisplayName ?? '');
    const a = canonTeam(away?.team?.displayName ?? away?.team?.name ?? away?.team?.shortDisplayName ?? '');
    if (!h || !a || /\bTBD\b|to be determined/i.test(`${h} ${a}`)) continue;

    const state = comp.status?.type?.state;
    const completed = comp.status?.type?.completed;
    const r = mode === 'league' ? leagueRound(ev) : europeRound(ev);
    const clock = comp.status?.displayClock ?? comp.status?.type?.shortDetail ?? null;
    const statusText = `${comp.status?.type?.detail ?? ''} ${comp.status?.type?.shortDetail ?? ''}`;
    const duration: CompetitionFixture['duration'] = /penalt/i.test(statusText)
      ? 'PENALTY_SHOOTOUT'
      : /extra time|aet|prodlou/i.test(statusText)
        ? 'EXTRA_TIME'
        : 'REGULAR';
    const rawHomeScore = parseScore(home?.score);
    const rawAwayScore = parseScore(away?.score);

    out.push({
      external_api_id: Number(ev.id),
      source_league: slug,
      source_label: sourceLabel(slug),
      round: r.round,
      round_label: r.label,
      kickoff: ev.date,
      home_team: h,
      away_team: a,
      // U zápasu po prodloužení/penaltách scoreboard neposkytuje spolehlivě stav po 90'.
      // Raději body nepřepočítáme, než abychom je spočítali z nesprávného výsledku.
      home_score: completed && duration !== 'REGULAR' ? null : rawHomeScore,
      away_score: completed && duration !== 'REGULAR' ? null : rawAwayScore,
      status: mapStatus(state, completed),
      minute: state === 'in' ? parseMinute(clock ?? undefined) : null,
      clock: state === 'in' ? clock : null,
      duration,
    });
  }

  return out;
}
