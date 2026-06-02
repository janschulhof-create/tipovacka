import Link from 'next/link';
import { getActiveSeasonId, getCurrentRound, getRoundMatches, getPlayers } from '@/lib/queries';
import { PredictionForm } from '@/components/PredictionForm';

export const dynamic = 'force-dynamic';

export default async function TipovatPage() {
  const seasonId = await getActiveSeasonId();
  if (!seasonId) return <p className="px-4 py-6 text-sm text-slate-400">Není aktivní sezóna.</p>;

  const round = await getCurrentRound(seasonId);
  const [players, matches] = await Promise.all([
    getPlayers(),
    round ? getRoundMatches(seasonId, round) : Promise.resolve([]),
  ]);

  return (
    <main>
      <header className="flex items-center gap-3 px-4 pb-2 pt-5">
        <Link href="/" className="text-slate-400">←</Link>
        <h1 className="text-lg font-bold">{round ? `Tipy — ${round}. kolo` : 'Tipování'}</h1>
      </header>
      <PredictionForm players={players} matches={matches} />
    </main>
  );
}
