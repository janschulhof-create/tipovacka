'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function RoundSelector({
  rounds,
  current,
}: {
  rounds: number[];
  current: number;
}) {
  const router = useRouter();
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

  const go = (r: number) => {
    setOpen(false);
    router.push(`/?kolo=${r}`, { scroll: false });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-terrain-600 bg-terrain-900/60 px-3.5 py-2 font-display text-sm font-semibold tracking-wide text-white transition hover:bg-terrain-800"
      >
        {current}. kolo
        <span className="text-xs text-slate-300/50">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-40 max-h-72 w-40 overflow-auto rounded-xl border border-terrain-600 bg-terrain-900 p-1 shadow-xl">
          {[...rounds].reverse().map((r) => (
            <button
              key={r}
              onClick={() => go(r)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                r === current
                  ? 'bg-terrain-800 font-semibold text-white'
                  : 'text-slate-100/75 hover:bg-terrain-800/70'
              }`}
            >
              {r}. kolo
              {r === current && <span className="text-control">●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
