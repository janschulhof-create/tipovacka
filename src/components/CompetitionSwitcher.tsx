'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { COMPETITIONS, type CompetitionKey } from '@/lib/competitions';
import { Flag } from './Flag';

/** Ikona soutěže: česká liga dostane SVG vlajku (emoji 🇨🇿 se na Windows ukáže jako „CZ"). */
function CompIcon({ compKey, icon }: { compKey: CompetitionKey; icon: string }) {
  if (compKey === 'liga') return <Flag team="Česko" />;
  return <span>{icon}</span>;
}

/**
 * Přepínač soutěží nad dashboardem. Přepíná přes ?soutez= (server pak načte
 * data dané soutěže). Zatím je aktivní jen MS; ostatní se připravují a ukážou
 * stav „připravuje se" — proto jsou v přepínači vidět, ale odlišené.
 */
export function CompetitionSwitcher({ current }: { current: CompetitionKey }) {
  const pathname = usePathname();
  const params = useSearchParams();

  const href = (key: CompetitionKey) => {
    const p = new URLSearchParams(params.toString());
    p.set('soutez', key);
    p.delete('kolo'); // kolo patří k jiné soutěži, resetuj
    return `${pathname}?${p.toString()}`;
  };

  // rozdělení: domácí soutěže (MS, liga) vlevo, evropské poháry vpravo
  const firstCupKey = COMPETITIONS.find((c) => c.selection === 'curated')?.key;

  return (
    <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {COMPETITIONS.map((c) => {
        const on = c.key === current;
        return (
          <div key={c.key} className="flex shrink-0 items-center gap-1.5">
            {c.key === firstCupKey && (
              <span className="mx-0.5 h-6 w-px shrink-0 bg-terrain-700" aria-hidden />
            )}
            <Link
              prefetch={false}
              href={href(c.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                on
                  ? 'bg-pitch text-white shadow'
                  : 'border border-terrain-600 bg-terrain-900/60 text-slate-100/60 hover:text-white'
              }`}
            >
              <CompIcon compKey={c.key} icon={c.icon} />
              {c.short}
              {!c.active && (
                <span className="rounded bg-terrain-800/80 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-300/50">
                  brzy
                </span>
              )}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
