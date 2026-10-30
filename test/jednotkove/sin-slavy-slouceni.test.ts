import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** HOF-1…5 — Historie je součástí Síně slávy, bez duplicitních statistik. */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

describe('HOF-1…5', () => {
  test('HOF-1: samostatná stránka Historie zmizela, adresa přesměruje', () => {
    assert.equal(existsSync(path.join(KOREN, 'src/app/historie/page.tsx')), false);
    const cfg = cti('next.config.ts');
    assert.ok(cfg.includes("source: '/historie', destination: '/sin-slavy', permanent: true"),
      'Staré odkazy a záložky musí fungovat.');
  });

  test('HOF-2: v navigaci je jen Síň slávy', () => {
    const nav = cti('src/components/Nav.tsx');
    assert.ok(!nav.includes("href: '/historie'"));
    assert.ok(nav.includes("href: '/sin-slavy'"));
  });

  test('HOF-3: Síň slávy ukazuje rekordy i archiv obou soutěží', () => {
    const p = cti('src/app/sin-slavy/page.tsx');
    assert.equal((p.match(/<HallOfFameSection/g) ?? []).length, 2, 'Liga i MS.');
    assert.equal((p.match(/<HistorieView data=\{[^}]+\} archiveOnly \/>/g) ?? []).length, 2,
      'Archiv ligové sezóny i turnaje MS.');
  });

  test('HOF-4: archiv nezobrazuje statistiky, které jsou v rekordech', () => {
    const v = cti('src/components/HistorieView.tsx');
    assert.ok(v.includes('archiveOnly = false'), 'Výchozí chování komponenty beze změny.');
    assert.ok(/\{!archiveOnly && \(\s*\n\s*<section className="space-y-2">\s*\n\s*<h2 className="eyebrow"><span className="flag-chip" \/> Statistiky sezóny/.test(v));
    // Regiony a MS karty se archivu nepředávají – jsou v rekordech nahoře.
    const p = cti('src/app/sin-slavy/page.tsx');
    assert.ok(!/<HistorieView[^>]*regionalCards/.test(p));
    assert.ok(!/<HistorieView[^>]*(extraCards|trailingCards)/.test(p));
  });

  test('HOF-5: jedinečný obsah archivu zůstává', () => {
    const v = cti('src/components/HistorieView.tsx');
    for (const sekce of ['Konečné pořadí', 'Vývoj sezóny po kolech', 'Rozložení bodů', 'Co by kdyby', 'Výsledky po kolech']) {
      assert.ok(v.includes(sekce), `Chybí ${sekce}.`);
    }
  });
});
