'use client';

import { useState } from 'react';
import type { RankRow } from '@/lib/seasonStats';

export function StatCard({ icon, label, rows, accent }: { icon: string; label: string; rows: RankRow[]; accent: string }) {
  const [open, setOpen] = useState(false);
  const top = rows[0];
  const topNames = top ? rows.filter((r) => r.val === top.val).map((r) => r.name).join(', ') : '—';

  return (
    <div
      className={`panel relative cursor-default p-3.5 ${open ? 'z-40' : 'z-0'}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
      tabIndex={0}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-100/50">
        <span className="text-base">{icon}</span>
        <span className="leading-tight">{label}</span>
      </div>
      <div className="mt-1.5 truncate font-display text-base font-semibold leading-tight text-white">{topNames}</div>
      <div className={`truncate text-xs font-medium ${accent}`}>{top?.val ?? '—'}</div>

      {open && rows.length > 1 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl border border-terrain-600 bg-terrain-900 p-2 shadow-2xl">
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300/50">Pořadí</div>
          {rows.map((r, i) => (
            <div key={`${r.name}-${i}`} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="w-3 shrink-0 text-right tabular-nums text-slate-300/40">{i + 1}</span>
                <span className="truncate text-slate-50/90">{r.name}</span>
              </span>
              <span className={`shrink-0 tabular-nums ${i === 0 ? accent : 'text-slate-100/55'}`}>{r.val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
