import type { Competition } from '@/lib/competitions';
import type { Player, StandingRow } from '@/lib/types';
import { CompetitionIcon } from './CompetitionSwitcher';
import { StandingsTable } from './StandingsTable';
import { StatsCards } from './StatsCards';
import { StatCard } from './StatCard';

const EMPTY_DETAIL_CARDS = [
  { icon: '🏅', label: 'Nejvíce vyhraných kol', accent: 'text-pitch-light' },
  { icon: '💥', label: 'Rekord za 1 kolo', accent: 'text-flag' },
  { icon: '💀', label: 'Král nuličky', accent: 'text-control' },
  { icon: '🧠', label: 'Mr. Alzheimer', accent: 'text-control' },
  { icon: '🧙', label: 'Černokněžník (bodoval jako jediný)', accent: 'text-purple-400' },
  { icon: '🤡', label: 'Blamáž (jako jediný nebodoval)', accent: 'text-red-400' },
  { icon: '🎓', label: 'Profesorský fotbal', accent: 'text-slate-300' },
  { icon: '🍀', label: 'Faktor smůly (smolař)', accent: 'text-flag' },
  { icon: '⏱️', label: 'Pán nastavení', accent: 'text-green-400' },
  { icon: '🔁', label: 'Nejčastější tip', accent: 'text-pitch-light' },
  { icon: '🟢', label: 'Čitelný tip (nejčastěji vyšel)', accent: 'text-green-400' },
  { icon: '🔴', label: 'Nečitelný tip (nejčastěji 0 b)', accent: 'text-red-400' },
  { icon: '🎯', label: 'Nejlíp čitelný tým', accent: 'text-pitch-light' },
  { icon: '🌀', label: 'Nejhůř čitelný tým', accent: 'text-control' },
  { icon: '😱', label: 'Překvapení sezóny', accent: 'text-control' },
  { icon: '✅', label: 'Jistota sezóny', accent: 'text-pitch-light' },
];

function emptyStandings(players: Player[]): StandingRow[] {
  return players.map((p) => ({
    player_id: p.id,
    name: p.name,
    season_id: 0,
    points: 0,
    scored_matches: 0,
    exact_hits: 0,
    avg_points: 0,
    success_rate: 0,
  }));
}

/**
 * Plnohodnotný prázdný dashboard pro soutěž, která ještě nemá aktivní sezónu.
 * Rozložení zůstává stejné jako u MS a po synchronizaci se pouze doplní data.
 */
export function ComingSoonPanel({
  competition,
  players = [],
}: {
  competition: Competition;
  players?: Player[];
}) {
  const standings = emptyStandings(players);

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CompetitionIcon compKey={competition.key} className={competition.key === 'liga' ? 'h-8 w-12' : 'h-9 w-9'} />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-wide text-white sm:text-3xl">
              Aktuální kolo
            </h1>
            <div className="truncate text-sm text-slate-300/50">{competition.label}</div>
          </div>
        </div>
      </header>

      <div className="rounded-2xl border border-terrain-700 bg-terrain-900/40 px-4 py-3 text-sm text-slate-100/60">
        Rozpis a výsledky se zobrazí po založení aktivní sezóny a první synchronizaci. Dashboard a všechny statistiky jsou už připravené.
      </div>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="space-y-8 lg:col-span-2">
          <section className="space-y-3">
            <div className="panel">
              <div className="flex min-h-48 flex-col items-center justify-center px-4 py-10 text-center">
                <CompetitionIcon compKey={competition.key} className={competition.key === 'liga' ? 'h-10 w-16 opacity-80' : 'h-12 w-12 opacity-80'} />
                <div className="mt-3 font-display text-lg font-semibold text-white">Zápasy se připravují</div>
                <p className="mt-1 max-w-sm text-sm text-slate-100/50">
                  Po synchronizaci se zde automaticky zobrazí celé aktuální kolo včetně možnosti tipování.
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section>
            <StandingsTable rows={standings} />
          </section>

          <section className="space-y-3">
            <h2 className="eyebrow">
              <span className="flag-chip" /> Vývoj bodů
            </h2>
            <div className="panel px-4 py-4">
              <div className="relative h-40 overflow-hidden rounded-xl border border-terrain-700 bg-terrain-950/35">
                <div className="absolute inset-x-4 top-8 border-t border-dashed border-terrain-600/70" />
                <div className="absolute inset-x-4 top-20 border-t border-dashed border-terrain-600/70" />
                <div className="absolute inset-x-4 bottom-8 border-t border-dashed border-terrain-600/70" />
                <svg viewBox="0 0 320 120" className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] opacity-35" aria-hidden="true">
                  <path d="M8 98 C52 92,72 70,112 76 S174 42,212 54 S268 25,312 32" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" />
                  <path d="M8 105 C50 80,76 96,116 68 S174 78,218 48 S274 54,312 20" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full border border-terrain-600 bg-terrain-900/90 px-3 py-1.5 text-xs text-slate-100/60">
                    Čeká na první body
                  </span>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <section className="mt-6 space-y-4 lg:mt-8">
        <h2 className="eyebrow">
          <span className="flag-chip" /> Statistiky sezóny
        </h2>

        <StatsCards standings={[]} goals={[]} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {EMPTY_DETAIL_CARDS.map((card) => (
            <StatCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              accent={card.accent}
              rows={[]}
            />
          ))}
        </div>
      </section>
    </>
  );
}
