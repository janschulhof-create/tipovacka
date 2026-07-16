import historie from '@/data/historie.json';
import { PageHeader } from '@/components/PageHeader';
import { CompetitionTabs } from '@/components/CompetitionTabs';
import { HallOfFameSection, type HofSeason } from '@/components/HallOfFameSection';
import { getMsSeason } from '@/lib/msSeason';
import { getActiveSeasonId, getStoppageStats, getWizardAndContinentStats } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function SinSlavyPage() {
  // ── Chance liga: pouze DOKONČENÉ sezóny (MS se sem nikdy nezapočítává) ──
  const liga = historie as unknown as HofSeason;
  const winner = liga.players.reduce((a, b) => (liga.stats[b].points > liga.stats[a].points ? b : a));
  const titleRows = [{ name: winner, val: '1×', n: 1 }];

  // ── MS 2026: probíhající sezóna z DB, stojí bokem ──
  const ms = await getMsSeason();
  const seasonId = await getActiveSeasonId('ms');
  const [stoppage, wizCont] = seasonId
    ? await Promise.all([getStoppageStats(seasonId), getWizardAndContinentStats(seasonId)])
    : [[], { wizard: [], spodina: [], continents: [] }];

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

  return (
    <main>
      <PageHeader icon="🏆" title="Síň slávy" subtitle="Rekordy napříč soutěžemi" />
      <CompetitionTabs
        liga={
          <>
            <p className="mb-4 text-xs text-slate-100/45">
              Rekordy z dokončených sezón Chance ligy ({liga.season}). MS se do nich nezapočítává.
            </p>
            <HallOfFameSection s={liga} titleRows={titleRows} />
          </>
        }
        ms={
          ms ? (
            <>
              <p className="mb-4 text-xs text-slate-100/45">
                Probíhající {ms.data.season} — vlastní rekordy, mimo ligovou Síň slávy.
              </p>
              <HallOfFameSection s={ms.data as unknown as HofSeason} extraCards={msExtra} trailingCards={msContinents} />
            </>
          ) : null
        }
      />
    </main>
  );
}
