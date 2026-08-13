import type { Match, MatchStatus } from './types';

/**
 * Pravidla pro odložené zápasy.
 *
 * ZÁSADNÍ ROZHODNUTÍ: odložený zápas ZŮSTÁVÁ ve svém původním kole.
 * Zbrojovka–Hradec je zápas 4. kola, i když se hraje o měsíc později —
 * body se po dohrání připočtou do 4. kola a pořadí kola se tím zpětně
 * doupraví. Nevzniká žádné virtuální kolo ani druhá bodová logika.
 *
 * Přehled „Odložené zápasy“ je proto jen JINÝ POHLED na táž data,
 * ne samostatná soutěž.
 */

/**
 * Vyhrazené číslo pro pohled „Odložené zápasy“ ve výběru kol.
 *
 * Není to skutečné kolo v databázi — žádný zápas tuhle hodnotu v `round`
 * nemá. Slouží jen jako klíč pro přepínač kol; zápasy se do něj sbírají
 * podle stavu `postponed` a jejich `round` zůstává nedotčené.
 */
export const POSTPONED_ROUND = -1;

/** Popisek pohledu ve výběru kol. */
export const POSTPONED_ROUND_LABEL = 'Odložené zápasy';

/** Stavy, ve kterých se na zápas dá tipovat, pokud ještě nezačal. */
const TIPOVATELNE: ReadonlySet<MatchStatus> = new Set<MatchStatus>(['scheduled', 'postponed']);

/**
 * Je tipování uzavřené?
 *
 * Odložený zápas musí zůstat OTEVŘENÝ do svého nového výkopu — jinak by na
 * něj nikdo nemohl tipovat. Zrušený zápas je uzavřený vždy.
 */
export function isTippingLocked(
  match: Pick<Match, 'status' | 'kickoff'>,
  now: number = Date.now(),
): boolean {
  if (!TIPOVATELNE.has(match.status)) return true;
  const kickoff = new Date(match.kickoff).getTime();
  if (!Number.isFinite(kickoff)) return true;
  return kickoff <= now;
}

/** Je zápas odložený a čeká na nový termín? */
export function isPostponed(match: Pick<Match, 'status'>): boolean {
  return match.status === 'postponed';
}

/**
 * Odložené zápasy napříč koly, seřazené podle nového termínu.
 * Zrušené se nezahrnují — ty se už neodehrají.
 */
export function collectPostponed<T extends Pick<Match, 'status' | 'kickoff' | 'round'>>(
  matches: T[],
): T[] {
  return matches
    .filter((match) => isPostponed(match))
    .sort((a, b) => {
      const ka = new Date(a.kickoff).getTime();
      const kb = new Date(b.kickoff).getTime();
      if (Number.isFinite(ka) && Number.isFinite(kb) && ka !== kb) return ka - kb;
      return a.round - b.round;
    });
}

/**
 * Má se odložený zápas řadit na konec kola?
 *
 * V seznamu kola patří odložené zápasy dolů — nehrají se se zbytkem kola
 * a jejich výkop je mimo jeho obvyklý termín.
 */
export function sortWithPostponedLast<T extends Pick<Match, 'status' | 'kickoff'>>(
  matches: T[],
): T[] {
  return [...matches].sort((a, b) => {
    const pa = isPostponed(a) ? 1 : 0;
    const pb = isPostponed(b) ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
  });
}

/** Krátký popis nového termínu, např. „Odloženo na 2. 9.“ */
export function postponedLabel(kickoff: string): string {
  const date = new Date(kickoff);
  if (!Number.isFinite(date.getTime())) return 'Odloženo';
  const formatted = date.toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'Europe/Prague',
  });
  return `Odloženo na ${formatted}`;
}

/** Minimální tvar zápasu potřebný pro párování identity. */
export interface FixtureIdentity {
  id: number;
  source_league: string | null;
  external_api_id: number | null;
  round: number;
  status: string;
  home_team: string;
  away_team: string;
}

/**
 * Najde v databázi zápas odpovídající příchozímu záznamu od poskytovatele.
 *
 * Pořadí identity (od nejsilnější po nejslabší):
 *   1. shodné provider ID,
 *   2. shodná dvojice týmů ve stejném kole,
 *   3. právě JEDEN odložený zápas se stejnou dvojicí týmů — i při jiném kole.
 *
 * Třetí krok pokrývá případ, kdy poskytovatel po přeložení změní ID **i**
 * číslo kola. Omezení na jediný odložený zápas brání chybnému spojení.
 *
 * Funkce je čistá, aby šla testovat bez databáze a bez sítě.
 */
export function matchExistingFixture<T extends FixtureIdentity>(
  existing: T[],
  incoming: { source_league: string; external_api_id: number | null; round: number; home_team: string; away_team: string },
  isSameFixture: (a: { home: string; away: string }, b: { home: string; away: string }) => boolean,
): T | undefined {
  return resolveExistingFixture(existing, incoming, isSameFixture).match;
}

/**
 * Výsledek hledání identity včetně informace o nejednoznačnosti.
 *
 * `match`        – jednoznačně spárovaný zápas (nebo `undefined`),
 * `ambiguousIds` – ID všech kandidátů, když je identita nejednoznačná.
 *
 * PROČ TO EXISTUJE: samotné „nespárovat“ nestačí. Opravná synchronizace maže
 * zápasy, které nedokázala spárovat — při nejednoznačnosti by tedy smazala
 * VŠECHNY kandidáty i s jejich tipy. Nejednoznačné zápasy proto musí být
 * z mazání výslovně vyloučené a nahlášené k ručnímu vyřešení.
 */
export interface FixtureMatchResult<T> {
  match: T | undefined;
  ambiguousIds: number[];
}

export function resolveExistingFixture<T extends FixtureIdentity>(
  existing: T[],
  incoming: { source_league: string; external_api_id: number | null; round: number; home_team: string; away_team: string },
  isSameFixture: (a: { home: string; away: string }, b: { home: string; away: string }) => boolean,
): FixtureMatchResult<T> {
  // 1) provider ID – jednoznačné, žádná nejednoznačnost nehrozí
  if (incoming.external_api_id != null) {
    const podleId = existing.find(
      (row) => row.source_league === incoming.source_league
        && row.external_api_id === incoming.external_api_id,
    );
    if (podleId) return { match: podleId, ambiguousIds: [] };
  }

  const stejneTymy = (row: T) =>
    row.source_league === incoming.source_league
    && isSameFixture(
      { home: row.home_team, away: row.away_team },
      { home: incoming.home_team, away: incoming.away_team },
    );

  // 2) stejné týmy ve stejném kole
  const vKole = existing.filter((row) => stejneTymy(row) && row.round === incoming.round);
  if (vKole.length === 1) return { match: vKole[0], ambiguousIds: [] };
  if (vKole.length > 1) return { match: undefined, ambiguousIds: vKole.map((row) => row.id) };

  // 3) odložené zápasy s touto dvojicí napříč koly
  const odlozene = existing.filter((row) => stejneTymy(row) && row.status === 'postponed');
  if (odlozene.length === 1) return { match: odlozene[0], ambiguousIds: [] };
  if (odlozene.length > 1) return { match: undefined, ambiguousIds: odlozene.map((row) => row.id) };

  return { match: undefined, ambiguousIds: [] };
}
