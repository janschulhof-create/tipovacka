import Link from 'next/link';
import { getActiveSeasonId, getUpcomingRounds, getRoundMatches, getPlayers, getRoundPredictions } from '@/lib/queries';
import { getSessionPlayer } from '@/lib/auth';
import { TipovatRounds, type TipovatRound } from '@/components/TipovatRounds';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default async function TipovatPage() {
  const player = await getSessionPlayer();

  if (!player) {
    return (
      <main>
        <PageHeader icon="🎯" title="Tipovat" subtitle="Otevřená kola" />
        <div className="panel p-6 text-center">
          <p className="text-sm text-slate-100/70">Pro tipování se musíš přihlásit.</p>
          <Link href="/prihlaseni" className="btn-pitch mt-4 inline-flex justify-center">
            Přihlásit se
          </Link>
        </div>
      </main>
    );
  }

  const seasonId = await getActiveSeasonId();
  if (!seasonId)
    return <p className="px-1 py-6 text-sm text-slate-100/50">Není aktivní sezóna.</p>;

  const [players, roundNumbers] = await Promise.all([getPlayers(), getUpcomingRounds(seasonId)]);

  const rounds: TipovatRound[] = await Promise.all(
    roundNumbers.map(async (round) => {
      const matches = await getRoundMatches(seasonId, round);
      const predictions = await getRoundPredictions(matches.map((m) => m.id));
      return { round, matches, predictions };
    })
  );

  return (
    <main>
      <PageHeader icon="🎯" title="Tipovat" subtitle="Otevřená kola" />
      <TipovatRounds rounds={rounds} players={players} playerId={player.id} playerName={player.name} />
    </main>
  );
}
