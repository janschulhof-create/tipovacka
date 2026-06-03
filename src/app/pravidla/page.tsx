import Link from 'next/link';

export const metadata = { title: 'Pravidla' };

const scoring = [
  { b: '10', barva: 'text-green-400', text: 'Přesný výsledek.' },
  { b: '6', barva: 'text-sky-400', text: 'Správný vítěz a zároveň správný gólový rozdíl, NEBO přesný počet gólů vítěze, NEBO nepřesně trefená remíza (tip i výsledek remíza, ale jiné skóre).' },
  { b: '4', barva: 'text-slate-300', text: 'Pouze správný vítěz.' },
  { b: '2', barva: 'text-yellow-400', text: 'Špatný vítěz, ale sedí přesný počet gólů jednoho z týmů.' },
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
      <header className="flex items-center gap-3 px-4 pb-2 pt-5">
        <Link href="/" className="text-slate-400">←</Link>
        <h1 className="text-lg font-bold">📋 Pravidla</h1>
      </header>

      <section className="px-4 pt-2">
        <h2 className="pb-2 text-sm font-semibold text-slate-300">Jak to funguje</h2>
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

      <section className="px-4 pt-6">
        <h2 className="pb-2 text-sm font-semibold text-slate-300">Bodování</h2>
        <p className="pb-3 text-xs text-slate-500">Podle pravidel Tipsport Megatipovačky.</p>
        <div className="space-y-2">
          {scoring.map((r) => (
            <div key={r.b} className="flex gap-3 rounded-xl border border-line bg-panel p-3">
              <span className={`w-12 shrink-0 text-center text-2xl font-extrabold tabular-nums ${r.barva}`}>
                {r.b}
              </span>
              <span className="self-center text-sm text-slate-200">{r.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pt-6">
        <h2 className="pb-2 text-sm font-semibold text-slate-300">Příklad</h2>
        <div className="rounded-xl border border-line bg-panel p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Výsledek</span>
            <span className="tabular-nums font-bold">1 : 5</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-slate-400">Tvůj tip</span>
            <span className="tabular-nums font-bold">1 : 3</span>
          </div>
          <div className="mt-3 border-t border-line pt-3 text-slate-300">
            Trefil jsi vítěze (hosté), ale ne přesný rozdíl ani počet gólů vítěze →{' '}
            <span className="font-bold text-slate-100">4 body</span>.
          </div>
        </div>
      </section>
    </main>
  );
}
