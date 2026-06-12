import { PageHeader } from '@/components/PageHeader';

export const metadata = { title: 'Pravidla' };

const scoring = [
  { b: '10', barva: 'text-green-400', text: 'Přesný výsledek.' },
  { b: '6', barva: 'text-sky-400', text: 'Správný vítěz a zároveň správný gólový rozdíl, NEBO správný celkový počet gólů v zápase, NEBO nepřesně trefená remíza (tip i výsledek remíza, ale jiné skóre).' },
  { b: '4', barva: 'text-slate-300', text: 'Pouze správný vítěz.' },
  { b: '2', barva: 'text-yellow-400', text: 'Trefil jsi přesný celkový počet gólů v zápase, ale ne vítěze.' },
  { b: '0', barva: 'text-red-400', text: 'Ostatní případy.' },
];

const steps = [
  'Na úvodní obrazovce klepni na velké tlačítko TIPOVAT AKTUÁLNÍ KOLO.',
  'Vyber ze seznamu svoje jméno (žádné přihlašování ani heslo).',
  'U každého zápasu nastav tip na skóre pomocí tlačítek + a −.',
  'Klepni na ULOŽIT TIPY. Tipy můžeš libovolně měnit až do výkopu.',
  'Po výkopu se zápas zamkne (🔒) a tip už nejde upravit.',
  'Po skončení zápasu se body připočítají automaticky a aktualizuje se tabulka i statistiky.',
];

export default function PravidlaPage() {
  return (
    <main>
      <PageHeader icon="📋" title="Pravidla" subtitle="Jak na to" />

      <section className="pt-1">
        <h2 className="eyebrow mb-2"><span className="flag-chip" /> Jak to funguje</h2>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-line bg-panel p-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/20 text-xs font-bold text-brand">
                {i + 1}
              </span>
              <span className="text-slate-200">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="pt-6">
        <h2 className="eyebrow mb-2"><span className="flag-chip" /> Bodování</h2>
        <p className="pb-3 text-xs text-slate-100/45">Podle pravidel Tipsport Megatipovačky.</p>
        <div className="space-y-2">
          {scoring.map((r) => (
            <div key={r.b} className="panel flex gap-3 p-3">
              <span className={`w-12 shrink-0 text-center font-display text-2xl font-extrabold tabular-nums ${r.barva}`}>
                {r.b}
              </span>
              <span className="self-center text-sm text-slate-100/85">{r.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-6">
        <h2 className="eyebrow mb-2"><span className="flag-chip" /> Příklad</h2>
        <div className="panel p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-100/55">Výsledek</span>
            <span className="font-display text-lg font-bold tabular-nums">1 : 5</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-slate-100/55">Tvůj tip</span>
            <span className="font-display text-lg font-bold tabular-nums">1 : 3</span>
          </div>
          <div className="mt-3 border-t border-terrain-700 pt-3 text-slate-100/75">
            Trefil jsi vítěze (hosté), ale ne přesný rozdíl ani celkový počet gólů →{' '}
            <span className="font-bold text-white">4 body</span>.
          </div>
        </div>
      </section>
    </main>
  );
}
