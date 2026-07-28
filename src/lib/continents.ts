/**
 * Rozdělení týmů MS 2026 podle konfederací + hlášková jména kontinentů.
 * Body se tipérovi připisují do „tabulky kontinentu" podle toho, ke kterému
 * kontinentu patří týmy daného zápasu (počítá se za oba týmy — mezikontinentální
 * zápas přispěje do obou tabulek).
 */
export type ContinentKey = 'EU' | 'AF' | 'SA' | 'NA' | 'AS' | 'OC';

export const CONTINENTS: { key: ContinentKey; label: string; icon: string }[] = [
  { key: 'EU', label: 'Civilizace', icon: '🎩' },
  { key: 'AF', label: 'Člověk v tísni', icon: '🫶' },
  { key: 'SA', label: 'Kartel', icon: '💊' },
  { key: 'NA', label: 'Mekáč', icon: '🍔' },
  { key: 'AS', label: 'Aliexpress', icon: '📦' },
  { key: 'OC', label: 'Voceánie', icon: '🌊' },
];

/** Tým (přesně dle názvů v DB) → kontinent. */
export const TEAM_CONTINENT: Record<string, ContinentKey> = {
  // Evropa (UEFA)
  Anglie: 'EU', Belgie: 'EU', 'Bosna a Hercegovina': 'EU', Chorvatsko: 'EU',
  Francie: 'EU', Nizozemsko: 'EU', Norsko: 'EU', Německo: 'EU', Portugalsko: 'EU',
  Rakousko: 'EU', Skotsko: 'EU', Španělsko: 'EU', Švédsko: 'EU', Švýcarsko: 'EU',
  Turecko: 'EU', Česko: 'EU',
  // Afrika (CAF)
  Alžírsko: 'AF', 'DR Kongo': 'AF', Egypt: 'AF', Ghana: 'AF', 'Jižní Afrika': 'AF',
  Kapverdy: 'AF', Maroko: 'AF', 'Pobřeží slonoviny': 'AF', Senegal: 'AF', Tunisko: 'AF',
  // Jižní Amerika (CONMEBOL)
  Argentina: 'SA', Brazílie: 'SA', Ekvádor: 'SA', Kolumbie: 'SA', Paraguay: 'SA',
  Uruguay: 'SA',
  // Severní a Střední Amerika + Karibik (CONCACAF)
  Curaçao: 'NA', Haiti: 'NA', Kanada: 'NA', Mexiko: 'NA', Panama: 'NA', USA: 'NA',
  // Asie (AFC)
  Irák: 'AS', Japonsko: 'AS', 'Jižní Korea': 'AS', Jordánsko: 'AS', Katar: 'AS',
  'Saúdská Arábie': 'AS', Uzbekistán: 'AS', Írán: 'AS',
  // Oceánie (OFC) — Austrálie hraje AFC, ale geograficky ji bereme do Oceánie
  Austrálie: 'OC', 'Nový Zéland': 'OC',
};

/** Kontinenty, kterých se zápas týká (unikátně; mezikontinentální = dva). */
export function matchContinents(home: string, away: string): ContinentKey[] {
  const out = new Set<ContinentKey>();
  const h = TEAM_CONTINENT[home];
  const a = TEAM_CONTINENT[away];
  if (h) out.add(h);
  if (a) out.add(a);
  return [...out];
}
