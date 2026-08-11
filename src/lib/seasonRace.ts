/**
 * Výpočty pro Season Race — sdílené jádro grafu pořadí.
 *
 * Záměrně bez SVG a bez Reactu, aby šlo testovat samostatně. Graf tuhle
 * logiku jen vykresluje; jedna implementace, víc konfigurací použití.
 */

export interface RoundPointsInput {
  /** Body ZA KOLO (ne kumulativně) — stejný tvar, jaký bere `StandingsChart`. */
  matches: { round: number; pts: Record<string, number> }[];
  players: string[];
}

export interface RaceRow {
  name: string;
  /** Kumulativní body po zvoleném kole. */
  cumulative: number;
  /** Body získané právě ve zvoleném kole. */
  roundPoints: number;
  /** Pořadí po zvoleném kole (1 = první). */
  position: number;
  /** Posun oproti předchozímu kolu: kladné = polepšení. */
  movement: number;
}

/**
 * Řazení při rovnosti bodů.
 *
 * MUSÍ odpovídat produkční tabulce (`queries.ts`), jinak by graf ukazoval
 * jiné pořadí než zbytek aplikace. Žádný vlastní algoritmus.
 */
export function comparePlayers(
  a: { name: string; points: number },
  b: { name: string; points: number },
): number {
  return b.points - a.points || a.name.localeCompare(b.name, 'cs');
}

/** Kumulativní body po každém kole: `series[hráč][index kola]`. */
export function buildCumulativeSeries(input: RoundPointsInput): Record<string, number[]> {
  const series: Record<string, number[]> = Object.fromEntries(input.players.map((p) => [p, []]));
  const running: Record<string, number> = Object.fromEntries(input.players.map((p) => [p, 0]));

  for (const kolo of input.matches) {
    for (const hrac of input.players) {
      running[hrac] += kolo.pts[hrac] ?? 0;
      series[hrac].push(running[hrac]);
    }
  }
  return series;
}

/**
 * Pořadí po každém kole: `series[hráč][index kola]`, 1 = první.
 * Používá stejné řazení jako produkční tabulka.
 */
export function buildRankSeries(input: RoundPointsInput): Record<string, number[]> {
  const cumulative = buildCumulativeSeries(input);
  const ranks: Record<string, number[]> = Object.fromEntries(input.players.map((p) => [p, []]));

  for (let i = 0; i < input.matches.length; i++) {
    const poradi = input.players
      .map((name) => ({ name, points: cumulative[name][i] }))
      .sort(comparePlayers);

    poradi.forEach((row, index) => ranks[row.name].push(index + 1));
  }
  return ranks;
}

/**
 * Kompletní snímek zvoleného kola: kumulativní body, body za kolo,
 * pořadí a posun oproti předchozímu kolu.
 */
export function buildRoundSnapshot(input: RoundPointsInput, roundIndex: number): RaceRow[] {
  if (input.matches.length === 0) return [];

  const index = Math.max(0, Math.min(roundIndex, input.matches.length - 1));
  const cumulative = buildCumulativeSeries(input);
  const ranks = buildRankSeries(input);

  return input.players
    .map((name) => {
      const position = ranks[name][index];
      // V prvním kole se není odkud posunout.
      const predchozi = index > 0 ? ranks[name][index - 1] : position;
      return {
        name,
        cumulative: cumulative[name][index],
        roundPoints: input.matches[index].pts[name] ?? 0,
        position,
        // Kladné = posun nahoru (z 3. na 1. místo = +2).
        movement: predchozi - position,
      };
    })
    .sort((a, b) => a.position - b.position);
}

/** Textová značka posunu pro UI. */
export function movementLabel(movement: number): string {
  if (movement > 0) return `▲${movement}`;
  if (movement < 0) return `▼${Math.abs(movement)}`;
  return '—';
}

/** Index kola nejbližší vodorovné pozici — sdíleno myší i dotykem. */
export function roundIndexFromRatio(ratio: number, roundCount: number): number {
  if (roundCount <= 1) return 0;
  const omezeny = Math.max(0, Math.min(1, ratio));
  return Math.round(omezeny * (roundCount - 1));
}

/**
 * Rozmístí popisky na konci čar tak, aby se nepřekrývaly.
 * Vrací y-souřadnice ve stejném pořadí jako vstup.
 */
export function resolveLabelCollisions(positions: number[], minGap: number): number[] {
  const serazene = positions
    .map((y, index) => ({ y, index }))
    .sort((a, b) => a.y - b.y);

  let posledni = -Infinity;
  const vysledek = new Array<number>(positions.length);

  for (const polozka of serazene) {
    const y = Math.max(polozka.y, posledni + minGap);
    vysledek[polozka.index] = y;
    posledni = y;
  }
  return vysledek;
}

/** Graf má smysl až od dvou dokončených kol. */
export function hasEnoughRounds(input: RoundPointsInput): boolean {
  return input.matches.length >= 2;
}

/**
 * Má pohyb ukazovátka změnit vybrané kolo?
 *
 * Myš:  ano při pouhém přejetí — držet tlačítko se nemá.
 * Dotyk a pero: jen při skutečném tažení (přiložený prst), aby prosté
 * projetí prstem při scrollování stránky výběr neměnilo.
 *
 * Jedna funkce pro obě zařízení — ne dvě samostatné implementace.
 */
export function shouldSelectOnPointerMove(pointerType: string, buttons: number): boolean {
  if (pointerType === 'mouse') return true;
  return buttons > 0;
}

/**
 * Doporučená hodnota `touch-action` pro plochu grafu.
 *
 * `pan-y` nechá prohlížeči svislé posouvání stránky (prst přes graf tedy
 * stránku normálně posune), ale vodorovná gesta si bere graf pro výběr kola.
 * `none` by vytvořilo scroll past — celý graf by na mobilu blokoval posun.
 */
export const CHART_TOUCH_ACTION = 'pan-y' as const;
