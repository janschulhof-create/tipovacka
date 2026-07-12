'use client';

import { useState, type ReactNode } from 'react';

/**
 * Přepínač soutěží: Chance liga (dokončené sezóny) × MS 2026 (probíhající).
 * Obsah obou záložek se vykreslí na serveru, tady se jen přepíná zobrazení —
 * MS se tak NIKDY nemíchá do ligových rekordů, jen stojí vedle.
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
          🇨🇿 Chance liga
        </button>
        <button onClick={() => setTab('ms')} className={btn(tab === 'ms')}>
          🌍 {msLabel}
        </button>
      </div>
      {tab === 'liga' ? liga : ms}
    </>
  );
}
