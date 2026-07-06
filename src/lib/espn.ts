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
  shots?: string; // střely celkem
  sot?: string; // střely na branku
  corners?: string; // rohy
  possession?: string;
  passes?: string; // přesné přihrávky
  fouls?: string;
  cards?: string; // karty (žluté + červené)
}
export interface LineupPlayer {
  name: string;
  jersey?: string;
  pos?: string; // syrová zkratka pozice (G/D/M/AM/F/CB/ST…)
  row: 'gk' | 'def' | 'mid' | 'am' | 'fwd';
  starter: boolean;
}
export interface TeamLineup {
  formation?: string;
  starters: LineupPlayer[];
  subs: LineupPlayer[];
}
export interface MatchLineups {
  home: TeamLineup;
  away: TeamLineup;
}
export interface MatchDetail {
  venue?: string;
  city?: string;
  attendance?: number;
  goals?: GoalEvent[];
  cards?: CardEvent[];
  stats?: { home: TeamStats; away: TeamStats };
  lineups?: MatchLineups | null;
}

export interface EspnResult {
  homeCz: string;
  awayCz: string;
  homeId: string;
  awayId: string;
  completed: boolean;
  inProgress: boolean; // ESPN status.state === 'in' (probíhá)
  clock: string; // živá minuta ("90'+8'"), u dohraných ''
  eventId: string;
  reg90_home: number;
  reg90_away: number;
  end90_home: number;
  end90_away: number;
  scoreHome: number; // aktuální/finální skóre přímo z ESPN (pro živé skóre)
  scoreAway: number;
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
  date?: string; // ISO výkop
  name?: string; // "Team A at Team B" / label
  shortName?: string;
  competitions?: {
    attendance?: number;
    notes?: { headline?: string; type?: string }[];
    status?: { displayClock?: string; type?: { completed?: boolean; state?: string } };
    venue?: { fullName?: string; address?: { city?: string } };
    competitors?: EspnCompetitor[];
    details?: EspnDetailRaw[];
  }[];
}

export function pairKey(a: string, b: string): string {
  return [normKey(toCz(a)), normKey(toCz(b))].sort().join('|');
}

/**
 * Rozpis zápasu z ESPN pro doplnění play-off po losu (kola 4–9).
 * round: 4=R32, 5=R16, 6=ČF, 7=SF, 8=o 3. místo, 9=finále; 0=skupina/neznámé.
 */
export interface EspnFixture {
  eventId: string;
  homeCz: string;
  awayCz: string;
  kickoff: string; // ISO
  round: number;
}

// Oficiální okna vyřazovacích kol MS 2026 (FIFA/FOX): datum → číslo kola.
const KO_BRACKETS: [string, string, number][] = [
  ['2026-06-28', '2026-07-03', 4], // Round of 32
  ['2026-07-04', '2026-07-07', 5], // Round of 16
  ['2026-07-08', '2026-07-12', 6], // Quarterfinals (9–11, s rezervou)
  ['2026-07-13', '2026-07-16', 7], // Semifinals (14–15)
  ['2026-07-17', '2026-07-18', 8], // o 3. místo (18)
  ['2026-07-19', '2026-07-21', 9], // Finále (19)
];
function roundFromKickoff(iso: string): number {
  const d = iso.slice(0, 10);
  for (const [a, b, r] of KO_BRACKETS) if (d >= a && d <= b) return r;
  return 0; // skupina (do 27. 6.)
}
function roundFromLabel(s: string): number {
  const t = s.toLowerCase();
  if (/round of 32|1\/16/.test(t)) return 4;
  if (/round of 16|last 16|1\/8/.test(t)) return 5;
  if (/quarter/.test(t)) return 6;
  if (/semi/.test(t)) return 7;
  if (/third place|3rd place|bronze/.test(t)) return 8;
  if (/final/.test(t)) return 9;
  return 0;
}
// Placeholder soupeře (před losem): "Winner match 97", "1A", "Group B", "TBD"…
const isPlaceholder = (s: string) => !s || /winner|runner|loser|\btbd\b|to be|\bgroup\b|\d/i.test(s);

