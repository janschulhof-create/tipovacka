'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { COMPETITIONS, type CompetitionKey } from '@/lib/competitions';
import { Flag } from './Flag';

function CompIcon({ compKey, icon }: { compKey: CompetitionKey; icon: string }) {
  if (compKey === 'liga') return <Flag team="Česko" />;
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded bg-terrain-800 px-1 text-[9px] font-bold tracking-wide text-slate-100/75">
      {icon}
    </span>
  );
}

/** Přepínač soutěží. Zachovává aktuální stránku a mění pouze `soutez`. */
export function CompetitionSwitcher({ current }: { current: CompetitionKey }) {
  const pathname = usePathname();
  const params = useSearchParams();

  const href = (key: CompetitionKey) => {
    const p = new URLSearchParams(params.toString());
    p.set('soutez', key);
    p.delete('kolo');
    return `${pathname}?${p.toString()}`;
  };

  return (
    <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {COMPETITIONS.map((c) => {
        const on = c.key === current;
        return (
          <Link
            prefetch={false}
            key={c.key}
            href={href(c.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              on
                ? 'bg-pitch text-white shadow'
                : 'border border-terrain-600 bg-terrain-900/60 text-slate-100/60 hover:text-white'
            }`}
          >
            <CompIcon compKey={c.key} icon={c.icon} />
            {c.short}
          </Link>
        );
      })}
    </div>
  );
}
