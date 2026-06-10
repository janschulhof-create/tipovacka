import { HistorieView, type Historie } from '@/components/HistorieView';
import data from '@/data/historie.json';
import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'Historie — 2025/26' };

export default function HistoriePage() {
  return (
    <main>
      <PageHeader icon="📚" title="Historie — 1. sezóna" subtitle="Kompletní průběh" />
      <HistorieView data={data as Historie} />
    </main>
  );
}
