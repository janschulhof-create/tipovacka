import { createHash } from 'node:crypto';

/**
 * Fotbalový den a uzavření programu.
 *
 * Čisté funkce bez databáze, sítě a Reactu — jdou testovat přímo.
 *
 * ── PROČ TO EXISTUJE ────────────────────────────────────────────────────────
 * „Kudy běží zajíc“ dnes čeká na dohrání celého kola. Jenže jeden odložený
 * zápas může kolo držet otevřené týdny, takže hodnocení soboty nikdy nevyjde.
 *
 * Tahle vrstva odděluje dva pojmy, které se dosud pletly:
 *
 *   dayClosed     – program konkrétního dne (Europe/Prague) skončil
 *   roundComplete – dohrány VŠECHNY zápasy kola
 *
 * Sobotní hodnocení se generuje při `dayClosed`, i když `roundComplete`
 * bude platit až za tři týdny.
 */

/** Stavy, které aplikace u zápasu rozlišuje. */
export type MatchdayStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

/** Minimum, které o zápase potřebujeme. Sedí na `Match` i na testovací data. */
export interface MatchdayMatch {
  id: number;
  round: number;
  kickoff: string;
  status: MatchdayStatus;
  home_score?: number | null;
  away_score?: number | null;
}

/**
 * Datum výkopu v pásmu Europe/Prague ve tvaru `YYYY-MM-DD`.
 *
 * ZÁMĚRNĚ ne UTC: zápas s výkopem 29. 8. ve 23:30 pražského času má v UTC
 * datum 29. 8. v létě, ale v zimě by se posunul. Rozhoduje kalendářní den
 * tak, jak ho vidí parta — ne serverové pásmo.
 *
 * `sv-SE` locale dává rovnou tvar `YYYY-MM-DD`.
 */
