import { HistorieView, type Historie } from '@/components/HistorieView';
import { RoundPositions } from '@/components/RoundPositions';
import data from '@/data/historie.json';
import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'Historie — 2025/26' };

export default function HistoriePage() {
  const d = data as Historie;
  return (
    <main>
      <PageHeader icon="📚" title="Historie — 1. sezóna" subtitle="Kompletní průběh" />
      <HistorieView data={d} />

      <section className="mt-8 space-y-3">
        <h2 className="eyebrow">
          <span className="flag-chip" /> Pořadí po jednotlivých kolech
        </h2>
        <RoundPositions rounds={d.rounds} players={d.players} />
      </section>
    </main>
  );
}
