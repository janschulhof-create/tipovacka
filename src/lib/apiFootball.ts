/**
 * Integrace football-data.org (v4) — pro MS 2026.
 * Soutěž FIFA World Cup (kód "WC", id 2000) je dostupná i v BEZPLATNÉM tieru.
 *
 * ENV:
 *   FOOTBALL_DATA_TOKEN        – tvůj free token z football-data.org/client/register
 *   FOOTBALL_DATA_COMPETITION  – volitelně, default "WC"
 *
 * Free tier: 10 requestů/min (jeden sync = 1 request). Endpoint vrací anglické
 * názvy týmů; překládáme je do češtiny (TEAM_CZ), aby šly spárovat s naseedovanými
 * zápasy a sync jen DOPLNIL skóre/stav (tipy zůstanou).
 *
 * Pozn.: tento endpoint nevrací živou minutu, takže u živých zápasů uvidíš stav
 * "živě" a skóre, ale ne minutu.
 */

const BASE = 'https://api.football-data.org/v4';

// EN → CZ názvy 48 týmů MS (klíč = malými písmeny, bez diakritiky a interpunkce)
const TEAM_CZ: Record<string, string> = {
  mexico: 'Mexiko', 'south africa': 'Jižní Afrika',
  'south korea': 'Jižní Korea', 'korea republic': 'Jižní Korea', korea: 'Jižní Korea',
  'czech republic': 'Česko', czechia: 'Česko', canada: 'Kanada',
  'bosnia and herzegovina': 'Bosna a Hercegovina', 'bosnia herzegovina': 'Bosna a Hercegovina', 'bosniaherzegovina': 'Bosna a Hercegovina',
  qatar: 'Katar', switzerland: 'Švýcarsko', brazil: 'Brazílie', morocco: 'Maroko',
  haiti: 'Haiti', scotland: 'Skotsko', usa: 'USA', 'united states': 'USA',
  paraguay: 'Paraguay', australia: 'Austrálie', turkey: 'Turecko', turkiye: 'Turecko',
  germany: 'Německo', curacao: 'Curaçao',
  'ivory coast': 'Pobřeží slonoviny', 'cote divoire': 'Pobřeží slonoviny',
  ecuador: 'Ekvádor', netherlands: 'Nizozemsko', japan: 'Japonsko', sweden: 'Švédsko',
  tunisia: 'Tunisko', belgium: 'Belgie', egypt: 'Egypt', iran: 'Írán', 'ir iran': 'Írán',
  'new zealand': 'Nový Zéland', spain: 'Španělsko',
  'cape verde': 'Kapverdy', 'cabo verde': 'Kapverdy', 'cape verde islands': 'Kapverdy',
  'saudi arabia': 'Saúdská Arábie', uruguay: 'Uruguay', france: 'Francie', senegal: 'Senegal',
  iraq: 'Irák', norway: 'Norsko', argentina: 'Argentina', algeria: 'Alžírsko',
  austria: 'Rakousko', jordan: 'Jordánsko', portugal: 'Portugalsko',
  'dr congo': 'DR Kongo', 'congo dr': 'DR Kongo', 'democratic republic of congo': 'DR Kongo',
  uzbekistan: 'Uzbekistán', colombia: 'Kolumbie', england: 'Anglie', croatia: 'Chorvatsko',
  ghana: 'Ghana', panama: 'Panama',
};

function normKey(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}
function toCz(name: string): string {
  return TEAM_CZ[normKey(name)] ?? name;
}

interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  stage: string;
  homeTeam: { name: string | null };
  awayTeam: { name: string | null };
  score: {
    duration?: string;
    fullTime: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null } | null;
    extraTime?: { home: number | null; away: number | null } | null;
    penalties?: { home: number | null; away: number | null } | null;
  };
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
  duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  extra_home: number | null;
  extra_away: number | null;
  pen_home: number | null;
  pen_away: number | null;
}

function mapStatus(s: string): NormalizedMatch['status'] {
  if (['SCHEDULED', 'TIMED'].includes(s)) return 'scheduled';
  if (['IN_PLAY', 'PAUSED'].includes(s)) return 'live';
  if (['FINISHED', 'AWARDED'].includes(s)) return 'finished';
  if (['POSTPONED'].includes(s)) return 'postponed';
  if (['SUSPENDED', 'CANCELLED'].includes(s)) return 'cancelled';
  return 'scheduled';
}

/** Skupina → hrací den (1/2/3), play-off → pevná čísla 4..9. */
function parseRound(stage: string, matchday: number | null): number {
  switch (stage) {
    case 'LAST_32': return 4;
    case 'LAST_16': return 5;
    case 'QUARTER_FINALS': return 6;
    case 'SEMI_FINALS': return 7;
    case 'THIRD_PLACE': return 8;
    case 'FINAL': return 9;
    default: return matchday ?? 0; // GROUP_STAGE
  }
}

async function apiGet(path: string): Promise<{ matches: FdMatch[] }> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error('Chybí ENV FOOTBALL_DATA_TOKEN (nenastaveno nebo bez redeploye).');
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'X-Auth-Token': token },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { message?: string }).message ?? JSON.stringify(json).slice(0, 300);
    throw new Error(`football-data.org HTTP ${res.status}: ${msg}`);
  }
  return json as { matches: FdMatch[] };
}

