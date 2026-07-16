import type { Competition } from '@/lib/competitions';
import { Flag } from './Flag';

/** Panel pro soutěž, která je nachystaná v konfiguraci, ale ještě neběží. */
export function ComingSoonPanel({ competition }: { competition: Competition }) {
  const isCup = competition.selection === 'curated';

  return (
    <div className="rounded-2xl border border-terrain-700 bg-terrain-900/40 p-6 text-center">
      <div className="flex justify-center text-4xl">
        {competition.key === 'liga' ? <Flag team="Česko" className="h-8 w-12" /> : competition.icon}
      </div>
      <h2 className="mt-2 font-display text-xl font-bold text-white">{competition.label}</h2>
      <p className="mt-1 text-sm text-slate-100/60">
        {competition.key === 'liga'
          ? 'Startuje příští víkend. Rozpis a výsledky se napojí přes ESPN, jakmile ověříme první kolo.'
          : 'Připravujeme napojení přes ESPN.'}
      </p>

      {isCup && (
        <div className="mx-auto mt-4 max-w-sm rounded-xl border border-terrain-700 bg-terrain-950/40 p-3 text-left">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300/55">
            Které zápasy se budou tipovat
          </div>
          <ul className="mt-1.5 space-y-1 text-[13px] text-slate-100/70">
            <li className="flex items-center gap-1.5">
              <Flag team="Česko" /> vždy zápasy českých týmů
            </li>
            <li>⭐ vybrané zajímavé šlágry (ručně přidané)</li>
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-slate-300/45">
            Nebereme celé poháry — jen to, co má pro partu smysl tipovat.
          </p>
        </div>
      )}

      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-terrain-800/70 px-3 py-1 text-[11px] font-medium text-slate-300/60">
        <span className="h-1.5 w-1.5 rounded-full bg-flag" />
        Připravuje se
      </div>
    </div>
  );
}
