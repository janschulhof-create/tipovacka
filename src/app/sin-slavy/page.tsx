import historie from '@/data/historie.json';
import { PageHeader } from '@/components/PageHeader';
import { CompetitionTabs } from '@/components/CompetitionTabs';
import { HallOfFameSection, type HofSeason } from '@/components/HallOfFameSection';
import { getMsSeason } from '@/lib/msSeason';
import { getLatestSeasonId, getStoppageStats, getWizardAndContinentStats } from '@/lib/queries';
import { buildHistoricalLeagueRegionTables } from '@/lib/leagueRegions';

export const dynamic = 'force-dynamic';

export default async function SinSlavyPage() {
  // ── Chance liga: pouze DOKONČENÉ sezóny (MS se sem nikdy nezapočítává) ──
  const liga = historie as unknown as HofSeason;
  const winner = liga.players.reduce((a, b) => (liga.stats[b].points > liga.stats[a].points ? b : a));
  const titleRows = [{ name: winner, val: '1×', n: 1 }];

  // ── MS 2026: dokončený archiv z DB, stojí bokem ──
  const ms = await getMsSeason();
  const seasonId = await getLatestSeasonId('ms');
  const [stoppage, wizCont] = seasonId
    ? await Promise.all([getStoppageStats(seasonId), getWizardAndContinentStats(seasonId)])
    : [[], { wizard: [], spodina: [], continents: [], regions: [] }];

  // statistiky, které má smysl ukazovat JEN u MS
  const fmtBal = (b: number) => (b > 0 ? `+${b} b` : b < 0 ? `\u2212${Math.abs(b)} b` : '0 b');
  const msExtra = [
    {
      icon: '⏱️',
      label: 'Pán nastavení',
      accent: 'text-green-400',
      rows: stoppage.map((r) => ({ name: r.name, val: fmtBal(r.balance), n: r.balance })),
    },
  ].filter((c) => c.rows.length > 0);

  const msContinents = wizCont.continents.map((c) => ({
    icon: c.icon,
    label: c.label,
    accent: 'text-pitch-light',
    rows: c.rows.map((r) => ({ name: r.name, val: `${r.points} b`, n: r.points })),
  }));

  const msWinner = ms
    ? ms.data.players.reduce((a, b) => (ms.data.stats[b].points > ms.data.stats[a].points ? b : a))
    : null;
  const msTitleRows = msWinner ? [{ name: msWinner, val: '1×', n: 1 }] : undefined;

  const ligaRegions = buildHistoricalLeagueRegionTables(liga.rounds, liga.players).map((region) => ({
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
      <PageHeader icon="🏆" title="Síň slávy" subtitle="Rekordy napříč soutěžemi" />
      <CompetitionTabs
        liga={
          <>
            <p className="mb-4 text-xs text-slate-100/45">
              Rekordy z dokončených sezón Chance ligy ({liga.season}). MS se do nich nezapočítává.
            </p>
            <HallOfFameSection s={liga} titleRows={titleRows} regionalCards={ligaRegions} />
          </>
        }
        ms={
          ms ? (
            <>
              <p className="mb-4 text-xs text-slate-100/45">
                Dokončené {ms.data.season} — konečné pořadí a rekordy jsou vedené samostatně od Chance ligy.
              </p>
              <HallOfFameSection
                s={ms.data as unknown as HofSeason}
                titleRows={msTitleRows}
                extraCards={msExtra}
                trailingCards={msContinents}
              />
            </>
          ) : null
        }
        msLabel="MS 2026 · archiv"
      />
    </main>
  );
}