/** Načte z ESPN scoreboardu rozpis (i budoucí zápasy) pro doplnění play-off. */
export async function fetchEspnSchedule(): Promise<EspnFixture[]> {
  const res = await fetch(SCOREBOARD, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  const data = (await res.json()) as { events?: EspnEvent[] };
  const out: EspnFixture[] = [];
  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp || !ev.id || !ev.date) continue;
    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    const hRaw = home?.team?.name ?? home?.team?.displayName ?? '';
    const aRaw = away?.team?.name ?? away?.team?.displayName ?? '';
    if (isPlaceholder(hRaw) || isPlaceholder(aRaw)) continue; // soupeři ještě nejsou známí
    const label = `${ev.name ?? ''} ${ev.shortName ?? ''} ${(comp.notes ?? []).map((n) => n.headline ?? '').join(' ')}`;
    out.push({
      eventId: ev.id,
      homeCz: toCz(hRaw),
      awayCz: toCz(aRaw),
      kickoff: ev.date,
      round: roundFromLabel(label) || roundFromKickoff(ev.date),
    });
  }
  return out;
}

/**
 * Rozebere zobrazenou minutu z ESPN na základ a nastavení.
 * ESPN posílá např. "16'", "45'+5'", "90'+8'" (apostrof PŘED plus), proto nelze
 * spoléhat na `\d+\+\d+`. Vezmeme tedy všechna čísla a "+" jako příznak nastavení.
 *   "90'+8'" → { base: 90, plus: 8 }
 *   "16'"    → { base: 16, plus: 0 }
 */
export function parseMinute(disp: string | undefined | null): { base: number | null; plus: number } {
  const nums = ((disp ?? '').match(/\d+/g) ?? []).map(Number);
  return {
    base: nums.length ? nums[0] : null,
    plus: (disp ?? '').includes('+') && nums.length > 1 ? nums[1] : 0,
  };
}

/** Zařadí hráče do řady formace podle zkratky pozice ESPN (G, CD-L, WB, DM, CF, LW…). */
function posRow(abbr: string | undefined): 'gk' | 'def' | 'mid' | 'am' | 'fwd' {
  const p = (abbr ?? '').toUpperCase().replace(/[^A-Z]/g, ''); // "CD-L" → "CDL"
  if (!p) return 'mid';
  // brankář
  if (p === 'G' || p.startsWith('GK') || p.startsWith('GOAL')) return 'gk';
  // útok: útočník / hrotový / křídlo (žádná zkratka útoku neobsahuje „M")
  if (
    p.startsWith('ST') || p.startsWith('CF') || p.startsWith('SS') || p.startsWith('FW') ||
    p === 'S' || p === 'F' || p === 'W' ||
    p.startsWith('LW') || p.startsWith('RW') || p.startsWith('LF') || p.startsWith('RF') ||
    p.startsWith('FORW') || p.startsWith('STRIK')
  )
    return 'fwd';
  // ofenzivní záloha (AM, CAM, AM-L, AM-R) → vlastní vysunutá řada
  if (p.includes('AM')) return 'am';
  // záloha: cokoli s „M" (CM, DM, CDM, LM, RM…) – před obranou kvůli CDM
  if (p.includes('M')) return 'mid';
  // obrana: bek (…B), střední obránce (CD/D), sweeper
  if (
    p.endsWith('B') || p.startsWith('CD') || p === 'D' ||
    p.startsWith('LD') || p.startsWith('RD') || p.startsWith('SW') ||
    p.startsWith('DL') || p.startsWith('DR') || p.startsWith('D')
  )
    return 'def';
  return 'mid';
}

interface RawRosterEntry {
  starter?: boolean;
  jersey?: string;
  formationPlace?: string;
  athlete?: { displayName?: string; shortName?: string; lastName?: string; position?: { abbreviation?: string } };
  position?: { abbreviation?: string };
}
interface RawRoster {
  homeAway?: string;
  formation?: string | { name?: string };
  team?: { id?: string };
  roster?: RawRosterEntry[];
}

