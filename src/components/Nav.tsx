'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from './Brand';

const ITEMS = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/profil', label: 'Můj profil', icon: '👤' },
  { href: '/historie', label: 'Historie', icon: '📚' },
  { href: '/sin-slavy', label: 'Síň slávy', icon: '🏆' },
  { href: '/pravidla', label: 'Pravidla', icon: '📋' },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/** Boční navigace (desktop ≥lg). */
export function SideRail() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-terrain-700 bg-terrain-900/70 px-4 py-6 backdrop-blur lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <BrandMark className="h-10 w-10" />
        <div className="leading-tight">
          <div className="font-display text-lg font-semibold tracking-wide text-white">Tipovačka</div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300/60">Chance liga</div>
        </div>
      </Link>

      <nav className="flex flex-col gap-1">
        {ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? 'bg-terrain-800 font-semibold text-white'
                  : 'text-slate-100/70 hover:bg-terrain-800/60 hover:text-white'
              }`}
            >
              <span className="text-base">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/** Spodní navigace (mobil <lg). */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-terrain-700 bg-terrain-900/95 backdrop-blur lg:hidden">
      <div
        className="mx-auto flex max-w-md items-stretch justify-around px-1 pt-1"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.25rem)' }}
      >
        {ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[52px] flex-1 touch-manipulation select-none flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[10px] font-medium transition active:bg-terrain-800/70 ${
                active ? 'text-white' : 'text-slate-100/60'
              }`}
            >
              <span className="text-lg leading-none">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
