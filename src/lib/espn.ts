/**
 * Veřejné ESPN API (bez klíče) – MS 2026.
 *  - z minut gólů dopočítá skóre v 90:00 (Pán nastavení), stav po 90' (body) a
 *    skutečný výsledek po prodloužení + penalty;
 *  - vytáhne detail zápasu: střelci, karty, statistiky, forma, stadion, návštěva;
 *  - sestavy/rozestavení dobere ze summary endpointu (fetchEspnLineups).
 *
 * Dopočet skóre se ověří proti finálnímu skóre od ESPN – když nesedí, zápas se
 * v syncu přeskočí (radši nechat na ručním doplnění, nikdy nezapsat nesmysl).
 */
import { toCz, normKey } from './apiFootball';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';
const SCOREBOARD = `${BASE}/scoreboard?dates=20260611-20260720&limit=300`;

export interface GoalEvent {
  min: string;
  side: 'home' | 'away';
  player: string;
  kind: 'goal' | 'penalty' | 'own';
}
export interface CardEvent {
  min: string;
  side: 'home' | 'away';
  player: string;
  color: 'yellow' | 'red';
}
export interface TeamStats {
  possession?: string;
  shots?: string;
  sot?: string;
  corners?: string;
  fouls?: string;
}
export interface LineupPlayer {
  name: string;
  pos?: string;
  num?: string;
  starter: boolean;
}
export interface Lineup {
  formation?: string;
  players: LineupPlayer[];
}
export interface MatchDetail {
  venue?: string;
  city?: string;
  attendance?: number;
  homeForm?: string;
  awayForm?: string;
  goals?: GoalEvent[];
  cards?: CardEvent[];
  stats?: { home: TeamStats; away: TeamStats };
  lineups?: { home: Lineup; away: Lineup };
}

export interface EspnResult {
  homeCz: string;
  awayCz: string;
  completed: boolean;
  clock: string; // živá minuta ("90'+8'"), u dohraných ''
  eventId: string;
  reg90_home: number;
  reg90_away: number;
  end90_home: number;
  end90_away: number;
  duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  extra_home: number | null;
  extra_away: number | null;
  pen_home: number | null;
  pen_away: number | null;
  valid: boolean;
  detail: MatchDetail; // v ESPN orientaci (home = ESPN domácí)
}

interface EspnDetailRaw {
  type?: { text?: string };
  clock?: { displayValue?: string };
  team?: { id?: string };
  scoringPlay?: boolean;
  ownGoal?: boolean;
  penaltyKick?: boolean;
  yellowCard?: boolean;
  redCard?: boolean;
  shootout?: boolean;
  period?: number;
  athletesInvolved?: { shortName?: string; displayName?: string }[];
}
interface EspnStat {
  name?: string;
  displayValue?: string;
}
interface EspnCompetitor {
  homeAway?: string;
  score?: string;
  form?: string;
  statistics?: EspnStat[];
  team?: { id?: string; name?: string; displayName?: string };
}
interface EspnEvent {
  id?: string;
  competitions?: {
    attendance?: number;
    status?: { displayClock?: string; type?: { completed?: boolean; state?: string } };
    venue?: { fullName?: string; address?: { city?: string } };
    competitors?: EspnCompetitor[];
    details?: EspnDetailRaw[];
  }[];
}

export function pairKey(a: string, b: string): string {
  return [normKey(a), normKey(b)].sort().join('|');
}

function statOf(c: EspnCompetitor | undefined, name: string): string | undefined {
  return c?.statistics?.find((s) => s.name === name)?.displayValue;
}
function teamStats(c: EspnCompetitor | undefined): TeamStats {
  return {
    possession: statOf(c, 'possessionPct'),
    shots: statOf(c, 'totalShots'),
    sot: statOf(c, 'shotsOnTarget'),
    corners: statOf(c, 'wonCorners'),
    fouls: statOf(c, 'foulsCommitted'),
  };
}

