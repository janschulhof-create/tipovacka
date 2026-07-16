/**
 * Centrální konfigurace soutěží — jeden zdroj pravdy pro dashboard i sync.
 *
 * Chance liga je hlavní dlouhodobá soutěž. „Evropa“ sdružuje vybrané zápasy
 * Ligy mistrů, Evropské ligy a Konferenční ligy do jedné tipovací sekce.
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

export const DEFAULT_COMPETITION_KEY: CompetitionKey = 'liga';

export const COMPETITIONS: Competition[] = [
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
  {
    key: 'evropa',
    label: 'Evropa',
    short: 'Evropa',
    icon: 'EU',
    kind: 'curated',
    selection: 'curated',
    active: true,
    espnSlugs: ['uefa.champions', 'uefa.europa', 'uefa.europa.conf'],
  },
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
];

export function getCompetition(key: string | undefined): Competition {
  return (
    COMPETITIONS.find((c) => c.key === key) ??
    COMPETITIONS.find((c) => c.key === DEFAULT_COMPETITION_KEY)!
  );
}
