'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { roundLabel } from '@/lib/roundLabel';

export function RoundSelector({
  rounds,
  current,
  knockout = false,
  labels = {},
  compact = false,
}: {
  rounds: number[];
  current: number;
  knockout?: boolean;
  labels?: Record<number, string>;
  compact?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const label = (round: number) => labels[round] ?? roundLabel(round, knockout);

  const go = (r: number) => {
    setOpen(false);
    const p = new URLSearchParams(params.toString());
    p.set('kolo', String(r));
    router.push(`/?${p.toString()}`, { scroll: false });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-lg border border-line-strong bg-surface-1/80 font-display font-semibold tracking-wide text-white transition hover:bg-surface-hover ${compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-sm'}`}
      >
        {label(current)}
        <span className="text-xs text-slate-300/50">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={`absolute right-0 z-40 ${compact ? 'top-9' : 'top-12'} max-h-72 w-56 overflow-auto rounded-xl border border-terrain-600 bg-terrain-900 p-1 shadow-xl`}>
          {[...rounds].reverse().map((r) => (
            <button
              key={r}
              onClick={() => go(r)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                r === current
                  ? 'bg-terrain-800 font-semibold text-white'
                  : 'text-slate-100/75 hover:bg-terrain-800/70'
              }`}
            >
              <span className="truncate">{label(r)}</span>
              {r === current && <span className="ml-2 text-control">●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
