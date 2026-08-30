import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MATCH_CHANGE_COLUMNS,
  changesFromPersistedFinish,
  toMatchdayMatch,
} from '@/lib/matchChangeBuilder';
import { affectedRoundDays } from '@/lib/matchday';

/**
 * PROD-1…7 — kontrakt produkčního tvaru řádku a reportu.
 *
 * PŘÍČINA CHYB, KTERÉ TESTY MINULE NEODHALILY:
 *  1. `live_only` načítal jen `id, kickoff, home_score, away_score`.
 *     Bez `round` vrátí `toMatchdayMatch()` null a událost NEVZNIKNE.
 *     Můj tehdejší test používal syntetický řádek, který `round` měl —
 *     proto prošel, i když produkce nefungovala.
 *  2. `report.semanticChanges` se přiřazovalo až u posledního `return`,
 *     takže předčasné návraty změny zahodily.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const route = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');

/** Přesně ta pole, která vrací produkční dotaz — nic navíc. */
function produkcniRadek(over: Record<string, unknown> = {}): Record<string, unknown> {
  const radek: Record<string, unknown> = {};
  for (const sloupec of MATCH_CHANGE_COLUMNS.split(',').map((c) => c.trim())) {
    radek[sloupec] = ({
      id: 3, round: 6, kickoff: '2026-08-29T17:00:00Z',
      status: 'live', home_score: 1, away_score: 0,
    } as Record<string, unknown>)[sloupec];
  }
  return { ...radek, ...over };
}

describe('PROD-1…3 — produkční tvar řádku stačí na událost', () => {
  test('PROD-1: řádek z MATCH_CHANGE_COLUMNS lze převést', () => {
    const m = toMatchdayMatch(produkcniRadek());
    assert.ok(m, 'Produkční dotaz musí vracet vše potřebné.');
    assert.equal(m!.round, 6);
    assert.equal(m!.id, 3);
  });

  test('PROD-2: bez `round` událost NEVZNIKNE — to byla ta chyba', () => {
    const bezKola = produkcniRadek();
    delete bezKola.round;
    assert.equal(
      toMatchdayMatch(bezKola), null,
      'Právě tenhle případ live_only tiše produkoval.',
    );
  });

  test('PROD-3: dotazy pro vynucené uzavření používají plný výběr', () => {
    // Kdyby se výběr někdy zúžil, tento test spadne.
    assert.ok(
      !/\.select\('id, kickoff, home_score, away_score'\)/.test(route),
      'Zúžený výběr by znemožnil sestavení události.',
    );
    const pocet = (route.match(/\.select\(MATCH_CHANGE_COLUMNS\)/g) ?? []).length;
    assert.ok(pocet >= 5, `Nalezeno ${pocet} použití plného výběru.`);
  });
});

describe('PROD-4…5 — vynucené uzavření z uloženého stavu', () => {
  test('PROD-4: before=live, after=finished, správné kolo i den', () => {
    const pred = [produkcniRadek({ status: 'live' })];
    const po = [produkcniRadek({ status: 'finished' })];

    const zmeny = changesFromPersistedFinish(pred, po);
    assert.equal(zmeny.length, 1);
    assert.equal(zmeny[0].before?.status, 'live');
    assert.equal(zmeny[0].after?.status, 'finished');
    assert.equal(zmeny[0].after?.round, 6);

    assert.deepEqual(
      affectedRoundDays(zmeny), [{ round: 6, footballDay: '2026-08-29' }],
    );
  });

  test('PROD-5: neúspěšný zápis → žádná událost', () => {
    const pred = [produkcniRadek({ status: 'live' })];
    assert.deepEqual(changesFromPersistedFinish(pred, []), []);
    assert.deepEqual(changesFromPersistedFinish(pred, null), []);
  });

  test('událost vznikne jen pro řádky, které zápis opravdu uložil', () => {
    const pred = [produkcniRadek({ id: 1 }), produkcniRadek({ id: 2 })];
    const po = [produkcniRadek({ id: 1, status: 'finished' })];
    assert.deepEqual(changesFromPersistedFinish(pred, po).map((z) => z.after?.id), [1]);
  });

  test('after pochází z databáze, ne z odhadu', () => {
    // Databáze mohla uložit jiné skóre, než jsme čekali.
    const pred = [produkcniRadek({ status: 'live', home_score: 1 })];
    const po = [produkcniRadek({ status: 'finished', home_score: 3 })];
    assert.equal(changesFromPersistedFinish(pred, po)[0].after?.home_score, 3);
  });
});

describe('PROD-6…7 — report drží změny přes všechny návratové cesty', () => {
  test('PROD-6: pole je v reportu od jeho vzniku', () => {
    assert.ok(
      /const report: HighlightlyReport = \{\s*\n\s*semanticChanges,/.test(route),
      'Report musí držet TUTÉŽ referenci, jinak předčasný návrat změny ztratí.',
    );
    assert.ok(
      !route.includes('report.semanticChanges = semanticChanges'),
      'Pozdní přiřazení nesmí zůstat – zapomnělo by se u nového early returnu.',
    );
  });

  test('PROD-7: sdílená reference znamená viditelnost přes early return', () => {
    // Modeluje přesně to chování: pole vložené do objektu při jeho vzniku.
    const zmeny: unknown[] = [];
    const report = { semanticChanges: zmeny, live: { due: false } };

    // Oprava detailu proběhne...
    zmeny.push({ before: null, after: { id: 1 } });
    // ...a funkce se vrátí předčasně.
    const vraceno = report;

    assert.equal(
      (vraceno.semanticChanges as unknown[]).length, 1,
      'Změna musí být vidět i bez pozdního přiřazení.',
    );
  });

  test('typ pole není nepovinný', () => {
    assert.ok(
      /semanticChanges: MatchChange\[\];/.test(route),
      'Report ho drží vždy – nepovinnost by svádět k zapomenutí.',
    );
  });

  test('oprava jen `detail` sémantickou změnu nevytvoří', () => {
    const blok = route.slice(route.indexOf('const meniRegularniSkore'));
    assert.ok(blok.slice(0, 700).includes('if (!repairUpdateError && meniRegularniSkore)'));
  });
});