export async function fetchEspnResults(): Promise<Map<string, EspnResult>> {
  const res = await fetch(SCOREBOARD, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  const data = (await res.json()) as { events?: EspnEvent[] };
  const out = new Map<string, EspnResult>();

  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const state = comp.status?.type?.state; // 'pre' | 'in' | 'post'
    const completed = comp.status?.type?.completed === true;
    if (state === 'pre') continue; // nezačaté nezpracováváme

    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    if (!home?.team?.id || !away?.team?.id) continue;
    const homeId = home.team.id;
    const awayId = away.team.id;
    const homeCz = toCz(home.team.name ?? home.team.displayName ?? '');
    const awayCz = toCz(away.team.name ?? away.team.displayName ?? '');

    let reg90_home = 0,
      reg90_away = 0,
      end90_home = 0,
      end90_away = 0,
      et_home = 0,
      et_away = 0,
      pen_home = 0,
      pen_away = 0;
    let hasET = false;
    let hasPen = false;
    const goals: GoalEvent[] = [];
    const cards: CardEvent[] = [];

    for (const d of comp.details ?? []) {
      const disp = d.clock?.displayValue ?? '';
      const period = d.period ?? 0;
      const shootout = d.shootout === true;
      const player = d.athletesInvolved?.[0]?.shortName ?? d.athletesInvolved?.[0]?.displayName ?? '';

      let side: 'home' | 'away' | null =
        d.team?.id === homeId ? 'home' : d.team?.id === awayId ? 'away' : null;

      // karty
      if (d.yellowCard || d.redCard) {
        if (side && !shootout) cards.push({ min: disp, side, player, color: d.redCard ? 'red' : 'yellow' });
        continue;
      }
      if (d.scoringPlay !== true) continue; // dál jen góly

      const kind: GoalEvent['kind'] = d.ownGoal ? 'own' : d.penaltyKick && !shootout ? 'penalty' : 'goal';
      if (d.ownGoal && side) side = side === 'home' ? 'away' : 'home'; // vlastňák → soupeři
      if (!side) continue;
      const H = side === 'home';

      if (shootout) {
        hasPen = true;
        if (H) pen_home++;
        else pen_away++;
        continue; // penalty se do gólů zápasu nezapisují
      }
      goals.push({ min: disp, side, player, kind });
      if (period >= 3) {
        hasET = true;
        if (H) et_home++;
        else et_away++;
        continue;
      }
      if (H) end90_home++;
      else end90_away++;
      const is2ndHalfStoppage = period === 2 && disp.includes('+');
      if (!is2ndHalfStoppage) {
        if (H) reg90_home++;
        else reg90_away++;
      }
    }

    const duration: EspnResult['duration'] = hasPen
      ? 'PENALTY_SHOOTOUT'
      : hasET
        ? 'EXTRA_TIME'
        : 'REGULAR';
    const hasOt = hasET || hasPen;

    const espnHome = Number(home.score);
    const espnAway = Number(away.score);
    const valid =
      completed &&
      Number.isFinite(espnHome) &&
      Number.isFinite(espnAway) &&
      end90_home + et_home === espnHome &&
      end90_away + et_away === espnAway;

    const detail: MatchDetail = {
      venue: comp.venue?.fullName,
      city: comp.venue?.address?.city,
      attendance: comp.attendance,
      homeForm: home.form,
      awayForm: away.form,
      goals: goals.length ? goals : undefined,
      cards: cards.length ? cards : undefined,
      stats: { home: teamStats(home), away: teamStats(away) },
    };

    out.set(pairKey(homeCz, awayCz), {
      homeCz,
      awayCz,
      completed,
      clock: completed ? '' : (comp.status?.displayClock ?? ''),
      eventId: ev.id ?? '',
      reg90_home,
      reg90_away,
      end90_home,
      end90_away,
      duration,
      extra_home: hasOt ? end90_home + et_home : null,
      extra_away: hasOt ? end90_away + et_away : null,
      pen_home: hasPen ? pen_home : null,
      pen_away: hasPen ? pen_away : null,
      valid,
      detail,
    });
  }

  return out;
}

/** Sestavy/rozestavení ze summary endpointu (best-effort; při chybě vrátí null). */
export async function fetchEspnLineups(
  eventId: string,
): Promise<{ home: Lineup; away: Lineup } | null> {
  try {
    const res = await fetch(`${BASE}/summary?event=${eventId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      rosters?: {
        homeAway?: string;
        formation?: string;
        team?: { id?: string };
        roster?: {
          starter?: boolean;
          athlete?: { shortName?: string; displayName?: string; jersey?: string };
          position?: { abbreviation?: string };
          formationPlace?: string;
        }[];
      }[];
    };
    const rosters = data.rosters;
    if (!Array.isArray(rosters) || rosters.length < 2) return null;
    const parse = (r: (typeof rosters)[number] | undefined): Lineup => ({
      formation: r?.formation,
      players: (r?.roster ?? []).map((p) => ({
        name: p?.athlete?.shortName ?? p?.athlete?.displayName ?? '?',
        pos: p?.position?.abbreviation,
        num: p?.athlete?.jersey,
        starter: p?.starter === true,
      })),
    });
    const home = rosters.find((x) => x.homeAway === 'home') ?? rosters[0];
    const away = rosters.find((x) => x.homeAway === 'away') ?? rosters[1];
    return { home: parse(home), away: parse(away) };
  } catch {
    return null;
  }
}

/** Otočí detail do orientace zápasu v DB (home = domácí v appce). */
export function orientDetail(d: MatchDetail, same: boolean): MatchDetail {
  if (same) return d;
  const flip = (s: 'home' | 'away'): 'home' | 'away' => (s === 'home' ? 'away' : 'home');
  return {
    venue: d.venue,
    city: d.city,
    attendance: d.attendance,
    homeForm: d.awayForm,
    awayForm: d.homeForm,
    goals: d.goals?.map((g) => ({ ...g, side: flip(g.side) })),
    cards: d.cards?.map((c) => ({ ...c, side: flip(c.side) })),
    stats: d.stats ? { home: d.stats.away, away: d.stats.home } : undefined,
    lineups: d.lineups ? { home: d.lineups.away, away: d.lineups.home } : undefined,
  };
}
