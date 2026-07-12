import { HistorieView, type Historie } from '@/components/HistorieView';
import { CompetitionTabs } from '@/components/CompetitionTabs';
import data from '@/data/historie.json';
import { PageHeader } from '@/components/PageHeader';
import { getMsSeason } from '@/lib/msSeason';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Historie' };

export default async function HistoriePage() {
  const ms = await getMsSeason();

  return (
    <main>
      <PageHeader icon="📚" title="Historie" subtitle="Kompletní průběh soutěží" />
      <CompetitionTabs
        liga={<HistorieView data={data as Historie} />}
        ms={ms ? <HistorieView data={ms.data} /> : null}
      />
    </main>
  );
}
