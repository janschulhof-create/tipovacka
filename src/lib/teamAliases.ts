/** Sjednocení názvů klubů z veřejných zdrojů, ESPN, historie a ručních konfigurací. */
const ALIASES: Record<string, string> = {
  Sigma: 'Olomouc',
  'Sigma Olomouc': 'Olomouc',
  'SK Sigma Olomouc': 'Olomouc',
  Bolka: 'Boleslav',
  'Mlada Boleslav': 'Boleslav',
  'Mladá Boleslav': 'Boleslav',
  'FK Mladá Boleslav': 'Boleslav',
  Ostrava: 'Baník',
  'Baník Ostrava': 'Baník',
  'Banik Ostrava': 'Baník',
  'FC Baník Ostrava': 'Baník',
  'FC Banik Ostrava': 'Baník',
  'Jabl*nec': 'Jablonec',
  'FK Jablonec': 'Jablonec',
  'Sparta Praha': 'Sparta',
  'AC Sparta Prague': 'Sparta',
  'AC Sparta Praha': 'Sparta',
  'Sparta Prague': 'Sparta',
  'Slavia Praha': 'Slavia',
  'SK Slavia Prague': 'Slavia',
  'SK Slavia Praha': 'Slavia',
  'Slavia Prague': 'Slavia',
  'Viktoria Plzen': 'Plzeň',
  'Viktoria Plzeň': 'Plzeň',
  'FC Viktoria Plzeň': 'Plzeň',
  'FC Viktoria Plzen': 'Plzeň',
  'FC Slovan Liberec': 'Liberec',
  'Slovan Liberec': 'Liberec',
  Karvina: 'Karviná',
  'MFK Karvina': 'Karviná',
  'MFK Karviná': 'Karviná',
  'Hradec Kralove': 'Hradec Králové',
  'FC Hradec Kralove': 'Hradec Králové',
  'FC Hradec Králové': 'Hradec Králové',
  Hradec: 'Hradec Králové',
  'FK Pardubice': 'Pardubice',
  'FK Dukla Praha': 'Dukla',
  'Dukla Praha': 'Dukla',
  'Dukla Prague': 'Dukla',
  Zlin: 'Zlín',
  'FC Fastav Zlin': 'Zlín',
  'FC Zlín': 'Zlín',
  'FK Teplice': 'Teplice',
  'Bohemians 1905': 'Bohemians',
  'Bohemians Praha 1905': 'Bohemians',
  Bohemka: 'Bohemians',
  Slovacko: 'Slovácko',
  '1. FC Slovacko': 'Slovácko',
  '1.FC Slovacko': 'Slovácko',
  '1.FC Slovácko': 'Slovácko',
  '1. FC Slovácko': 'Slovácko',
  'FC Zbrojovka Brno': 'Zbrojovka Brno',
  Zbrojovka: 'Zbrojovka Brno',
  'SK Artis Brno': 'Artis Brno',
  Artis: 'Artis Brno',
  // Klub před sezonou 2026/27 změnil název z Líšně na Artis. Některé live
  // zdroje ale ještě používají historický název, proto musí obě identity
  // skončit pod stejným kanonickým týmem.
  'SK Líšeň': 'Artis Brno',
  'SK Lisen': 'Artis Brno',
  'SK Líšeň 2019': 'Artis Brno',
  'SK Lisen 2019': 'Artis Brno',
  Líšeň: 'Artis Brno',
  Lisen: 'Artis Brno',
  'Zbrojovka Brno': 'Zbrojovka Brno',
  'FC SILON Táborsko': 'Táborsko',
  'FC Táborsko': 'Táborsko',
  Taborsko: 'Táborsko',
  'Real Madrid CF': 'Real Madrid',
  'FC Barcelona': 'Barcelona',
  'Paris Saint-Germain': 'PSG',
  'Paris Saint Germain': 'PSG',
  'FC Bayern Munich': 'Bayern Mnichov',
  'Bayern München': 'Bayern Mnichov',
  'FC Bayern München': 'Bayern Mnichov',
  'Bayern Munich': 'Bayern Mnichov',
  Internazionale: 'Inter Milán',
  Inter: 'Inter Milán',
  'Inter Milan': 'Inter Milán',
  'AC Milan': 'AC Milán',
  Milan: 'AC Milán',
  'Atletico Madrid': 'Atlético Madrid',
  'Atlético de Madrid': 'Atlético Madrid',
  'Borussia Dortmund': 'Dortmund',
  'Borussia Dortmund GmbH & Co. KGaA': 'Dortmund',
  'Manchester City': 'Manchester City',
  'Manchester United': 'Manchester United',
  'SSC Napoli': 'Neapol',
  Napoli: 'Neapol',
  'SL Benfica': 'Benfica',
  'FC Porto': 'Porto',
  'Sporting Lisbon': 'Sporting CP',
  'Sporting Clube de Portugal': 'Sporting CP',
  'RC Celta de Vigo': 'Celta Vigo',
  Celta: 'Celta Vigo',
  'SC Freiburg': 'Freiburg',
  'Nottingham Forest FC': 'Nottingham Forest',
  'AEK Athens': 'AEK Athény',
  'AEK Athens FC': 'AEK Athény',
  Strasbourg: 'Štrasburk',
  'RC Strasbourg Alsace': 'Štrasburk',
  'Shakhtar Donetsk': 'Šachtar Doněck',
  'FC Shakhtar Donetsk': 'Šachtar Doněck',
  '1. FSV Mainz 05': 'Mainz',
  'FSV Mainz 05': 'Mainz',
  'AZ Alkmaar': 'AZ Alkmaar',
  'Rayo Vallecano de Madrid': 'Rayo Vallecano',
  'AFC Ajax': 'Ajax',
  'Ajax Amsterdam': 'Ajax',
  'Celtic FC': 'Celtic',
  'Rangers FC': 'Rangers',
  'Fenerbahce': 'Fenerbahçe',
  'Fenerbahçe SK': 'Fenerbahçe',
  'Feyenoord Rotterdam': 'Feyenoord',
  'Club Brugge KV': 'Club Brugge',
  'Red Bull Salzburg': 'Salzburg',
  'FC Salzburg': 'Salzburg',
  'Red Star Belgrade': 'Crvena zvezda',
  'Crvena Zvezda': 'Crvena zvezda',
  'FK Crvena Zvezda': 'Crvena zvezda',
  'F.C. Copenhagen': 'Copenhagen',
  'FC Copenhagen': 'Copenhagen',
  'Ferencvaros': 'Ferencváros',
  'Ferencvárosi TC': 'Ferencváros',
  'Panathinaikos FC': 'Panathinaikos',
  'Dynamo Kyiv': 'Dynamo Kyjev',
  'FC Dynamo Kyiv': 'Dynamo Kyjev',
  'FC Basel 1893': 'Basel',
  'Malmo FF': 'Malmö',
  'Malmö FF': 'Malmö',
  'SK Slovan Bratislava': 'Slovan Bratislava',
  'ŠK Slovan Bratislava': 'Slovan Bratislava',
  'SK Sturm Graz': 'Sturm Graz',
  'OGC Nice': 'Nice',
  'RSC Anderlecht': 'Anderlecht',
  'Besiktas': 'Beşiktaş',
  'Besiktas JK': 'Beşiktaş',
  'Beşiktaş JK': 'Beşiktaş',
  'KAA Gent': 'Gent',
  'FK Austria Wien': 'Austria Wien',
  'Austria Vienna': 'Austria Wien',
  'Istanbul Basaksehir': 'Başakşehir',
  'İstanbul Başakşehir FK': 'Başakşehir',
  'SK Rapid Wien': 'Rapid Vídeň',
  'Rapid Vienna': 'Rapid Vídeň',
  'PAOK Thessaloniki': 'PAOK',
  'PAOK FC': 'PAOK',
  'GNK Dinamo Zagreb': 'Dinamo Zagreb',
  'Bohemian FC': 'Bohemians Dublin',
};


