import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * SAFE-STAND-1…3 — dočasná pojistka proti nepravdivému pohybu v pořadí.
 *
 * PROBLÉM: automatická cesta četla `v_standings`, tedy DNEŠNÍ pořadí.
 * U odloženého zápasu 6. kola dohraného ve chvíli, kdy se hraje 10. kolo,
 * by se z desátého kola spočítal vzestup nebo pád šestého — vymyšlené číslo.
 *
 * ŘEŠENÍ pro v0.1.80: pořadí se bere z xB řádků, které už mez fotbalového
 * dne respektují, a pohyb se pro automatická hodnocení vypíná.
 * `biggestRise = null` je lepší než nepravdivý údaj.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

const builder = cti('src/lib/matchdayRecapFacts.ts');
/** Zdroj bez komentářů – kontroluje se kód, ne dokumentace. */
const kod = builder.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

describe('SAFE-STAND-1…2 — pořadí k mezi dne, ne dnešní', () => {
  test('SAFE-STAND-1: automatická cesta nečte v_standings', () => {
    assert.ok(
      !kod.includes('v_standings'),
      'Dnešní pořadí se do historického hodnocení nesmí dostat.',
    );
  });

  test('SAFE-STAND-2: pořadí vzniká z xB řádků k mezi', () => {
    assert.ok(kod.includes('const standingsAtCutoff = xbRows.map'));
    assert.ok(kod.includes('points: row.actual_points'));
    assert.ok(kod.includes('standings: standingsAtCutoff'));
  });

  test('xB řádky mají mez podle kola i fotbalového dne', () => {
    assert.ok(kod.includes('throughRound: input.round'));
    assert.ok(kod.includes('throughFootballDay: input.footballDay'));
  });

  test('pohyb v pořadí je pro automatická hodnocení vypnutý', () => {
    assert.ok(
      /includeStandingMovement: false/.test(kod),
      'Vymyšlený vzestup je horší než žádný.',
    );
    assert.ok(
      !/includeStandingMovement: input\.roundComplete/.test(kod),
      'Podmíněné zapnutí by u starého kola dalo nepravdivý výsledek.',
    );
  });
});

describe('SAFE-STAND-3 — interaktivní zobrazení beze změny', () => {
  const ui = cti('src/components/RoundRecapSection.tsx');

  test('komponenta si dál řídí pohyb sama', () => {
    assert.ok(
      ui.includes('includeStandingMovement'),
      'Interaktivní chování se tímto patchem nemění.',
    );
  });

  test('komponenta dál používá své pořadí', () => {
    assert.ok(ui.includes('standings'), 'Předává vlastní pořadí, ne cutoff xB.');
  });

  test('patch se dotkl jen automatické cesty', () => {
    assert.ok(
      !ui.includes('standingsAtCutoff'),
      'Pojistka patří jen do automatického builderu.',
    );
  });
});

describe('Chování při vypnutém pohybu', () => {
  test('buildRoundRecapFacts nechává pohyb prázdný', async () => {
    const { buildRoundRecapFacts } = await import('@/lib/roundRecap');

    const facts = buildRoundRecapFacts({
      matches: [],
      players: [],
      predictions: [],
      standings: [{ name: 'Šulda', points: 120 }],
      roundTitle: '6. kolo',
      seasonName: '2026/27',
      includeStandingMovement: false,
      previousSeasonName: null,
      previousSeasonStats: [],
      xbSnapshots: [],
    } as unknown as Parameters<typeof buildRoundRecapFacts>[0]);

    assert.equal(facts.biggestRise, null, 'Bez pohybu žádný vzestup.');
    assert.equal(facts.biggestFall, null, 'Ani pád.');
  });
});
