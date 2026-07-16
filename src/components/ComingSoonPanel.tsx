import type { Competition } from '@/lib/competitions';
import { Flag } from './Flag';

/** Panel zobrazený, dokud pro soutěž není v DB založená aktivní sezóna. */
export function ComingSoonPanel({ competition }: { competition: Competition }) {
  const isEurope = competition.key === 'evropa';

  return (
    <div className="rounded-2xl border border-terrain-700 bg-terrain-900/40 p-6 text-center">
      <div className="flex justify-center text-4xl">
        {competition.key === 'liga' ? (
          <Flag team="Česko" className="h-8 w-12" />
        ) : (
          <span className="rounded-lg border border-terrain-600 bg-terrain-800 px-2 py-1 text-sm font-bold tracking-wider text-white">
            {competition.icon}
          </span>
        )}
      </div>
      <h2 className="mt-3 font-display text-xl font-bold text-white">{competition.label}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-100/60">
        Pro tuto soutěž zatím není v databázi aktivní sezóna. Spusť připravenou SQL migraci a následně synchronizaci zápasů.
      </p>

      {isEurope && (
        <div className="mx-auto mt-4 max-w-sm rounded-xl border border-terrain-700 bg-terrain-950/40 p-3 text-left">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300/55">
            Výběr zápasů
          </div>
          <ul className="mt-1.5 space-y-1 text-[13px] text-slate-100/70">
            <li className="flex items-center gap-1.5"><Flag team="Česko" /> všechny zápasy českých klubů</li>
            <li>vybrané šlágry podle seznamu v konfiguraci</li>
          </ul>
        </div>
      )}
    </div>
  );
}
