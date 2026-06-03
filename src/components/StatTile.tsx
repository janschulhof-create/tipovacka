'use client';

import { useState } from 'react';

export type TileItem = { rank: number; name: string; val: string };

export function StatTile({
  icon,
  label,
  headlineName,
  headlineVal,
  items,
}: {
  icon: string;
  label: string;
  headlineName: string;
  headlineVal: string;
  items: TileItem[];
}) {
  const [open, setOpen] = useState(false);
  const canOpen = items.length > 0;

  return (
    <div className="self-start rounded-xl border border-line bg-panel">
      <button
        onClick={() => canOpen && setOpen((o) => !o)}
        className="w-full p-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs text-slate-400">{icon} {label}</span>
          {canOpen && <span className="shrink-0 text-xs text-slate-500">{open ? '▲' : '▼'}</span>}
        </div>
        <div className="mt-1 text-base font-semibold leading-tight">{headlineName}</div>
        <div className="text-xs text-brand">{headlineVal}</div>
      </button>

      {open && (
        <ol className="space-y-1 border-t border-line px-3 py-2">
          {items.map((it) => (
            <li key={it.rank} className="flex items-center justify-between text-xs">
              <span className="text-slate-300">
                <span className="mr-1 text-slate-500">{it.rank}.</span>
                {it.name}
              </span>
              <span className="tabular-nums text-slate-400">{it.val}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
