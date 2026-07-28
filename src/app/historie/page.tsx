import { HistorieView, type Historie } from '@/components/HistorieView';
import { CompetitionTabs } from '@/components/CompetitionTabs';
import data from '@/data/historie.json';
import { PageHeader } from '@/components/PageHeader';
import { getMsSeason } from '@/lib/msSeason';
import { getLatestSeasonId, getStoppageStats, getWizardAndContinentStats } from '@/lib/queries';
import type { StatCardDef } from '@/lib/statCards';
import { buildHistoricalLeagueRegionTables } from '@/lib/leagueRegions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Historie' };

export default async function HistoriePage() {
  const liga = data as Historie;
  const ms = await getMsSeason();

  // Vítěz ligové sezóny → karta „Nejvíce vítězství" (stejně jako v Síni slávy)
  const winner = liga.players.reduce((a, b) => (liga.stats[b].points > liga.stats[a].points ? b : a));
  const titleRows = [{ name: winner, val: '1×', n: 1 }];

  // Archivní statistiky MS (shodné se Síní slávy), dostupné i po deaktivaci sezóny
  const seasonId = await getLatestSeasonId('ms');
  const [stoppage, wizCont] = seasonId
    ? await Promise.all([getStoppageStats(seasonId), getWizardAndContinentStats(seasonId)])
    : [[], { wizard: [], spodina: [], continents: [], regions: [] }];

  const fmtBal = (b: number) => (b > 0 ? `+${b} b` : b < 0 ? `\u2212${Math.abs(b)} b` : '0 b');
  const msExtra: StatCardDef[] = [
    {
      icon: '⏱️',
      label: 'Pán nastavení',
      accent: 'text-green-400',
      rows: stoppage.map((r) => ({ name: r.name, val: fmtBal(r.balance), n: r.balance })),
    },
  ].filter((c) => c.rows.length > 0);

  const msContinents: StatCardDef[] = wizCont.continents.map((c) => ({
    icon: c.icon,
    label: c.label,
    accent: 'text-pitch-light',
    rows: c.rows.map((r) => ({ name: r.name, val: `${r.points} b`, n: r.points })),
  }));

  const ligaRegions: StatCardDef[] = buildHistoricalLeagueRegionTables(liga.rounds, liga.players).map((region) => ({
    icon: region.icon,
    label: region.label,
    accent: 'text-pitch-light',
    rows: region.rows.map((row) => ({
      name: row.name,
      val: `${row.points} b · ${row.matches} z.`,
      n: row.points,
    })),
  }));

  return (
    <main>
      <PageHeader icon="📚" title="Historie" subtitle="Kompletní průběh soutěží" />
      <CompetitionTabs
        liga={<HistorieView data={liga} titleRows={titleRows} regionalCards={ligaRegions} />}
        ms={ms ? <HistorieView data={ms.data} extraCards={msExtra} trailingCards={msContinents} /> : null}
        msLabel="MS 2026 · archiv"
      />
    </main>
  );
}
