/**
 * Centrální konfigurace soutěží — jeden zdroj pravdy pro dashboard i budoucí sync.
 *
 * `slug`      = ESPN league slug (ověřeno z ESPN seznamu lig).
 * `kind`      = jak se soutěž chová (poháry mají vyřazovací názvy kol, liga „N. kolo").
 * `selection` = které zápasy bereme:
 *                 'all'     → všechny (MS, Chance liga),
 *                 'curated' → jen vybrané (evropské poháry: české týmy vždy + ručně vybrané).
 * `active`    = jestli už reálně jede (má data v DB / zapnutý sync).
 */
export type CompetitionKey = 'ms' | 'liga' | 'lm' | 'el' | 'ekl';

export interface Competition {
  key: CompetitionKey;
  label: string; // plný název
  short: string; // do přepínače
  icon: string;
  slug: string; // ESPN slug
  kind: 'cup-knockout' | 'league' | 'cup-mixed';
  selection: 'all' | 'curated';
  active: boolean;
}

export const COMPETITIONS: Competition[] = [
  {
    key: 'ms',
    label: 'MS 2026',
    short: 'MS 2026',
    icon: '🌍',
    slug: 'fifa.world',
    kind: 'cup-knockout',
    selection: 'all',
    active: true, // právě dobíhá
  },
  {
    key: 'liga',
    label: 'Chance liga',
    short: 'Chance liga',
    icon: '🇨🇿',
    slug: 'cze.1',
    kind: 'league',
    selection: 'all',
    active: false, // startuje příští víkend – čeká na ověření cze.1
  },
  {
    key: 'lm',
    label: 'Liga mistrů',
    short: 'LM',
    icon: '🏆',
    slug: 'uefa.champions',
    kind: 'cup-mixed',
    selection: 'curated', // jen české týmy + vybrané zajímavé zápasy
    active: false,
  },
  {
    key: 'el',
    label: 'Evropská liga',
    short: 'EL',
    icon: '🥈',
    slug: 'uefa.europa',
    kind: 'cup-mixed',
    selection: 'curated',
    active: false,
  },
  {
    key: 'ekl',
    label: 'Evropská konferenční liga',
    short: 'EKL',
    icon: '🥉',
    slug: 'uefa.europa.conf',
    kind: 'cup-mixed',
    selection: 'curated',
    active: false,
  },
];

export function getCompetition(key: string | undefined): Competition {
  return COMPETITIONS.find((c) => c.key === key) ?? COMPETITIONS[0];
}
