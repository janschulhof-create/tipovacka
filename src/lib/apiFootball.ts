/**
 * Integrace API-Football (api-sports.io, v3) — pro MS 2026.
 *
 * ENV:
 *   API_FOOTBALL_KEY        – tvůj klíč z dashboard.api-football.com
 *   API_FOOTBALL_LEAGUE_ID  – Mistrovství světa = 1
 *   API_FOOTBALL_SEASON     – 2026
 *
 * Pozn.: API vrací anglické názvy týmů; my je překládáme do češtiny (TEAM_CZ),
 * aby šly spárovat s naseedovanými zápasy (které mají české názvy) a aby
 * sync jen DOPLNIL skóre/stav k existujícím zápasům, ne vytvořil duplicity.
 * Free plán: 100 requestů/den (rozpis = pár volání). Live data jsou na free
 * plánu zpožděná — viz dokumentace (LIVE.md).
 */

const BASE = 'https://v3.football.api-sports.io';

// EN → CZ názvy 48 týmů MS (klíč = malými písmeny bez diakritiky)
const TEAM_CZ: Record<string, string> = {
  mexico: 'Mexiko', 'south africa': 'Jižní Afrika', 'south korea': 'Jižní Korea',
  'czech republic': 'Česko', czechia: 'Česko', canada: 'Kanada',
  'bosnia and herzegovina': 'Bosna a Hercegovina', qatar: 'Katar', switzerland: 'Švýcarsko',
  brazil: 'Brazílie', morocco: 'Maroko', haiti: 'Haiti', scotland: 'Skotsko',
  usa: 'USA', 'united states': 'USA', paraguay: 'Paraguay', australia: 'Austrálie',
  turkey: 'Turecko', turkiye: 'Turecko', germany: 'Německo', curacao: 'Curaçao',
  'ivory coast': 'Pobřeží slonoviny', 'cote divoire': 'Pobřeží slonoviny', ecuador: 'Ekvádor',
  netherlands: 'Nizozemsko', japan: 'Japonsko', sweden: 'Švédsko', tunisia: 'Tunisko',
  belgium: 'Belgie', egypt: 'Egypt', iran: 'Írán', 'new zealand': 'Nový Zéland',
  spain: 'Španělsko', 'cape verde': 'Kapverdy', 'cabo verde': 'Kapverdy',
  'saudi arabia': 'Saúdská Arábie', uruguay: 'Uruguay', france: 'Francie', senegal: 'Senegal',
  iraq: 'Irák', norway: 'Norsko', argentina: 'Argentina', algeria: 'Alžírsko',
  austria: 'Rakousko', jordan: 'Jordánsko', portugal: 'Portugalsko',
  'dr congo': 'DR Kongo', 'congo dr': 'DR Kongo', uzbekistan: 'Uzbekistán',
  colombia: 'Kolumbie', england: 'Anglie', croatia: 'Chorvatsko', ghana: 'Ghana', panama: 'Panama',
};

function deaccent(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function toCz(name: string): string {
  const key = deaccent(name).toLowerCase().trim();
  return TEAM_CZ[key] ?? name; // neznámý tým necháme tak, jak přišel
}

interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  league: { round: string };
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
  minute: number | null;
}

function mapStatus(short: string): NormalizedMatch['status'] {
  if (['NS', 'TBD'].includes(short)) return 'scheduled';
  if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(short)) return 'live';
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished';
  if (['PST'].includes(short)) return 'postponed';
  if (['CANC', 'ABD', 'AWD', 'WO', 'SUSP'].includes(short)) return 'cancelled';
  return 'scheduled';
}

/**
 * Číslo „kola" z textu API:
 *  - skupinová fáze ("Group Stage - 1", "Group A - 1") => 1/2/3 (hrací den)
 *  - vyřazovací fáze => pevná čísla 4..9 (kvůli řazení po skupinách)
 */
function parseRound(round: string): number {
  const r = round.toLowerCase();
  if (r.includes('round of 32')) return 4;
  if (r.includes('round of 16')) return 5;
  if (r.includes('quarter')) return 6;
  if (r.includes('semi')) return 7;
  if (r.includes('3rd place') || r.includes('third place')) return 8;
  if (r.includes('final')) return 9;
  const m = round.match(/(\d+)\s*$/); // "Group Stage - 2" => 2
  return m ? parseInt(m[1], 10) : 0;
}

async function apiGet(path: string): Promise<{ response: ApiFixture[] }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Stáhne všechny zápasy soutěže pro danou sezónu a znormalizuje je (české názvy). */
export async function fetchSeasonFixtures(): Promise<NormalizedMatch[]> {
  const league = process.env.API_FOOTBALL_LEAGUE_ID ?? '1';
  const season = process.env.API_FOOTBALL_SEASON ?? '2026';
  const data = await apiGet(`/fixtures?league=${league}&season=${season}`);
  return data.response.map((f) => ({
    external_api_id: f.fixture.id,
    round: parseRound(f.league.round),
    kickoff: f.fixture.date,
    home_team: toCz(f.teams.home.name),
    away_team: toCz(f.teams.away.name),
    home_score: f.goals.home,
    away_score: f.goals.away,
    status: mapStatus(f.fixture.status.short),
    minute: f.fixture.status.elapsed,
  }));
}
