/**
 * Ikony týmů používané v UI.
 *
 * - reprezentační týmy používají vlajky ze sprite souboru /team-sprite-v1.webp
 * - kluby Chance ligy používají loga vložená ve stejném sprite souboru
 *
 * Názvy klubů jsou mapované přes přesné aliasy, aby se například Slavia Praha
 * nezaměnila se Slavií Sofia nebo Sparta Praha se Spartou Rotterdam.
 */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const CLUB_LOGOS: Record<string, string> = {
  'artis brno': 'artis-brno',
  'sk artis brno': 'artis-brno',

  banik: 'banik',
  'banik ostrava': 'banik',
  'fc banik ostrava': 'banik',

  bohemians: 'bohemians',
  'bohemians 1905': 'bohemians',
  'bohemians praha 1905': 'bohemians',

  'hradec kralove': 'hradec-kralove',
  'fc hradec kralove': 'hradec-kralove',

  jablonec: 'jablonec',
  'fk jablonec': 'jablonec',

  boleslav: 'boleslav',
  'mlada boleslav': 'boleslav',
  'fk mlada boleslav': 'boleslav',

  pardubice: 'pardubice',
  'fk pardubice': 'pardubice',

  olomouc: 'olomouc',
  sigma: 'olomouc',
  'sigma olomouc': 'olomouc',
  'sk sigma olomouc': 'olomouc',

  slavia: 'slavia',
  'slavia praha': 'slavia',
  'slavia prague': 'slavia',
  'sk slavia praha': 'slavia',
  'sk slavia prague': 'slavia',

  slovacko: 'slovacko',
  '1 fc slovacko': 'slovacko',

  liberec: 'liberec',
  'slovan liberec': 'liberec',
  'fc slovan liberec': 'liberec',

  sparta: 'sparta',
  'sparta praha': 'sparta',
  'sparta prague': 'sparta',
  'ac sparta praha': 'sparta',
  'ac sparta prague': 'sparta',

  teplice: 'teplice',
  'fk teplice': 'teplice',

  plzen: 'plzen',
  'viktoria plzen': 'plzen',
  'fc viktoria plzen': 'plzen',

  'zbrojovka brno': 'zbrojovka-brno',
  'fc zbrojovka brno': 'zbrojovka-brno',

  zlin: 'zlin',
  'fc zlin': 'zlin',
  'fastav zlin': 'zlin',
  'fc fastav zlin': 'zlin',
};

export function clubLogoId(name: string): string | null {
  if (!name) return null;
  return CLUB_LOGOS[norm(name)] ?? null;
}

/**
 * Názvy používané pro bezplatné dohledání klubového znaku v TheSportsDB.
 * České překlady a zkrácené názvy převádíme na mezinárodní klubový název,
 * aby se například Bayern Mnichov nehledal pod českým překladem.
 */
const LOGO_SEARCH_NAMES: Record<string, string> = {
  'bayern mnichov': 'Bayern Munich',
  'inter milan': 'Inter Milan',
  'ac milan': 'AC Milan',
  'atletico madrid': 'Atletico Madrid',
  neapol: 'Napoli',
  'aek atheny': 'AEK Athens',
  strasburk: 'Strasbourg',
  'sachtar doneck': 'Shakhtar Donetsk',
  'dynamo kyjev': 'Dynamo Kyiv',
  'rapid viden': 'Rapid Vienna',
  'crvena zvezda': 'Red Star Belgrade',
  'dinamo zagreb': 'Dinamo Zagreb',
  'slovan bratislava': 'Slovan Bratislava',
  'austria wien': 'Austria Vienna',
  'basaksehir': 'Istanbul Basaksehir',
  'besiktas': 'Besiktas',
  'ferencvaros': 'Ferencvaros',
  malmo: 'Malmo FF',
  'copenhagen': 'FC Copenhagen',
  'club brugge': 'Club Brugge',
  'sporting cp': 'Sporting Lisbon',
  psg: 'Paris Saint-Germain',
  'bohemians dublin': 'Bohemian FC',
};

export function clubLogoSearchName(name: string): string {
  if (!name) return '';
  return LOGO_SEARCH_NAMES[norm(name)] ?? name;
}

const CODES: Record<string, string> = {
  mexiko: 'mx', 'jizni afrika': 'za', 'jizni korea': 'kr', cesko: 'cz', kanada: 'ca',
  'bosna a hercegovina': 'ba', katar: 'qa', svycarsko: 'ch', brazilie: 'br', maroko: 'ma',
  haiti: 'ht', skotsko: 'gb-sct', usa: 'us', paraguay: 'py', australie: 'au', turecko: 'tr',
  nemecko: 'de', curacao: 'cw', 'pobrezi slonoviny': 'ci', ekvador: 'ec', nizozemsko: 'nl',
  japonsko: 'jp', svedsko: 'se', tunisko: 'tn', belgie: 'be', egypt: 'eg', iran: 'ir',
  'novy zeland': 'nz', spanelsko: 'es', kapverdy: 'cv', 'saudska arabie': 'sa', uruguay: 'uy',
  francie: 'fr', senegal: 'sn', irak: 'iq', norsko: 'no', argentina: 'ar', alzirsko: 'dz',
  rakousko: 'at', jordansko: 'jo', portugalsko: 'pt', 'dr kongo': 'cd', uzbekistan: 'uz',
  kolumbie: 'co', anglie: 'gb-eng', chorvatsko: 'hr', ghana: 'gh', panama: 'pa',
};

export function flagCode(name: string): string | null {
  if (!name) return null;
  const k = norm(name);
  if (CODES[k]) return CODES[k];
  // robustní fallback pro problematické/odlišně psané názvy reprezentací
  if (k.includes('bosn')) return 'ba';
  if (k.includes('verde') || k.includes('kapverd')) return 'cv';
  return null;
}


/** Pozice ikon v komprimovaném sprite souboru /team-sprite-v1.webp. */
const FLAG_SPRITE_ORDER = [
  'ar', 'at', 'au', 'ba', 'be', 'br', 'ca', 'cd',
  'ch', 'ci', 'co', 'cv', 'cw', 'cz', 'de', 'dz',
  'ec', 'eg', 'es', 'fr', 'gb-eng', 'gb-sct', 'gh', 'hr',
  'ht', 'iq', 'ir', 'jo', 'jp', 'kr', 'ma', 'mx',
  'nl', 'no', 'nz', 'pa', 'pt', 'py', 'qa', 'sa',
  'se', 'sn', 'tn', 'tr', 'us', 'uy', 'uz', 'za',
] as const;

const CLUB_SPRITE_ORDER = [
  'artis-brno', 'banik', 'bohemians', 'hradec-kralove',
  'jablonec', 'boleslav', 'pardubice', 'olomouc',
  'slavia', 'slovacko', 'liberec', 'sparta',
  'teplice', 'plzen', 'zbrojovka-brno', 'zlin',
] as const;

const FLAG_SPRITE_INDEX = new Map<string, number>(
  FLAG_SPRITE_ORDER.map((code, index) => [code, index]),
);
const CLUB_SPRITE_INDEX = new Map<string, number>(
  CLUB_SPRITE_ORDER.map((id, index) => [id, index + FLAG_SPRITE_ORDER.length]),
);

export function flagSpriteIndex(code: string): number | null {
  return FLAG_SPRITE_INDEX.get(code) ?? null;
}

export function clubSpriteIndex(id: string): number | null {
  return CLUB_SPRITE_INDEX.get(id) ?? null;
}
