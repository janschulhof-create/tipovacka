/**
 * Zajímavosti z tipů na jeden zápas.
 *
 * ── PROČ V KÓDU A NE V PROMPTU ──────────────────────────────────────────────
 * Model dostával jen seznam tipů a měl si porovnání domyslet. To vede
 * k chybám v aritmetice a k vypsání všech tipérů za sebou. Porovnání je
 * levné spočítat přesně — model pak dostane hotový příběh a jen ho hezky
 * poví.
 *
 * Vše je deterministické: stejné tipy dají stejné zajímavosti.
 */

export interface TipRow {
  name: string;
  /** Tip ve tvaru „2:1“. */
  tip: string;
  points: number | null;
}

export type Outcome = 'home' | 'draw' | 'away';

export interface MatchInterest {
  /** Kdo trefil přesný výsledek. */
  exactTipsters: string[];
  /**
   * Nejblíž skutečnosti (bez přesné trefy).
   *
   * `names` obsahuje VŠECHNY se stejnou vzdáleností. Při shodě se nesmí
   * tvrdit, že „nejblíž byl Petr“, když stejně blízko byl i Honza.
   */
  closest: { names: string[]; tip: string; distance: number } | null;
  /** Nejdál od skutečnosti. Stejná logika shod. */
  furthest: { names: string[]; tip: string; distance: number } | null;
  /** Kdo jediný tipoval vítěze správně, když ostatní ne. */
  loneCorrect: { name: string; tip: string } | null;
  /** Většinový tip na vítěze a jeho podíl. */
  consensus: { outcome: Outcome; share: number; count: number; total: number } | null;
  /** Spletl se celý stůl? */
  everyoneWrong: boolean;
  /** Trefil vítěze úplně každý? */
  everyoneRight: boolean;
  /** Rozptyl tipovaných gólů dohromady (max − min). */
  goalSpread: number | null;
  /** Dva nejvzdálenější tipy — hezký kontrast do textu. */
  extremes: {
    low: { names: string[]; tip: string };
    high: { names: string[]; tip: string };
  } | null;
  /** Kolik silných zajímavostí zápas nabízí. Řídí rozsah textu. */
  notableCount: number;
}

/** Vítěz podle skóre, `draw` u remízy, `null` u neplatného vstupu. */
export function outcomeOf(score: string): Outcome | null {
  const [h, a] = score.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return h === a ? 'draw' : h > a ? 'home' : 'away';
}

/** Součet odchylek obou skóre. */
export function tipDistance(tip: string, score: string): number | null {
  const [th, ta] = tip.split(':').map(Number);
  const [sh, sa] = score.split(':').map(Number);
  if (![th, ta, sh, sa].every(Number.isFinite)) return null;
  return Math.abs(th - sh) + Math.abs(ta - sa);
}

/** Součet tipovaných gólů. */
function totalGoals(tip: string): number | null {
  const [h, a] = tip.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(a) ? h + a : null;
}

/**
 * Vybere zajímavosti ze zápasu.
 *
 * Počítají se jen VYHODNOCENÉ tipy — kdo netipoval, o tom se nepíše.
 */
