'use client';

import { useState } from 'react';
import type { RankRow } from '@/lib/seasonStats';

/** Zkrátí hodnotu na úvodní metriku (např. "63× jen vítěz (4 b)" → "63×"). */
function shortVal(val: string): string {
  const m = val.match(/^\s*(Ø\s*[\d.]+(?:\s*[a-z]+)?|\d+\s*[b×x]|\d+:\d+|\d+)/i);
  return m ? m[0].trim() : val;
}

export function StatCard({ icon, label, rows, accent }: { icon: string; label: string; rows: RankRow[]; accent: string }) {
  const [open, setOpen] = useState(false);
  const top = rows[0];
  const topNames = top ? rows.filter((r) => r.val === top.val).map((r) => r.name).join(', ') : '—';
  const expandable = rows.length > 1;

  return (
    <div className="panel p-3.5">
      <button
        type="button"
        onClick={() => expandable && setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex w-full items-start gap-2 text-left ${expandable ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-100/50">
            <span className="text-base">{icon}</span>
            <span className="leading-tight">{label}</span>
          </div>
          <div className="mt-1.5 truncate font-display text-base font-semibold leading-tight text-white">{topNames}</div>
          <div className={`truncate text-xs font-medium ${accent}`}>{top?.val ?? '—'}</div>
        </div>
        {expandable && (
          <svg
            className={`mt-0.5 h-4 w-4 shrink-0 text-slate-300/50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {open && expandable && (
        <div className="mt-2 border-t border-terrain-700 pt-2">
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300/50">Pořadí</div>
          {rows.map((r, i) => (
            <div key={`${r.name}-${i}`} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-xs">
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="w-3 shrink-0 text-right tabular-nums text-slate-300/40">{i + 1}</span>
                <span className="truncate text-slate-50/90">{r.name}</span>
              </span>
              <span className={`shrink-0 tabular-nums ${i === 0 ? accent : 'text-slate-100/55'}`}>{shortVal(r.val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
