'use client';

import { useState, type ReactNode } from 'react';
import { Flag } from './Flag';

/**
 * Přepínač archivů: Chance liga × dokončené MS 2026.
 * Obsah obou záložek se vykreslí na serveru a nikdy se nemíchá dohromady.
 */
export function CompetitionTabs({
  liga,
  ms,
  msLabel = 'MS 2026',
}: {
  liga: ReactNode;
  ms: ReactNode | null;
  msLabel?: string;
}) {
  const [tab, setTab] = useState<'liga' | 'ms'>('liga');
  if (!ms) return <>{liga}</>;

  const btn = (active: boolean) =>
    `flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
      active
        ? 'bg-pitch text-white shadow'
        : 'border border-terrain-600 bg-terrain-900/60 text-slate-100/60 hover:text-white'
    }`;

  return (
    <>
      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab('liga')} className={btn(tab === 'liga')}>
          <span className="inline-flex items-center gap-2">
            <Flag team="Česko" />
            Chance liga
          </span>
        </button>
        <button onClick={() => setTab('ms')} className={btn(tab === 'ms')}>
          <span className="inline-flex items-center gap-2">
            🌍 {msLabel}
          </span>
        </button>
      </div>
      {tab === 'liga' ? liga : ms}
    </>
  );
}
