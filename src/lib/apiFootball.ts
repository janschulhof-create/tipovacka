/**
 * Integrace API-Football (api-sports.io, v3).
 *
 * Proč API-Football:
 *  - pokrývá 1200+ soutěží včetně české Chance Ligy (1. liga),
 *  - stabilní league ID, rozpis + průběžné výsledky + stav utkání,
 *  - free plán 100 requestů/den bohatě stačí (jeden sync = pár volání).
 * Football-data.org má Chance Ligu jen v placeném plánu, SofaScore
 * nemá oficiální veřejné API → proto API-Football.
 *
 * League ID česká 1. liga = ENV API_FOOTBALL_LEAGUE_ID.
 * Ověř/najdi ho jednorázově přes:
 *   GET /leagues?country=Czech-Republic&season=2025
 * a ulož do .env.
 */

const BASE = 'https://v3.football.api-sports.io';

interface ApiFixture {
  fixture: {
    id: number;
    date: string; // ISO
    status: { short: string }; // NS, 1H, HT, 2H, FT, PST, CANC ...
  };
  league: { round: string }; // "Regular Season - 8"
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
}

export interface NormalizedMatch {
  external_api_id: number;
  round: number;
  kickoff: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
}

function mapStatus(short: string): NormalizedMatch['status'] {
  if (['NS', 'TBD'].includes(short)) return 'scheduled';
  if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(short)) return 'live';
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished';
  if (['PST'].includes(short)) return 'postponed';
  if (['CANC', 'ABD', 'AWD', 'WO', 'SUSP'].includes(short)) return 'cancelled';
  return 'scheduled';
}

function parseRound(round: string): number {
  const m = round.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 0;
}

async function apiGet(path: string): Promise<{ response: ApiFixture[] }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! },
    // necachujeme – chceme aktuální výsledky
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Stáhne všechny zápasy ligy pro danou sezónu a znormalizuje je. */
export async function fetchSeasonFixtures(): Promise<NormalizedMatch[]> {
  const league = process.env.API_FOOTBALL_LEAGUE_ID;
  const season = process.env.API_FOOTBALL_SEASON;
  const data = await apiGet(`/fixtures?league=${league}&season=${season}`);
  return data.response.map((f) => ({
    external_api_id: f.fixture.id,
    round: parseRound(f.league.round),
    kickoff: f.fixture.date,
    home_team: f.teams.home.name,
    away_team: f.teams.away.name,
    home_score: f.goals.home,
    away_score: f.goals.away,
    status: mapStatus(f.fixture.status.short),
  }));
}