export function footballDayKey(kickoff: string): string | null {
  const date = new Date(kickoff);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Zápas dohraný s výsledkem — jediný stav, který zakládá fakta. */
export function isCompleted(match: MatchdayMatch): boolean {
  return match.status === 'finished';
}

/**
 * Drží zápas svůj den otevřený?
 *
 * Ano u `live` (hraje se) a `scheduled` (teprve začne).
 * Ne u `postponed` — ten se přesunul na jiný den a nesmí držet původní den
 * otevřený týdny. Ne u `cancelled` — ten se už neodehraje.
 */
export function keepsDayOpen(match: MatchdayMatch): boolean {
  return match.status === 'live' || match.status === 'scheduled';
}

export interface DayClosureInput {
  /** Zápasy JEDNOHO kola. */
  matches: MatchdayMatch[];
  /** Fotbalový den `YYYY-MM-DD` v pražském čase. */
  footballDay: string;
}

export interface DayClosureResult {
  footballDay: string;
  dayClosed: boolean;
  /** Zápasy tohoto kola dohrané v tento den. */
  completedToday: MatchdayMatch[];
  /** Co ještě tento den drží otevřené. */
  blockingToday: MatchdayMatch[];
}

/**
 * Skončil program daného dne pro dané kolo?
 *
 * Podmínky:
 *   1. aspoň jeden zápas kola byl v ten den dohraný,
 *   2. žádný zápas kola naplánovaný na TENTÝŽ den už nečeká ani nehraje.
 *
 * Odložený ani zrušený zápas den neblokuje. Dny týdne se nikde nerozlišují —
 * středa funguje stejně jako sobota.
 */
export function evaluateDayClosure(input: DayClosureInput): DayClosureResult {
  const vDen = input.matches.filter((m) => footballDayKey(m.kickoff) === input.footballDay);

  const completedToday = vDen.filter(isCompleted);
  const blockingToday = vDen.filter(keepsDayOpen);

  return {
    footballDay: input.footballDay,
    dayClosed: completedToday.length > 0 && blockingToday.length === 0,
    completedToday,
    blockingToday,
  };
}

/**
 * Jsou dohrané všechny zápasy kola?
 *
 * Odložený zápas znamená `false` — kolo pokračuje. Zrušený se nepočítá,
 * ten se už neodehraje.
 */
export function isRoundComplete(matches: MatchdayMatch[]): boolean {
  const relevantni = matches.filter((m) => m.status !== 'cancelled');
  return relevantni.length > 0 && relevantni.every(isCompleted);
}

export interface RoundDaySummary {
  round: number;
  footballDay: string;
  dayClosed: boolean;
  roundComplete: boolean;
  /** Kumulativně: všechny dohrané zápasy kola k tomuto dni včetně. */
  completedMatchCount: number;
  /**
   * Zápasy, které se ještě mají hrát v běžném režimu (naplánované + živé).
   * NEZAHRNUJE odložené — ty mají vlastní počet.
   */
  activeRemainingMatchCount: number;
  /** Odložené zápasy kola čekající na nový termín. */
  postponedMatchCount: number;
  /**
   * Vše, co ještě není odehrané = aktivní + odložené.
   *
   * Model se musí řídit tímhle číslem: `0 aktivních + 1 odložený`
   * NENÍ dohrané kolo.
   */
  totalUnplayedMatchCount: number;
}

/**
 * Kumulativní stav kola k závěru daného dne.
 *
 * Hodnocení je kumulativní: nedělní verze pokrývá sobotu i neděli, ne jen
 * nedělní zápasy.
 */
/**
 * Stav kola K ZÁVĚRU DANÉHO DNE — ne k dnešku.
 *
 * ── PROČ TO MUSÍ BÝT „AS OF“ ────────────────────────────────────────────────
 * Kdyby se počty braly z dnešního stavu, opakované sobotní generování by po
 * neděli tvrdilo, že kolo je dohrané. Sobotní verze by se zpětně změnila
 * a přestala odpovídat tomu, co v sobotu platilo.
 *
 * Zápas s výkopem po zvoleném dni se proto považuje za neodehraný, i kdyby
 * byl dnes dohraný.
 */
export function summarizeRoundDay(
  matches: MatchdayMatch[],
  round: number,
  footballDay: string,
): RoundDaySummary {
  const vKole = matches.filter((m) => m.round === round);
  const zavreni = evaluateDayClosure({ matches: vKole, footballDay });

  const poDni = (m: MatchdayMatch) => {
    const den = footballDayKey(m.kickoff);
    return den != null && den > footballDay;
  };

  // Kumulativně = dohrané v tento den i dřív.
  const dohraneDoDne = vKole.filter((m) => {
    if (!isCompleted(m)) return false;
    const den = footballDayKey(m.kickoff);
    return den != null && den <= footballDay;
  });

  // Zápasy pozdějších dnů jsou k tomuto dni neodehrané, bez ohledu na
  // jejich dnešní stav.
  const budouci = vKole.filter((m) => poDni(m) && m.status !== 'cancelled');
  const aktivniDnes = vKole.filter((m) => !poDni(m) && keepsDayOpen(m));
  const odlozeneDnes = vKole.filter((m) => !poDni(m) && m.status === 'postponed');

  const aktivni = aktivniDnes.length + budouci.filter((m) => m.status !== 'postponed').length;
  const odlozene = odlozeneDnes.length + budouci.filter((m) => m.status === 'postponed').length;

  // Kolo je k tomuto dni dohrané jen tehdy, když po něm nic nezbývá.
  const dohranoKDni = vKole.every((m) =>
    m.status === 'cancelled' || (!poDni(m) && isCompleted(m)));

  return {
    round,
    footballDay,
    dayClosed: zavreni.dayClosed,
    roundComplete: dohranoKDni && vKole.some((m) => m.status !== 'cancelled'),
    completedMatchCount: dohraneDoDne.length,
    activeRemainingMatchCount: aktivni,
    postponedMatchCount: odlozene,
    totalUnplayedMatchCount: aktivni + odlozene,
  };
}

/**
 * Změna zápasu se stavem PŘED i PO zápisu.
 *
 * `before === null` → nový zápas.
 * `after === null`  → zápas zmizel ze zdroje.
 */
export interface MatchChange {
  before: MatchdayMatch | null;
  after: MatchdayMatch | null;
}

/**
 * Kola a dny, jejichž stav se mohl změnit.
 *
 * ── PROČ BEFORE I AFTER ─────────────────────────────────────────────────────
 * Když se zápas přeloží ze soboty na středu, změní se jeho den. Kdyby se
 * bral jen nový stav, vrátila by se pouze středa — jenže **sobota se mohla
 * zavřít právě tím přeložením**. Sobotní hodnocení by nikdy nevzniklo.
 *
 * Proto se vrací sjednocení obou dnů, deduplikované a v pevném pořadí.
 *
 * KLÍČOVÉ: řídí se kolem změněného zápasu, ne „aktuálním“ kolem ligy.
 * Středeční dohrání odloženého zápasu 4. kola obnoví 4. kolo, i když se
 * právě hraje 6.
 */
export function affectedRoundDays(changes: MatchChange[]): { round: number; footballDay: string }[] {
  const klice = new Map<string, { round: number; footballDay: string }>();

  const pridej = (match: MatchdayMatch | null) => {
    if (!match) return;
    const den = footballDayKey(match.kickoff);
    if (den == null || !Number.isFinite(match.round)) return;
    klice.set(`${match.round}|${den}`, { round: match.round, footballDay: den });
  };

  for (const zmena of changes) {
    pridej(zmena.before);
    pridej(zmena.after);
  }

  return [...klice.values()].sort((a, b) =>
    a.footballDay.localeCompare(b.footballDay) || a.round - b.round);
}

/**
 * Kanonická podoba libovolné hodnoty pro otisk.
 *
 * Klíče objektů se řadí, takže na pořadí vlastností nezáleží. Hodnoty
 * `undefined` se vypouštějí — nejsou nositelem významu.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const zaznam = value as Record<string, unknown>;
    return Object.keys(zaznam)
      .filter((k) => zaznam[k] !== undefined)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = canonicalize(zaznam[k]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Otisk sémantického obsahu, který model uvidí.
 *
 * ── PROČ NESTAČÍ HASHOVAT JEN SKÓRE ─────────────────────────────────────────
 * Dřívější podoba brala jen sezonu, kolo, den a výsledky. To propouštělo
 * konkrétní chybu: když se odložený zápas změnil na zrušený, skóre zůstala
 * stejná, ale `roundComplete` přeskočilo z `false` na `true` — otisk se
 * nezměnil a finální hodnocení se nikdy nevygenerovalo.
 *
 * Otisk proto reprezentuje **to, co model smí vědět**: kanonizovaný podklad
 * pro generování, tedy fakta kola i doložené hlášky.
 *
 * Vynechává se vše nesémantické — čas požadavku, metadata logu, pořadí
 * vstupu. Naopak každá oprávněná oprava, která by měla změnit výsledný
 * text, otisk změní.
 */
export function fingerprintPayload(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex')
    .slice(0, 32);
}

/**
 * Otisk pro hodnocení uzavřeného dne.
 *
 * Kromě identity (sezona, soutěž, kolo, den) zahrnuje stav kola i případný
 * dodatečný sémantický podklad — typicky fakta předávaná modelu a doložené
 * hlášky. Volající ho předá v `semanticFacts`.
 */
export function factsFingerprint(input: {
  seasonId: number;
  competition: string;
  round: number;
  footballDay: string;
  matches: MatchdayMatch[];
  /** Další podklad, který ovlivňuje text (fakta pro model, eligibilita hlášek). */
  semanticFacts?: unknown;
}): string {
  const souhrn = summarizeRoundDay(input.matches, input.round, input.footballDay);

  // Stav VŠECH zápasů kola k tomuto dni, ne jen skóre dohraných. Bez toho
  // by změna postponed → cancelled zůstala neviditelná.
  const stavy = input.matches
    .filter((m) => {
      const den = footballDayKey(m.kickoff);
      return den != null && den <= input.footballDay;
    })
    .map((m) => ({
      id: m.id,
      status: m.status,
      score: isCompleted(m) ? `${m.home_score ?? ''}-${m.away_score ?? ''}` : null,
    }))
    .sort((a, b) => a.id - b.id);

  // Odložené zápasy s pozdějším termínem mění `roundComplete`, i když
  // do dne nespadají – proto se jejich stav sleduje také.
  const budouci = input.matches
    .filter((m) => {
      const den = footballDayKey(m.kickoff);
      return den != null && den > input.footballDay;
    })
    .map((m) => ({ id: m.id, status: m.status }))
    .sort((a, b) => a.id - b.id);

  return fingerprintPayload({
    seasonId: input.seasonId,
    competition: input.competition,
    round: input.round,
    footballDay: input.footballDay,
    roundComplete: souhrn.roundComplete,
    completedMatchCount: souhrn.completedMatchCount,
    activeRemainingMatchCount: souhrn.activeRemainingMatchCount,
    postponedMatchCount: souhrn.postponedMatchCount,
    matchStates: stavy,
    futureStates: budouci,
    semanticFacts: input.semanticFacts ?? null,
  });
}
