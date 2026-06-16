/**
 * Mapa českých názvů týmů → ISO kód pro vlajku (flagcdn.com).
 * Domácí země UK mají speciální kódy (gb-eng, gb-sct). Čistě frontend, bez API.
 */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '')
    .trim();

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
  return CODES[norm(name)] ?? null;
}
