import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * C6 — INTEGRITA DOKUMENTACE (zelená sada)
 *
 * Hlídá, že se z repozitáře neztratí klíčové dokumenty. Vzniklo poté, co
 * se při úklidu omylem smazalo hlavní zadání refaktoru.
 *
 * Test neprojde ani tehdy, když soubor existuje, ale je prázdný nebo
 * obsahuje jen mezery a prázdné řádky.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');

/** Povinné dokumenty + minimální rozsah, aby neprošel „prázdný“ placeholder. */
const POVINNE = [
  {
    cesta: 'CLAUDE_ZADANI_REFAKTOR_A_DOHRANO.md',
    minBajtu: 10_000,
    musiObsahovat: ['Dohráno', 'ANTHROPIC_ROAST_MODEL', 'provider_refs', 'Akceptační kritéria'],
    popis: 'hlavní zadání refaktoru a funkce Dohráno',
  },
  {
    cesta: 'REFAKTOR.md',
    minBajtu: 2_000,
    musiObsahovat: ['Klasifikace testů', 'NENÍ obnovitelný'],
    popis: 'stav refaktoru a přijatá rozhodnutí',
  },
  {
    cesta: 'docs/BAROKO_HLASKY_A_PRAVIDLA.md',
    minBajtu: 500,
    musiObsahovat: [],
    popis: 'schválený katalog hlášek',
  },
  {
    cesta: 'db/01a-export-struktury.sql',
    minBajtu: 1_000,
    musiObsahovat: ['information_schema.columns', 'pg_policies'],
    popis: 'SQL balíček pro export struktury produkční databáze',
  },
];

describe('C6 — povinná dokumentace existuje a není prázdná', () => {
  for (const dok of POVINNE) {
    const plna = path.join(KOREN, dok.cesta);

    test(`${dok.cesta} existuje`, () => {
      assert.ok(existsSync(plna), `Chybí ${dok.cesta} (${dok.popis}).`);
    });

    test(`${dok.cesta} není prázdný ani jen bílé znaky`, () => {
      const obsah = readFileSync(plna, 'utf8');
      assert.notEqual(
        obsah.trim().length,
        0,
        `${dok.cesta} obsahuje jen mezery nebo prázdné řádky.`,
      );
      assert.ok(
        statSync(plna).size >= dok.minBajtu,
        `${dok.cesta} má ${statSync(plna).size} B, očekávám aspoň ${dok.minBajtu} B. `
        + 'Vypadá to na zkrácenou náhradu místo úplného dokumentu.',
      );
    });

    if (dok.musiObsahovat.length > 0) {
      test(`${dok.cesta} obsahuje klíčové části`, () => {
        const obsah = readFileSync(plna, 'utf8');
        for (const cast of dok.musiObsahovat) {
          assert.ok(
            obsah.includes(cast),
            `V ${dok.cesta} chybí „${cast}" – dokument není úplný.`,
          );
        }
      });
    }
  }

  test('REFAKTOR.md neodkazuje na neexistující dokumenty', () => {
    const obsah = readFileSync(path.join(KOREN, 'REFAKTOR.md'), 'utf8');
    // Záměrné výjimky: moduly, jejichž SMAZÁNÍ dokument popisuje.
    const smazaneZamerne = ['src/lib/stat.ts', 'src/lib/teamNamesCs.ts'];

    const odkazy = [...obsah.matchAll(/`([\w./-]+\.(?:md|sql|mjs))`/g)]
      .map((m) => m[1])
      .filter((f) => !smazaneZamerne.includes(f));

    const chybejici = [...new Set(odkazy)].filter((f) => !existsSync(path.join(KOREN, f)));
    assert.deepEqual(chybejici, [], `REFAKTOR.md odkazuje na neexistující soubory: ${chybejici}`);
  });
});