// ─────────────────────────────────────────────────────────────────────────────
//  NORMALIZACE NÁZVU — jediná centrální vrstva identity týmů
//
//  Historie: `canonTeam()` bylo pouhé přesné vyhledání v tabulce. Stačila
//  jiná velikost písmen, dvojitá mezera nebo klubový prefix a párování
//  selhalo. Kvůli tomu se opakovaně nespároval živý zápas FC Artis Brno.
//
//  Řešení: název se nejdřív normalizuje (diakritika, velikost, mezery, tečky,
//  klubové prefixy) a teprve normalizovaný tvar se hledá v tabulce.
//  Provider-specific překlady se odvozují odsud, nevznikají vedle.
// ─────────────────────────────────────────────────────────────────────────────

/** Klubové prefixy, které nenesou identitu. Řadové „1.“ je řešeno zvlášť. */
const CLUB_PREFIXES = new Set([
  'fc', 'sk', 'ac', 'fk', 'mfk', 'sfc', 'tj', 'ss', 'cfk', 'lfc', 'afk', 'msk',
]);

/**
 * Přípony označující rezervní, ženský nebo mládežnický tým.
 * Tyto se NIKDY nesmí sloučit s A-týmem — tvrdý invariant.
 */
const RESERVE_SUFFIXES = new Set(['b', 'c', 'ii', 'iii', 'u19', 'u21', 'u23', 'juniori', 'zeny', 'w']);

/** Odstraní diakritiku a sjednotí zápis. */
export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalizuje název týmu na porovnatelný tvar.
 *
 * Vrací `{ key, reserve }` — `key` je porovnávací klíč A-týmu a `reserve`
 * případné označení rezervy. Rezerva se do klíče promítne, takže
 * „Artis Brno B“ nikdy nesplyne s „Artis Brno“.
 */
