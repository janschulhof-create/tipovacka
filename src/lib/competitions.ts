/**
 * Centrální konfigurace soutěží — jeden zdroj pravdy pro dashboard i sync.
 *
 * MS 2026 je výchozí soutěž. Chance liga je hlavní dlouhodobá soutěž a
 * „Evropa“ sdružuje vybrané zápasy Ligy mistrů, Evropské ligy a
 * Konferenční ligy do jedné tipovací sekce.
 */
export type CompetitionKey = 'liga' | 'evropa' | 'ms';

export interface Competition {
  key: CompetitionKey;
  label: string;
  short: string;
  icon: string;
  kind: 'cup-knockout' | 'league' | 'curated';
  selection: 'all' | 'curated';
  active: boolean;
  espnSlugs: string[];
}

export const DEFAULT_COMPETITION_KEY: CompetitionKey = 'ms';

export const COMPETITIONS: Competition[] = [
  {
    key: 'ms',
    label: 'MS 2026',
    short: 'MS 2026',
    icon: 'MS',
    kind: 'cup-knockout',
    selection: 'all',
    active: true,
    espnSlugs: ['fifa.world'],
  },
  {
    key: 'liga',
    label: 'Chance liga',
    short: 'Chance liga',
    icon: 'CZ',
    kind: 'league',
    selection: 'all',
    active: true,
    espnSlugs: ['cze.1'],
  },
  /*
   * Evropa je dočasně skrytá pouze v uživatelském rozhraní. Konfiguraci
   * ponecháváme zakomentovanou, aby šla později bezpečně vrátit bez změn API.
   *
  {
    key: 'evropa',
    label: 'Evropa',
    short: 'Evropa',
    icon: 'EU',
    kind: 'curated',
    selection: 'curated',
    active: true,
    espnSlugs: [
      'uefa.champions_qual', 'uefa.champions',
      'uefa.europa_qual', 'uefa.europa',
      'uefa.europa.conf_qual', 'uefa.europa.conf',
    ],
  },
   */
];

export function getCompetition(key: string | undefined): Competition {
  return (
    COMPETITIONS.find((c) => c.key === key) ??
    COMPETITIONS.find((c) => c.key === DEFAULT_COMPETITION_KEY)!
  );
}
