import { PageHeader } from '@/components/PageHeader';
import { H2HCompare, type H2HSeason } from '@/components/H2HCompare';
import historie from '@/data/historie.json';
import { getMsSeason } from '@/lib/msSeason';
import type { SRound } from '@/lib/seasonStats';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'H2H — souboj tipérů' };

export default async function H2HPage() {
  const liga = historie as unknown as { season: string; players: string[]; rounds: SRound[] };
  const seasons: H2HSeason[] = [
    {
      key: `liga-${liga.season}`,
      competition: 'Chance liga',
      season: liga.season,
      players: liga.players,
      rounds: liga.rounds,
    },
  ];

  const ms = await getMsSeason();
  if (ms) {
    seasons.unshift({
      key: 'ms-2026',
      competition: 'MS 2026',
      season: ms.data.season,
      players: ms.data.players,
      rounds: ms.rounds,
    });
  }

  return (
    <main>
      <PageHeader icon="⚔️" title="H2H" subtitle="Souboj dvou tipérů napříč statistikami" />
      <H2HCompare seasons={seasons} />
    </main>
  );
}