/** Stáhne zápasy MS a znormalizuje je (české názvy týmů). */
export async function fetchSeasonFixtures(): Promise<NormalizedMatch[]> {
  const comp = process.env.FOOTBALL_DATA_COMPETITION ?? 'WC';
  const data = await apiGet(`/competitions/${comp}/matches`);
  return (data.matches ?? []).map((m) => {
    const s = m.score ?? ({} as FdMatch['score']);
    const ft = s.fullTime ?? { home: null, away: null };
    const rt = s.regularTime ?? null;
    const et = s.extraTime ?? null;
    const pen = s.penalties ?? null;
    const duration: NormalizedMatch['duration'] =
      s.duration === 'EXTRA_TIME' || s.duration === 'PENALTY_SHOOTOUT' ? s.duration : 'REGULAR';

    // Body se počítají podle stavu po 90 minutách:
    //  - regularTime (u prodloužení/penalt), jinak fullTime (skupiny / rozhodnuto v 90').
    const home90 = rt?.home ?? ft.home ?? null;
    const away90 = rt?.away ?? ft.away ?? null;

    // Skutečný výsledek (prodloužení/penalty) – jen pro zobrazení, bez vlivu na body.
    let extra_home: number | null = null;
    let extra_away: number | null = null;
    let pen_home: number | null = null;
    let pen_away: number | null = null;
    if (duration === 'EXTRA_TIME') {
      extra_home = ft.home ?? null; // fullTime = regularTime + extraTime
      extra_away = ft.away ?? null;
    } else if (duration === 'PENALTY_SHOOTOUT') {
      pen_home = pen?.home ?? null;
      pen_away = pen?.away ?? null;
      if (rt && et) {
        extra_home = (rt.home ?? 0) + (et.home ?? 0);
        extra_away = (rt.away ?? 0) + (et.away ?? 0);
      } else if (ft.home != null && pen_home != null) {
        extra_home = ft.home - pen_home; // fullTime sčítá i penalty
        extra_away = (ft.away ?? 0) - (pen_away ?? 0);
      } else {
        extra_home = ft.home ?? null;
        extra_away = ft.away ?? null;
      }
    }

    return {
      external_api_id: m.id,
      round: parseRound(m.stage, m.matchday),
      kickoff: m.utcDate,
      home_team: toCz(m.homeTeam?.name ?? ''),
      away_team: toCz(m.awayTeam?.name ?? ''),
      home_score: home90,
      away_score: away90,
      status: mapStatus(m.status),
      minute: null,
      duration,
      extra_home,
      extra_away,
      pen_home,
      pen_away,
    };
  });
}

// ── Detail zápasu: skóre v 90:00 pro „Pán nastavení" ────────────────────────────
interface FdGoalEvent {
  minute: number | null;
  injuryTime: number | null;
  score: { home: number | null; away: number | null } | null;
}
interface FdMatchDetail {
  status: string;
  score?: { fullTime?: { home: number | null; away: number | null } };
  goals?: FdGoalEvent[] | null;
}

async function apiGetRaw<T>(path: string): Promise<T> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error('Chybí ENV FOOTBALL_DATA_TOKEN.');
  const res = await fetch(`${BASE}${path}`, { headers: { 'X-Auth-Token': token }, cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { message?: string }).message ?? `HTTP ${res.status}`;
    throw new Error(`football-data.org ${msg}`);
  }
  return json as T;
}

/**
 * Z detailu zápasu spočítá skóre v 90:00 (před góly v nastavení 2. poločasu).
 * Gól v nastavení 2. poločasu = minute === 90 && injuryTime > 0 (tj. 90'+X).
 * `45'+X` i řádné `90'` (injuryTime null) se počítají do skóre v 90:00.
 * available=false, pokud feed góly nevrací (např. free tier je u zápasu skrývá).
 */
export async function fetchMatchDetailReg(externalId: number): Promise<{
  available: boolean;
  hadStoppage: boolean;
  regHome: number | null;
  regAway: number | null;
}> {
  const d = await apiGetRaw<FdMatchDetail>(`/matches/${externalId}`);
  const fh = d.score?.fullTime?.home ?? 0;
  const fa = d.score?.fullTime?.away ?? 0;
  const goals = Array.isArray(d.goals) ? d.goals : null;
  if (!goals || (fh + fa > 0 && goals.length === 0)) {
    return { available: false, hadStoppage: false, regHome: null, regAway: null };
  }
  let regH = 0;
  let regA = 0;
  let hadStoppage = false;
  for (const g of goals) {
    const isStoppage2H = (g.minute ?? 0) === 90 && (g.injuryTime ?? 0) > 0;
    if (isStoppage2H) {
      hadStoppage = true;
      continue;
    }
    if (typeof g.score?.home === 'number' && typeof g.score?.away === 'number') {
      regH = g.score.home;
      regA = g.score.away;
    }
  }
  if (!hadStoppage) return { available: true, hadStoppage: false, regHome: null, regAway: null };
  return { available: true, hadStoppage: true, regHome: regH, regAway: regA };
}