/** Z ESPN `rosters` poskládá sestavy (základ + náhradníci) orientované dle homeId/awayId. */
function parseRosters(rosters: RawRoster[] | undefined, homeId: string, awayId: string): MatchLineups | null {
  if (!Array.isArray(rosters) || rosters.length === 0) return null;
  const build = (r: RawRoster | undefined): TeamLineup => {
    const entries = r?.roster ?? [];
    const formation =
      typeof r?.formation === 'string' ? r.formation : (r?.formation as { name?: string } | undefined)?.name;
    const starters: LineupPlayer[] = [];
    const subs: LineupPlayer[] = [];
    for (const e of entries) {
      const a = e.athlete;
      const name = a?.shortName || a?.displayName || a?.lastName || '';
      if (!name) continue;
      const abbr = e.position?.abbreviation ?? a?.position?.abbreviation;
      const starter = e.starter === true;
      const p: LineupPlayer = { name, jersey: e.jersey, pos: abbr, row: posRow(abbr), starter };
      (starter ? starters : subs).push(p);
    }
    return { formation, starters, subs };
  };
  const pick = (side: 'home' | 'away'): RawRoster | undefined => {
    const id = side === 'home' ? homeId : awayId;
    return (
      rosters.find((r) => r.team?.id === id) ??
      rosters.find((r) => (r.homeAway ?? '').toLowerCase() === side)
    );
  };
  const home = build(pick('home'));
  const away = build(pick('away'));
  if (home.starters.length === 0 && away.starters.length === 0) return null;
  return { home, away };
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

      // Klasifikace goalů. POZOR: ESPN ve scoreboardu často neposílá `period`,
      // a prodloužení nezobrazuje jednoznačně, proto:
      //   prodloužení = jen když ESPN period >= 3 (jinak nedetekujeme – bezpečné)
      //   nastavení 2. poločasu = "90'+X" (základ 90 a je tam "+")
      // ET zápasy bez period se dopočítají jinde (keyEvents / ruční data), aby
      // se nekazily správně uložené výsledky.
      const { base, plus } = parseMinute(disp);

      if (period >= 3) {
        hasET = true;
        if (side === 'home') etH++;
        else etA++;
        continue;
      }
      if (plus > 0 && base === 90) {
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

    const cardsHome = cards.filter((c) => c.side === 'home').length;
    const cardsAway = cards.filter((c) => c.side === 'away').length;
    const detail: MatchDetail = {
      venue: comp.venue?.fullName,
      city: comp.venue?.address?.city,
      attendance: comp.attendance,
      goals: goals.length ? goals : undefined,
      cards: cards.length ? cards : undefined,
      // záložní statistiky ze scoreboardu (summary je pak doplní/přepíše bohatšími)
      stats: {
        home: {
          shots: sbStat(home, 'totalShots'),
          sot: sbStat(home, 'shotsOnTarget'),
          corners: sbStat(home, 'wonCorners'),
          possession: sbStat(home, 'possessionPct'),
          fouls: sbStat(home, 'foulsCommitted'),
          cards: cards.length ? String(cardsHome) : undefined,
        },
        away: {
          shots: sbStat(away, 'totalShots'),
          sot: sbStat(away, 'shotsOnTarget'),
          corners: sbStat(away, 'wonCorners'),
          possession: sbStat(away, 'possessionPct'),
          fouls: sbStat(away, 'foulsCommitted'),
          cards: cards.length ? String(cardsAway) : undefined,
        },
      },
    };

    out.set(pairKey(homeCz, awayCz), {
      homeCz,
      awayCz,
      homeId,
      awayId,
      completed,
      inProgress: state === 'in',
      clock: completed ? '' : (comp.status?.displayClock ?? ''),
      eventId: ev.id ?? '',
      reg90_home,
      reg90_away,
      end90_home,
      end90_away,
      scoreHome: finalH,
      scoreAway: finalA,
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
/** Spolehlivý rozklad zápasu z keyEvents (má period i "90'+X" – na rozdíl od scoreboardu). */
export interface EspnTimeline {
  reg90_home: number;
  reg90_away: number;
  end90_home: number;
  end90_away: number;
  duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  extra_home: number | null;
  extra_away: number | null;
  pen_home: number | null;
  pen_away: number | null;
  /** true jen když součet gólů z keyEvents sedí na finální skóre z ESPN */
  valid: boolean;
}

/**
 * Stáhne summary jednou a vrátí:
 *  - bohaté statistiky (boxscore),
 *  - timeline z keyEvents (period + minuta) → spolehlivé reg/skóre/prodloužení/penalty.
 * Pokud keyEvents nesedí na finální skóre (finalHome/finalAway z ESPN scoreboardu),
 * timeline.valid = false a volající se má vrátit k záloze.
 */
export async function fetchEspnSummary(
  eventId: string,
  homeId: string,
  awayId: string,
  finalHome?: number,
  finalAway?: number,
): Promise<{ home: TeamStats; away: TeamStats; timeline: EspnTimeline | null; lineups: MatchLineups | null } | null> {
  try {
    const res = await fetch(`${BASE}/summary?event=${eventId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      boxscore?: { teams?: { team?: { id?: string }; statistics?: { label?: string; displayValue?: string }[] }[] };
      rosters?: RawRoster[];
      keyEvents?: {
        scoringPlay?: boolean;
        shootout?: boolean;
        ownGoal?: boolean;
        period?: number | { number?: number };
        clock?: { displayValue?: string };
        team?: { id?: string };
      }[];
    };
    const teams = data?.boxscore?.teams;
    if (!Array.isArray(teams) || teams.length < 2) return null;
    const extract = (t: (typeof teams)[number] | undefined): TeamStats => {
      const st = t?.statistics ?? [];
      const get = (label: string): string | undefined =>
        st.find((x) => (x.label ?? '').toLowerCase() === label)?.displayValue;
      return {
        shots: get('shots'),
        sot: get('on goal'),
        corners: get('corner kicks'),
        possession: get('possession'),
        passes: get('accurate passes'),
        fouls: get('fouls'),
      };
    };
    const byId = new Map(teams.map((t) => [t?.team?.id, t]));
    const h = byId.get(homeId) ?? teams[0];
    const a = byId.get(awayId) ?? teams[1];

    // ── timeline z keyEvents ──
    let timeline: EspnTimeline | null = null;
    const kev = data?.keyEvents ?? [];
    if (kev.length > 0) {
      let endH = 0, endA = 0, etH = 0, etA = 0, penH = 0, penA = 0, stopH = 0, stopA = 0;
      let hasET = false, hasPen = false;
      for (const k of kev) {
        if (k.scoringPlay !== true) continue;
        const periodNum = typeof k.period === 'number' ? k.period : (k.period?.number ?? 0);
        const teamId = k.team?.id;
        let side: 'home' | 'away' | null = teamId === homeId ? 'home' : teamId === awayId ? 'away' : null;
        if (k.ownGoal && side) side = side === 'home' ? 'away' : 'home';
        if (!side) continue;

        if (k.shootout === true || periodNum >= 5) {
          hasPen = true;
          if (side === 'home') penH++; else penA++;
          continue;
        }
        if (periodNum >= 3) {
          hasET = true;
          if (side === 'home') etH++; else etA++;
          continue;
        }
        // základní hrací doba (period 1/2)
        if (side === 'home') endH++; else endA++;
        const { base, plus } = parseMinute(k.clock?.displayValue);
        if (periodNum === 2 && base === 90 && plus > 0) {
          if (side === 'home') stopH++; else stopA++;
        }
      }
      const finalHc = endH + etH;
      const finalAc = endA + etA;
      const valid =
        finalHome === undefined || finalAway === undefined
          ? true
          : finalHc === finalHome && finalAc === finalAway;
      timeline = {
        reg90_home: endH - stopH,
        reg90_away: endA - stopA,
        end90_home: endH,
        end90_away: endA,
        duration: hasPen ? 'PENALTY_SHOOTOUT' : hasET ? 'EXTRA_TIME' : 'REGULAR',
        extra_home: hasET || hasPen ? finalHc : null,
        extra_away: hasET || hasPen ? finalAc : null,
        pen_home: hasPen ? penH : null,
        pen_away: hasPen ? penA : null,
        valid,
      };
    }

    const lineups = parseRosters(data?.rosters, homeId, awayId);
    return { home: extract(h), away: extract(a), timeline, lineups };
  } catch {
    return null;
  }
}

/** Zpětně kompatibilní obal – jen statistiky (bez timeline). */
export async function fetchEspnStats(
  eventId: string,
  homeId: string,
  awayId: string,
): Promise<{ home: TeamStats; away: TeamStats } | null> {
  const s = await fetchEspnSummary(eventId, homeId, awayId);
  return s ? { home: s.home, away: s.away } : null;
}

/** Sloučí staty: hodnoty ze summary mají přednost, scoreboard doplní chybějící (a karty). */
export function mergeStats(base: TeamStats, extra: TeamStats): TeamStats {
  return {
    shots: extra.shots ?? base.shots,
    sot: extra.sot ?? base.sot,
    corners: extra.corners ?? base.corners,
    possession: extra.possession ?? base.possession,
    passes: extra.passes ?? base.passes,
    fouls: extra.fouls ?? base.fouls,
    cards: base.cards ?? extra.cards,
  };
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
    lineups: d.lineups ? { home: d.lineups.away, away: d.lineups.home } : d.lineups,
  };
}
