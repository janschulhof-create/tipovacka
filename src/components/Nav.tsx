'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from './Brand';

const ITEMS = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/profil', label: 'Můj profil', icon: '👤' },
  { href: '/historie', label: 'Historie', icon: '📚' },
  { href: '/sin-slavy', label: 'Síň slávy', icon: '🏆' },
  { href: '/h2h', label: 'H2H', icon: '⚔️' },
  { href: '/pravidla', label: 'Pravidla', icon: '📋' },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/** Boční navigace (desktop ≥lg). */
export function SideRail() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[208px] flex-col border-r border-terrain-700 bg-terrain-900/82 px-3 py-4 backdrop-blur lg:flex">
      <Link prefetch={false} href="/" className="mb-7 flex items-center gap-2.5 px-1">
        <BrandMark className="h-10 w-10" />
        <div className="leading-tight">
          <div className="font-display text-lg font-semibold tracking-wide text-white">Tipovačka</div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300/60">MS · Liga · Evropa</div>
        </div>
      </Link>

      <nav className="flex flex-col gap-1">
        {ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link prefetch={false}
              key={it.href}
              href={it.href}
              className={`relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                active
                  ? 'border-violet-400/25 bg-gradient-to-r from-violet-500/18 to-surface-2/70 font-semibold text-white shadow-[inset_3px_0_0_#a46af7]'
                  : 'border-transparent text-slate-100/65 hover:border-line-subtle hover:bg-terrain-800/60 hover:text-white'
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
            <Link prefetch={false}
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