export function normalizeTeamName(name: string): { key: string; reserve: string | null } {
  const zaklad = stripDiacritics(String(name ?? ''))
    .toLowerCase()
    .replace(/[.,]/g, ' ')      // tečky a čárky nenesou význam
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!zaklad) return { key: '', reserve: null };

  let slova = zaklad.split(' ');

  // Řadové číslo na začátku („1. FC Slovácko“, „1.SK Líšeň“).
  if (/^\d+$/.test(slova[0])) slova = slova.slice(1);

  // Klubové prefixy na začátku i na konci („FC Slovácko“, „Slovácko FC“).
  while (slova.length > 1 && CLUB_PREFIXES.has(slova[0])) slova = slova.slice(1);
  while (slova.length > 1 && CLUB_PREFIXES.has(slova[slova.length - 1])) slova = slova.slice(0, -1);

  // Rezervní tým se odděluje, ale NEZAHAZUJE.
  let reserve: string | null = null;
  const posledni = slova[slova.length - 1];
  if (slova.length > 1 && RESERVE_SUFFIXES.has(posledni)) {
    reserve = posledni;
    slova = slova.slice(0, -1);
  }

  // Rok založení v názvu („SK Líšeň 2019“) identitu nemění.
  if (slova.length > 1 && /^(19|20)\d{2}$/.test(slova[slova.length - 1])) {
    slova = slova.slice(0, -1);
  }

  return { key: slova.join(' '), reserve };
}

/**
 * Tabulka kanonických identit podle NORMALIZOVANÉHO klíče.
 * Vzniká automaticky z `ALIASES`, aby existoval jediný zdroj pravdy.
 */
const CANONICAL_BY_KEY = new Map<string, string>();
for (const [alias, canonical] of Object.entries(ALIASES)) {
  const { key, reserve } = normalizeTeamName(alias);
  if (key && !reserve) CANONICAL_BY_KEY.set(key, canonical);
  // Kanonický název musí být rozpoznatelný i sám o sobě.
  const cil = normalizeTeamName(canonical);
  if (cil.key && !cil.reserve) CANONICAL_BY_KEY.set(cil.key, canonical);
}

/** Doplňkové tvary, které poskytovatelé používají a v ALIASES nejsou. */
for (const [alias, canonical] of Object.entries({
  'artis brno': 'Artis Brno',
  'lisen': 'Artis Brno',
  'slovacko': 'Slovácko',
  'slovacko b': 'Slovácko',
  'bohemians 1905': 'Bohemians',
  'bohemians praha 1905': 'Bohemians',
  'zbrojovka brno': 'Zbrojovka Brno',
  'teplice': 'Teplice',
  'zlin': 'Zlín',
})) {
  const { key, reserve } = normalizeTeamName(alias);
  if (key && !reserve) CANONICAL_BY_KEY.set(key, canonical);
}

export function canonTeam(name: string): string {
  const t = String(name ?? '').trim();
  if (!t) return t;

  // 1) přesná shoda v tabulce má vždy přednost (zpětná kompatibilita)
  if (ALIASES[t]) return ALIASES[t];

  const { key, reserve } = normalizeTeamName(t);
  if (!key) return t;

  // 2) rezervní tým se NIKDY neslučuje s A-týmem
  if (reserve) return t;

  // 3) kanonická identita podle normalizovaného klíče
  return CANONICAL_BY_KEY.get(key) ?? t;
}

/**
 * Porovná dva názvy týmů jako jednu klubovou identitu.
 * Rezervní týmy se nikdy nerovnají A-týmu.
 */
export function isSameTeam(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na.key || !nb.key) return false;
  if ((na.reserve ?? null) !== (nb.reserve ?? null)) return false;
  return canonTeam(a) === canonTeam(b) || na.key === nb.key;
}

/** Porovná dvojici týmů (zápas) — kontroluje OBA týmy, ne jen domácí. */
export function isSameFixture(
  app: { home: string; away: string },
  provider: { home: string; away: string },
): boolean {
  return isSameTeam(app.home, provider.home) && isSameTeam(app.away, provider.away);
}


/** Varianty názvu vhodné pro cílené dotazy do externích API. */
export function externalTeamAliases(name: string): string[] {
  const canonical = canonTeam(name);
  const variants: Record<string, string[]> = {
    'Artis Brno': ['Artis Brno', 'SK Artis Brno', 'Lisen', 'SK Lisen', 'SK Lisen 2019', 'Líšeň', 'SK Líšeň', 'SK Líšeň 2019'],
    'Boleslav': ['Mlada Boleslav', 'Mladá Boleslav', 'FK Mlada Boleslav', 'FK Mladá Boleslav', 'Boleslav'],
  };
  return Array.from(new Set([name, canonical, ...(variants[canonical] ?? [])].map((value) => value.trim()).filter(Boolean)));
}
