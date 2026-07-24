'use client';

import { useRouter } from 'next/navigation';

export function BackLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) router.back();
        else router.push('/');
      }}
      className="mb-4 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-slate-300/70 transition hover:bg-terrain-800 hover:text-white"
    >
      ‹ Zpět na pořadí
    </button>
  );
}
