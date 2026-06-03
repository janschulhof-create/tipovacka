import Link from 'next/link';
import {
  getActiveSeason,
  getCurrentRound,
  getRoundMatches,
  getStandings,
  getGoalStats,
  getMisses,
  getPlayers,
  getRoundPredictions,
} from '@/lib/queries';
import { MatchList } from '@/components/MatchList';
import { StandingsTable } from '@/components/StandingsTable';
import { StatsCards } from '@/components/StatsCards';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const season = await getActiveSeason();
  if (!season) return <Empty msg="Není nastavená aktivní sezóna." />;
  const seasonId = season.id;

  const round = await getCurrentRound(seasonId);
  const matches = round ? await getRoundMatches(seasonId, round) : [];
  const [standings, goals, misses, players, predictions] = await Promise.all([
    getStandings(seasonId),
    getGoalStats(seasonId),
    getMisses(seasonId),
    getPlayers(),
    getRoundPredictions(matches.map((m) => m.id)),
  ]);

  return (
    <main>
      <header className="px-4 pb-2 pt-5">
        <h1 className="text-xl font-bold">{season.name} Tipovačka</h1>
      </header>

      {/* Velké tlačítko – ihned viditelné */}
      <div className="px-4 py-3">
        <Link
          href="/tipovat"
          className="block rounded-2xl bg-brand py-4 text-center text-lg font-bold text-ink shadow-lg active:scale-[0.99]"
        >
          🎯 TIPOVAT AKTUÁLNÍ KOLO
        </Link>
      </div>

      <section className="mt-2">
        <h2 className="px-4 pb-1 text-sm font-semibold text-slate-300">
          {round ? `${round}. kolo` : 'Aktuální kolo'}
        </h2>
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          {matches.length ? <MatchList matches={matches} players={players} predictions={predictions} /> : <Empty msg="Rozpis se načte po synchronizaci." />}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="px-4 pb-1 text-sm font-semibold text-slate-300">Průběžná tabulka</h2>
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <StandingsTable rows={standings} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="px-4 pb-2 text-sm font-semibold text-slate-300">Statistiky</h2>
        <StatsCards standings={standings} goals={goals} misses={misses} />
      </section>
    </main>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="px-4 py-6 text-sm text-slate-400">{msg}</p>;
}
