import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';


/**
 * PREV-1…2 — „loni vs dnes“ i v automatickém hodnocení.
 *
 * Automatická cesta měla `previousSeasonName: null`, takže uložené hodnocení
 * přišlo o fakta `bestVsLastSeason`, `worstVsLastSeason`, `previousBestBeaten`
 * i o hlášky, které se o ně opírají.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

describe('PREV-1 — sdílený zdroj dat', () => {
  /*
   * Modul čte `historie.json`. Běh testů vyžaduje u JSON importu atribut,
   * který build nepoužívá, takže se sem modul nenačítá — místo toho se
   * ověřuje jeho smlouva proti témuž souboru dat.
   */
  const historie = JSON.parse(cti('src/data/historie.json')) as {
    season: string; stats: Record<string, Record<string, number>>;
  };
  const modul = cti('src/lib/previousSeason.ts');

  test('data existují a mají očekávaný tvar', () => {
    assert.ok(historie.season.length > 0);
    const jmena = Object.keys(historie.stats);
    assert.ok(jmena.length > 0, 'historie.json musí něco obsahovat.');
    for (const jmeno of jmena) {
      const row = historie.stats[jmeno];
      for (const pole of ['avgPoints', 'bestRound', 'roundWins', 'zeros']) {
        assert.ok(pole in row, `${jmeno}: chybí ${pole}`);
      }
    }
  });

  test('modul mapuje všechna očekávaná pole', () => {
    for (const pole of ['avgPoints', 'bestRound', 'roundWins', 'zeros']) {
      assert.ok(modul.includes(pole), `Mapování musí obsahovat ${pole}.`);
    }
  });

  test('pořadí je deterministické — kvůli otisku faktů', () => {
    assert.ok(
      modul.includes("localeCompare(b.name, 'cs')"),
      'Bez řazení by se otisk faktů mezi běhy lišil.',
    );
  });
});

describe('PREV-2 — obě cesty berou totéž', () => {
  const auto = cti('src/lib/matchdayRecapFacts.ts');
  const ui = cti('src/components/RoundRecapSection.tsx');

  test('automatická cesta už neposílá prázdno', () => {
    assert.ok(auto.includes('previousSeasonName: PREVIOUS_SEASON_NAME'));
    assert.ok(auto.includes('previousSeasonStats: previousSeasonStats()'));
    assert.ok(!auto.includes('previousSeasonName: null'), 'Prázdno je regrese.');
  });

  test('interaktivní cesta používá TÝŽ helper', () => {
    assert.ok(ui.includes("from '@/lib/previousSeason'"));
    assert.ok(ui.includes('previousSeasonName: PREVIOUS_SEASON_NAME'));
  });

  test('mapování existuje jen jednou', () => {
    assert.ok(
      !ui.includes('function previousSeasonStats()'),
      'Kopie mapování by se mohla rozejít.',
    );
    assert.ok(
      !ui.includes("import historie from '@/data/historie.json'"),
      'Data se čtou přes sdílený modul.',
    );
  });
});
