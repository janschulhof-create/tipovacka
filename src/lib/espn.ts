/**
 * Veřejné ESPN API (bez klíče) – MS 2026.
 *  - z minut gólů určí skóre v 90:00 (Pán nastavení) a stav po 90' (body);
 *  - detail zápasu: střelci, karty, stadion, návštěva;
 *  - bohaté statistiky (xG, velké šance, střely na branku, držení, přesné přihrávky,
 *    fauly) ze summary/boxscore (fetchEspnStats).
 *
 * Robustnost: stav po 90' = FINÁLNÍ skóre od ESPN − góly v prodloužení. Součet tak
 * vždy sedí na oficiální výsledek (i kdyby se nějaký gól nenapároval) → žádné "invalid".
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
  xg?: string;
  bigChances?: string;
  sot?: string; // střely na branku
  possession?: string;
  passes?: string; // přesné přihrávky
  fouls?: string;
}
export interface MatchDetail {
  venue?: string;
  city?: string;
  attendance?: number;
  goals?: GoalEvent[];
  cards?: CardEvent[];
  stats?: { home: TeamStats; away: TeamStats };
}

export interface EspnResult {
  homeCz: string;
  awayCz: string;
  homeId: string;
  awayId: string;
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
  detail: MatchDetail;
}

interface EspnDetailRaw {
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
interface EspnStatRaw {
  name?: string;
  displayValue?: string;
}
interface EspnCompetitor {
  homeAway?: string;
  score?: string;
  statistics?: EspnStatRaw[];
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

function sbStat(c: EspnCompetitor | undefined, name: string): string | undefined {
  return c?.statistics?.find((s) => s.name === name)?.displayValue;
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
    if (state === 'pre') continue;

    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    if (!home?.team?.id || !away?.team?.id) continue;
    const homeId = home.team.id;
    const awayId = away.team.id;
    const homeCz = toCz(home.team.name ?? home.team.displayName ?? '');
    const awayCz = toCz(away.team.name ?? away.team.displayName ?? '');

    // góly rozdělíme na: prodloužení / nastavení 2. pol. / penaltový rozstřel
    let etH = 0,
      etA = 0,
      stopH = 0,
      stopA = 0,
      penH = 0,
      penA = 0;
    let hasET = false;
    let hasPen = false;
    const goals: GoalEvent[] = [];
    const cards: CardEvent[] = [];

    for (const d of comp.details ?? []) {
      const disp = d.clock?.displayValue ?? '';
      const period = d.period ?? 0;
      const shootout = d.shootout === true;
      const player =
        d.athletesInvolved?.[0]?.shortName ?? d.athletesInvolved?.[0]?.displayName ?? '';
      const raw: 'home' | 'away' | null =
        d.team?.id === homeId ? 'home' : d.team?.id === awayId ? 'away' : null;

      if (d.yellowCard || d.redCard) {
        if (raw && !shootout) cards.push({ min: disp, side: raw, player, color: d.redCard ? 'red' : 'yellow' });
        continue;
      }
      if (d.scoringPlay !== true) continue;

      const kind: GoalEvent['kind'] = d.ownGoal ? 'own' : d.penaltyKick && !shootout ? 'penalty' : 'goal';
      // vlastní gól se připisuje soupeři (hráč je z bránícího týmu)
      const side: 'home' | 'away' | null = d.ownGoal && raw ? (raw === 'home' ? 'away' : 'home') : raw;
      if (!side) continue;

      if (shootout) {
        hasPen = true;
        if (side === 'home') penH++;
        else penA++;
        continue;
      }
      goals.push({ min: disp, side, player, kind });
      if (period >= 3) {
        hasET = true;
        if (side === 'home') etH++;
        else etA++;
        continue;
      }
      if (period === 2 && disp.includes('+')) {
        if (side === 'home') stopH++;
        else stopA++;
      }
    }

    // stav po 90' = finální skóre ESPN − góly v prodloužení; skóre v 90:00 = − nastavení 2. pol.
    const finalH = Number(home.score);
    const finalA = Number(away.score);
    const end90_home = finalH - etH;
    const end90_away = finalA - etA;
    const reg90_home = end90_home - stopH;
    const reg90_away = end90_away - stopA;

    const duration: EspnResult['duration'] = hasPen
      ? 'PENALTY_SHOOTOUT'
      : hasET
        ? 'EXTRA_TIME'
        : 'REGULAR';
    const hasOt = hasET || hasPen;

    const valid =
      completed &&
      Number.isFinite(finalH) &&
      Number.isFinite(finalA) &&
      end90_home >= 0 &&
      end90_away >= 0 &&
      reg90_home >= 0 &&
      reg90_away >= 0;

    const detail: MatchDetail = {
      venue: comp.venue?.fullName,
      city: comp.venue?.address?.city,
      attendance: comp.attendance,
      goals: goals.length ? goals : undefined,
      cards: cards.length ? cards : undefined,
      // záložní statistiky ze scoreboardu (summary je pak přepíše bohatšími)
      stats: {
        home: { possession: sbStat(home, 'possessionPct'), sot: sbStat(home, 'shotsOnTarget'), fouls: sbStat(home, 'foulsCommitted') },
        away: { possession: sbStat(away, 'possessionPct'), sot: sbStat(away, 'shotsOnTarget'), fouls: sbStat(away, 'foulsCommitted') },
      },
    };

    out.set(pairKey(homeCz, awayCz), {
      homeCz,
      awayCz,
      homeId,
      awayId,
      completed,
      clock: completed ? '' : (comp.status?.displayClock ?? ''),
      eventId: ev.id ?? '',
      reg90_home,
      reg90_away,
      end90_home,
      end90_away,
      duration,
      extra_home: hasOt ? finalH : null,
      extra_away: hasOt ? finalA : null,
      pen_home: hasPen ? penH : null,
      pen_away: hasPen ? penA : null,
      valid,
      detail,
    });
  }

  return out;
}

/** Bohaté statistiky ze summary/boxscore (best-effort; při chybě vrátí null). */
export async function fetchEspnStats(
  eventId: string,
  homeId: string,
  awayId: string,
): Promise<{ home: TeamStats; away: TeamStats } | null> {
  try {
    const res = await fetch(`${BASE}/summary?event=${eventId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      boxscore?: { teams?: { team?: { id?: string }; statistics?: { label?: string; displayValue?: string }[] }[] };
    };
    const teams = data?.boxscore?.teams;
    if (!Array.isArray(teams) || teams.length < 2) return null;
    const extract = (t: (typeof teams)[number] | undefined): TeamStats => {
      const st = t?.statistics ?? [];
      const pick = (...needles: string[]): string | undefined =>
        st.find((x) => needles.some((n) => (x.label ?? '').toLowerCase().includes(n)))?.displayValue;
      return {
        xg: pick('expected goals'),
        bigChances: pick('big chances created'),
        sot: pick('shots on goal', 'shots on target'),
        possession: pick('possession'),
        passes: pick('accurate passes'),
        fouls: pick('fouls committed', 'fouls'),
      };
    };
    const byId = new Map(teams.map((t) => [t?.team?.id, t]));
    const h = byId.get(homeId) ?? teams[0];
    const a = byId.get(awayId) ?? teams[1];
    return { home: extract(h), away: extract(a) };
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
    goals: d.goals?.map((g) => ({ ...g, side: flip(g.side) })),
    cards: d.cards?.map((c) => ({ ...c, side: flip(c.side) })),
    stats: d.stats ? { home: d.stats.away, away: d.stats.home } : undefined,
  };
}
