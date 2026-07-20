/**
 * Centrální konfigurace soutěží — jeden zdroj pravdy pro dashboard i sync.
 *
 * Po skončení MS 2026 je výchozí a jedinou veřejnou soutěží dashboardu
 * Chance liga. MS zůstává v konfiguraci kvůli archivním datům, ale na
 * dashboardu se už nenabízí; kompletní výsledky jsou v Historii a Síni slávy.
 */
export type CompetitionKey = 'liga' | 'evropa' | 'ms';

/**
 * Kompletní počet utkání ročníku Chance Ligy 2026/27.
 *
 * 240 základní část
 * + 15 skupina o titul
 * + 15 skupina o záchranu
 * + 6 play-off o umístění
 * + 4 barážová utkání
 * = 280 zápasů
 */
export const CHANCE_LIGA_REGULAR_MATCHES = 240;
export const CHANCE_LIGA_POSTSEASON_MATCHES = 36;
export const CHANCE_LIGA_RELEGATION_PLAYOFF_MATCHES = 4;
export const CHANCE_LIGA_TOTAL_MATCHES =
  CHANCE_LIGA_REGULAR_MATCHES
  + CHANCE_LIGA_POSTSEASON_MATCHES
  + CHANCE_LIGA_RELEGATION_PLAYOFF_MATCHES;

/** Jeden klub odehraje 30 zápasů základní části a standardně 5 v nadstavbě. */
export const CHANCE_LIGA_TEAM_TREND_MATCHES = 35;

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

/** Soutěže dostupné na hlavním dashboardu. MS 2026 je po skončení pouze v archivu. */
export const DASHBOARD_COMPETITIONS = COMPETITIONS.filter((competition) => competition.key !== 'ms');

/** Resolver pro dashboard: archivní nebo neznámý klíč vždy bezpečně vrátí Chance ligu. */
export function getDashboardCompetition(key: string | undefined): Competition {
  return (
    DASHBOARD_COMPETITIONS.find((competition) => competition.key === key) ??
    DASHBOARD_COMPETITIONS.find((competition) => competition.key === DEFAULT_COMPETITION_KEY)!
  );
}

/** Obecný resolver ponechaný i pro interní synchronizace a archivní práci s daty. */
export function getCompetition(key: string | undefined): Competition {
  return (
    COMPETITIONS.find((c) => c.key === key) ??
    COMPETITIONS.find((c) => c.key === DEFAULT_COMPETITION_KEY)!
  );
}
