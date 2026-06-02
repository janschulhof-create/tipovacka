import Link from 'next/link';
import { HistorieView, type Historie } from '@/components/HistorieView';
import data from '@/data/historie.json';

export const metadata = { title: 'Historie — 2025/26' };

export default function HistoriePage() {
  return (
    <main>
      <header className="flex items-center gap-3 px-4 pb-2 pt-5">
        <Link href="/" className="text-slate-400">←</Link>
        <h1 className="text-lg font-bold">📚 Historie — 1. sezóna</h1>
      </header>
      <HistorieView data={data as Historie} />
    </main>
  );
}
