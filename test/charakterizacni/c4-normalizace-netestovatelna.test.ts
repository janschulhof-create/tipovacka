import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * C4 — CHARAKTERIZACE: proč incident 2.2 nemohly odhalit testy
 *
 * Toto NENÍ test cílového rozhraní. Testuje skutečný, dnešní stav zdrojáků
 * a dokládá kořenovou příčinu: funkci, která rozhoduje o tom, jestli je
 * zápas dohraný, nelze zavolat zvenčí, takže ji nikdy nešlo otestovat.
 *
 * Po etapě 3 musí obojí přestat platit (normalizace bude v doméně a bude
 * exportovaná) – tyto testy pak padnou a nahradí je kontraktní testy K1.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const espnCompetition = readFileSync(path.join(KOREN, 'src/lib/espnCompetition.ts'), 'utf8');

describe('C4 — normalizace stavu není dnes testovatelná', () => {
  test('DNES: `highlightlyStatus` existuje, ale NENÍ exportovaná', () => {
    assert.ok(
      /^function highlightlyStatus/m.test(espnCompetition),
      'Funkce v souboru je (jinak by se test měl přepsat).',
    );
    assert.ok(
      !/^export function highlightlyStatus/m.test(espnCompetition),
      'Pokud tento test padne, funkce už je exportovaná – přesuň ověření '
      + 'chování do kontraktních testů K1.',
    );
  });

  test('DNES: stav se rozhoduje regulárním výrazem nad volným textem', () => {
    const regexRadek = espnCompetition
      .split('\n')
      .find((l) => l.includes('return \'finished\'') && l.includes('/'));
    assert.ok(
      regexRadek,
      'Očekávám rozhodování regexem – to je právě ta křehkost, kterou etapa 3 odstraní.',
    );
  });

  test('DNES: neznámý stav od poskytovatele spadne na „scheduled"', () => {
    // Poslední větev funkce highlightlyStatus. Kvůli tomu může nový, neznámý
    // stav tiše přepsat i probíhající zápas na „naplánováno".
    const telo = espnCompetition.slice(
      espnCompetition.indexOf('function highlightlyStatus'),
    );
    const konec = telo.slice(0, telo.indexOf('\n}'));
    assert.ok(
      /return 'scheduled';\s*$/.test(konec.trim()),
      'Očekávám fallback na „scheduled" – po etapě 3 musí být „unknown".',
    );
  });

  test('DNES: rozhodování o stavu je roztroušené ve více souborech', () => {
    const soubory = [
      'src/app/api/sync-football/route.ts',
      'src/lib/espnCompetition.ts',
      'src/lib/queries.ts',
      'src/components/StandingsTable.tsx',
      'src/components/RoundPanel.tsx',
    ];
    const sRozhodovanim = soubory.filter((f) =>
      /'(live|finished)'/.test(readFileSync(path.join(KOREN, f), 'utf8')),
    );
    assert.ok(
      sRozhodovanim.length >= 5,
      `Očekávám ≥5 souborů se stavovou logikou, našel jsem ${sRozhodovanim.length}. `
      + 'Po centralizaci (etapa 3) musí toto číslo klesnout – test se pak přepíše '
      + 'na horní mez.',
    );
  });
});
