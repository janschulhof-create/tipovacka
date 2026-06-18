/**
 * Překlad anglických názvů reprezentací (z football-data API) na české,
 * aby šly v H2H zobrazit české názvy i vlajky (přes flagCode).
 */
const normEn = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '')
    .trim();

const EN_TO_CS: Record<string, string> = {
  mexico: 'Mexiko',
  'south africa': 'Jižní Afrika',
  'korea republic': 'Jižní Korea',
  'south korea': 'Jižní Korea',
  czechia: 'Česko',
  'czech republic': 'Česko',
  canada: 'Kanada',
  'bosnia and herzegovina': 'Bosna a Hercegovina',
  'bosnia herzegovina': 'Bosna a Hercegovina',
  qatar: 'Katar',
  switzerland: 'Švýcarsko',
  brazil: 'Brazílie',
  morocco: 'Maroko',
  haiti: 'Haiti',
  scotland: 'Skotsko',
  'united states': 'USA',
  usa: 'USA',
  paraguay: 'Paraguay',
  australia: 'Austrálie',
  turkey: 'Turecko',
  turkiye: 'Turecko',
  germany: 'Německo',
  curacao: 'Curaçao',
  'cote divoire': 'Pobřeží slonoviny',
  'ivory coast': 'Pobřeží slonoviny',
  ecuador: 'Ekvádor',
  netherlands: 'Nizozemsko',
  japan: 'Japonsko',
  sweden: 'Švédsko',
  tunisia: 'Tunisko',
  belgium: 'Belgie',
  egypt: 'Egypt',
  iran: 'Írán',
  'iran islamic republic of': 'Írán',
  'new zealand': 'Nový Zéland',
  spain: 'Španělsko',
  'cape verde': 'Kapverdy',
  'cabo verde': 'Kapverdy',
  'saudi arabia': 'Saúdská Arábie',
  uruguay: 'Uruguay',
  france: 'Francie',
  senegal: 'Senegal',
  iraq: 'Irák',
  norway: 'Norsko',
  argentina: 'Argentina',
  algeria: 'Alžírsko',
  austria: 'Rakousko',
  jordan: 'Jordánsko',
  portugal: 'Portugalsko',
  'congo dr': 'DR Kongo',
  'dr congo': 'DR Kongo',
  'congo democratic republic': 'DR Kongo',
  'democratic republic of congo': 'DR Kongo',
  uzbekistan: 'Uzbekistán',
  colombia: 'Kolumbie',
  england: 'Anglie',
  croatia: 'Chorvatsko',
  ghana: 'Ghana',
  panama: 'Panama',
};

/** Vrátí český název týmu, nebo původní (anglický), pokud ho neznáme. */
export function csTeam(name: string): string {
  if (!name) return name;
  return EN_TO_CS[normEn(name)] ?? name;
}
