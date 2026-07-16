'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { COMPETITIONS, type CompetitionKey } from '@/lib/competitions';
import { Flag } from './Flag';

/** Jednotné ikony soutěží používané v přepínači i prázdném dashboardu. */
export function CompetitionIcon({
  compKey,
  className = 'h-5 w-5',
}: {
  compKey: CompetitionKey;
  className?: string;
}) {
  if (compKey === 'liga') {
    return <Flag team="Česko" className={`${className} object-cover`} />;
  }

  if (compKey === 'evropa') {
    return (
      <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#17408b" />
        <g fill="#ffd43b">
          <circle cx="12" cy="3.9" r="0.9" />
          <circle cx="16.05" cy="5" r="0.9" />
          <circle cx="19" cy="7.95" r="0.9" />
          <circle cx="20.1" cy="12" r="0.9" />
          <circle cx="19" cy="16.05" r="0.9" />
          <circle cx="16.05" cy="19" r="0.9" />
          <circle cx="12" cy="20.1" r="0.9" />
          <circle cx="7.95" cy="19" r="0.9" />
          <circle cx="5" cy="16.05" r="0.9" />
          <circle cx="3.9" cy="12" r="0.9" />
          <circle cx="5" cy="7.95" r="0.9" />
          <circle cx="7.95" cy="5" r="0.9" />
        </g>
        <circle cx="12" cy="12" r="4.1" fill="#f8fafc" stroke="#0f244f" strokeWidth="0.65" />
        <path d="M12 9.45l1.45 1.05-.55 1.7h-1.8l-.55-1.7z" fill="#0f244f" />
        <path d="M12 9.45v-1.1M13.45 10.5l1.05-.35M12.9 12.2l.7.9M11.1 12.2l-.7.9M10.55 10.5l-1.05-.35" stroke="#0f244f" strokeWidth="0.55" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id="worldCupIconGradient" x1="4" y1="3" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f8fafc" />
          <stop offset="1" stopColor="#cbd5e1" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="7" r="4.25" fill="#ffffff" stroke="#1f2937" strokeWidth="0.7" />
      <path d="M12 4.8l1.45 1.05-.55 1.7h-1.8l-.55-1.7z" fill="#172033" />
      <path d="M12 4.8V3.3M13.45 5.85l1.42-.45M12.9 7.55l.92 1.2M11.1 7.55l-.92 1.2M10.55 5.85l-1.42-.45" stroke="#172033" strokeWidth="0.65" strokeLinecap="round" />
      <path d="M8.2 10.2c.3 2.05 1.18 3.35 2.15 4.3l-.75 4.05h4.8l-.75-4.05c.97-.95 1.85-2.25 2.15-4.3-1.02.72-2.34 1.12-3.8 1.12s-2.78-.4-3.8-1.12Z" fill="url(#worldCupIconGradient)" stroke="#64748b" strokeWidth="0.65" strokeLinejoin="round" />
      <path d="M8.45 18.55h7.1M7.55 20.8h8.9" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
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
            <CompetitionIcon compKey={c.key} className={c.key === 'liga' ? 'h-4 w-6' : 'h-5 w-5'} />
            {c.short}
          </Link>
        );
      })}
    </div>
  );
}