export function selectMatchInterest(tips: TipRow[], score: string): MatchInterest {
  const prazdny: MatchInterest = {
    exactTipsters: [], closest: null, furthest: null, loneCorrect: null,
    consensus: null, everyoneWrong: false, everyoneRight: false,
    goalSpread: null, extremes: null, notableCount: 0,
  };

  const skutecny = outcomeOf(score);
  const vyhodnocene = tips
    .filter((t) => typeof t.points === 'number' && tipDistance(t.tip, score) != null)
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));

  if (skutecny == null || vyhodnocene.length === 0) return prazdny;

  const sVzdalenosti = vyhodnocene.map((t) => ({
    ...t,
    distance: tipDistance(t.tip, score) as number,
    outcome: outcomeOf(t.tip),
  }));

  const exactTipsters = sVzdalenosti.filter((t) => t.distance === 0).map((t) => t.name);

  // Nejbližší mezi těmi, kdo netrefili přesně — přesná trefa má vlastní kolonku.
  const mimoPresne = sVzdalenosti.filter((t) => t.distance > 0);
  const serazene = [...mimoPresne].sort((a, b) => a.distance - b.distance
    || a.name.localeCompare(b.name, 'cs'));

  // Při shodě se uvedou všichni – jinak by text tvrdil něco, co neplatí.
  const nejblizVzdalenost = serazene[0]?.distance;
  const closest = serazene.length > 0
    ? {
      names: serazene.filter((t) => t.distance === nejblizVzdalenost).map((t) => t.name),
      tip: serazene[0].tip,
      distance: nejblizVzdalenost as number,
    }
    : null;

  const nejdalVzdalenost = serazene[serazene.length - 1]?.distance;
  const furthest = serazene.length > 0 && nejdalVzdalenost !== nejblizVzdalenost
    ? {
      names: serazene.filter((t) => t.distance === nejdalVzdalenost).map((t) => t.name),
      tip: serazene[serazene.length - 1].tip,
      distance: nejdalVzdalenost as number,
    }
    : null;

  // Většinový názor na vítěze.
  const pocty: Record<Outcome, number> = { home: 0, draw: 0, away: 0 };
  for (const t of sVzdalenosti) if (t.outcome) pocty[t.outcome] += 1;

  const poradi: Outcome[] = ['home', 'draw', 'away'];
  const nejcastejsi = poradi.reduce((best, o) => (pocty[o] > pocty[best] ? o : best), 'home');
  const jednoznacny = poradi.filter((o) => pocty[o] === pocty[nejcastejsi]).length === 1;

  const consensus = jednoznacny && pocty[nejcastejsi] > 0
    ? {
      outcome: nejcastejsi,
      count: pocty[nejcastejsi],
      total: sVzdalenosti.length,
      share: Number((pocty[nejcastejsi] / sVzdalenosti.length).toFixed(3)),
    }
    : null;

  const spravni = sVzdalenosti.filter((t) => t.outcome === skutecny);
  const everyoneWrong = spravni.length === 0;
  const everyoneRight = spravni.length === sVzdalenosti.length && sVzdalenosti.length > 1;

  // Osamělý správný tip je nejsilnější příběh, jaký zápas nabízí.
  const loneCorrect = spravni.length === 1 && sVzdalenosti.length > 2
    ? { name: spravni[0].name, tip: spravni[0].tip }
    : null;

  // Rozptyl tipovaných gólů a dva krajní tipy pro kontrast.
  const golove = sVzdalenosti
    .map((t) => ({ ...t, goals: totalGoals(t.tip) }))
    .filter((t): t is typeof t & { goals: number } => t.goals != null)
    .sort((a, b) => a.goals - b.goals || a.name.localeCompare(b.name, 'cs'));

  const goalSpread = golove.length > 1
    ? golove[golove.length - 1].goals - golove[0].goals
    : null;

  const nejmene = golove[0]?.goals;
  const nejvic = golove[golove.length - 1]?.goals;
  const extremes = golove.length > 1 && (goalSpread ?? 0) >= 3
    ? {
      low: { names: golove.filter((t) => t.goals === nejmene).map((t) => t.name), tip: golove[0].tip },
      high: {
        names: golove.filter((t) => t.goals === nejvic).map((t) => t.name),
        tip: golove[golove.length - 1].tip,
      },
    }
    : null;

  /**
   * Kolik RŮZNÝCH příběhů zápas nabízí.
   *
   * Počítají se rodiny, ne jednotlivé příznaky. Jedna událost — třeba
   * osamělá přesná trefa proti celému stolu — je pro text sice několik
   * pěkných pozorování, ale pořád jeden příběh. Bez rozdělení do rodin
   * by z ní vyšlo `high` a nudný zápas by dostal prostor jako chaotický.
   */
  const rodiny = {
    // Někdo to trefil nebo viděl jako jediný správně.
    trefa: exactTipsters.length > 0 || loneCorrect != null,
    // Celý stůl se shodl a byl vedle, nebo se spletli všichni.
    davVedle: everyoneWrong
      || ((consensus?.share ?? 0) >= 0.8 && consensus?.outcome !== skutecny),
    // Naopak: trefili vítěze všichni.
    davTrefil: everyoneRight,
    // Někdo byl výrazně mimo.
    velkyPropad: (furthest?.distance ?? 0) >= 5,
    // Tipy se hodně rozešly.
    rozptyl: extremes != null,
  };

  const notableCount = Object.values(rodiny).filter(Boolean).length;

  return {
    exactTipsters, closest, furthest, loneCorrect, consensus,
    everyoneWrong, everyoneRight, goalSpread, extremes, notableCount,
  };
}

/** Kolik prostoru si text zaslouží. Odvozeno z faktů, bez dalšího volání modelu. */
export type Richness = 'low' | 'medium' | 'high';

export function richnessFrom(notableCount: number): Richness {
  if (notableCount >= 4) return 'high';
  if (notableCount >= 2) return 'medium';
  return 'low';
}

/** Pokyn k rozsahu pro prompt. Rozmezí, ne přesný počet znaků. */
export function richnessGuidance(richness: Richness): string {
  switch (richness) {
    case 'high':
      return 'Materiálu je hodně — máš prostor na tři až čtyři pozorování a pointu. '
        + 'Vyber ty nejsilnější, nevypisuj všechny tipéry za sebou.';
    case 'medium':
      return 'Materiálu je středně — dvě až tři pozorování a krátká pointa stačí.';
    default:
      return 'Materiálu je málo — zůstaň krátký. Jedno až dvě pozorování a pointa. '
        + 'Nic nedomýšlej, jen abys text natáhl.';
  }
}
