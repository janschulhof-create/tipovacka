import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MATCH_CHANGE_COLUMNS,
  changeFromUpdated,
  changesFromPersistedFinish,
  changesFromInserted,
  toMatchdayMatch,
} from '@/lib/matchChangeBuilder';
import { affectedRoundDays, evaluateDayClosure } from '@/lib/matchday';

/**
 * SYNCCTX-1…4, INSERT-CHANGE-1…3, UPDATE-CHANGE-1…3, FORCED-1…2
 *
 * Kontrakt: `MatchChange` znamená, že se databáze OPRAVDU změnila.
 * Vzniká proto až po úspěšném zápisu a z hodnot, které databáze vrátila.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const route = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');

const radek = (id: number, over: Record<string, unknown> = {}) => ({
  id, round: 6, kickoff: '2026-08-29T15:00:00Z', status: 'finished',
  home_score: 2, away_score: 1, ...over,
});

describe('INSERT-CHANGE-1…3 — vložení', () => {
  test('INSERT-CHANGE-1: uložený řádek s id → jedna platná událost', () => {
    const zmeny = changesFromInserted([radek(42)]);
    assert.equal(zmeny.length, 1);
    assert.equal(zmeny[0].before, null);
    assert.equal(zmeny[0].after?.id, 42);
  });

  test('INSERT-CHANGE-2: neúspěšné vložení → žádná událost', () => {
    assert.deepEqual(changesFromInserted(null), []);
    assert.deepEqual(changesFromInserted([]), []);
  });

  test('INSERT-CHANGE-3: víc řádků → událost pro každý', () => {
    const zmeny = changesFromInserted([radek(1), radek(2), radek(3)]);
    assert.deepEqual(zmeny.map((z) => z.after?.id), [1, 2, 3]);
  });

  test('payload bez id nevytvoří událost', () => {
    // Přesně ta chyba: payload před zápisem id nemá.
    assert.deepEqual(changesFromInserted([{ round: 6, kickoff: '2026-08-29T15:00:00Z' }]), []);
  });

  test('route vytváří událost až z vrácených řádků', () => {
    assert.ok(route.includes('.select(MATCH_CHANGE_COLUMNS)'));
    assert.ok(route.includes('changesFromInserted(vlozene)'));
    assert.ok(
      !/matchChanges\.push\(\{ before: null, after: naMatchday\(payload\) \}\)/.test(route),
      'Událost z payloadu bez id nesmí zůstat.',
    );
  });
});

describe('UPDATE-CHANGE-1…3 — aktualizace', () => {
  test('UPDATE-CHANGE-1: před i uložené po', () => {
    const z = changeFromUpdated(radek(42, { status: 'live', home_score: null }), radek(42));
    assert.equal(z?.before?.status, 'live');
    assert.equal(z?.after?.status, 'finished');
    assert.equal(z?.after?.home_score, 2);
  });

  test('UPDATE-CHANGE-2: neúspěšný zápis → žádná událost', () => {
    assert.equal(changeFromUpdated(radek(42), null), null);
    assert.equal(changeFromUpdated(radek(42), undefined), null);
  });

  test('UPDATE-CHANGE-3: změna v týž den se dedupli­kuje', () => {
    const z = changeFromUpdated(radek(42, { status: 'live' }), radek(42));
    const dny = affectedRoundDays([z!]);
    assert.equal(dny.length, 1);
    assert.equal(dny[0].footballDay, '2026-08-29');
  });

  test('route bere `after` z databáze, ne z odhadu', () => {
    assert.ok(route.includes('changeFromUpdated(item.before'));
    assert.ok(
      !/after: naMatchday\(\{ \.\.\.existing, \.\.\.payload \}\)/.test(route),
      'Optimistické sloučení nesmí zůstat.',
    );
  });
});

describe('FORCED-1…2 — vynucený přechod live → finished', () => {
  const zivy = radek(42, { status: 'live', home_score: 2, away_score: 1 });

  test('FORCED-1: úspěšná oprava → událost a uzavřený den', () => {
    const zmeny = changesFromPersistedFinish([zivy], [radek(42, { status: 'finished' })]);
    assert.equal(zmeny.length, 1);
    assert.equal(zmeny[0].before?.status, 'live');
    assert.equal(zmeny[0].after?.status, 'finished');

    // A den se tím opravdu zavře.
    const dny = affectedRoundDays(zmeny);
    assert.deepEqual(dny, [{ round: 6, footballDay: '2026-08-29' }]);
  });

  test('FORCED-2: neúspěšný zápis → žádná falešná uzávěrka', () => {
    assert.deepEqual(changesFromPersistedFinish([zivy], []), []);
  });

  test('opraví se jen řádky, u kterých zápis prošel', () => {
    const zmeny = changesFromPersistedFinish(
      [radek(1, { status: 'live' }), radek(2, { status: 'live' })],
      [radek(1, { status: 'finished' })]);
    assert.deepEqual(zmeny.map((z) => z.after?.id), [1]);
  });
});

describe('SYNCCTX-1…4 — kontext soutěže', () => {
  test('SYNCCTX-1: hodnocení běží jen pro ligu', () => {
    // Volá se přes sdílený helper, který používá live_only i plná cesta.
    for (const misto of route.matchAll(/runLigaMatchdayRecapsSafely\(matchChanges/g)) {
      const pred = route.slice(Math.max(0, misto.index! - 300), misto.index!);
      assert.ok(/key === 'liga'/.test(pred), 'Volání musí být uvnitř větve pro ligu.');
    }
    assert.ok(route.includes("competition: 'liga'"), 'Helper páruje jen ligu.');
  });

  test('SYNCCTX-2: použije se sezona právě zpracovávané soutěže', () => {
    assert.ok(
      route.includes('runLigaMatchdayRecapsSafely(matchChanges, season.id, supabase)'),
      'Sezona se bere z právě zpracovávané soutěže, ne z globální proměnné.',
    );
  });

  test('SYNCCTX-3: globální sběrač napříč soutěžemi neexistuje', () => {
    assert.ok(!route.includes('vsechnyZmeny'), 'Míchal by Ligu s Evropou.');
    assert.ok(!route.includes('activeSeasonId'), 'Přepisoval by se v každé iteraci.');
    assert.ok(
      !/seasonId: activeSeasonId/.test(route),
      'Sezona se nesmí brát z proměnné přepisované napříč soutěžemi.',
    );
  });

  test('SYNCCTX-4: zpracování je uvnitř smyčky soutěží', () => {
    const iSmycka = route.indexOf('for (const key of keys)');
    const iRecap = route.indexOf('runLigaMatchdayRecapsSafely(matchChanges');
    const iKonecSmycky = route.indexOf('const overallOk = keys.every');
    assert.ok(iSmycka < iRecap && iRecap < iKonecSmycky,
      'Musí být uvnitř iterace, jinak se kontext ztratí.');
  });
});

describe('Integrace — poslední živý zápas soboty uzavře den', () => {
  test('oprava live → finished vede k dayClosed', () => {
    const sobota = [
      radek(1, { status: 'finished', kickoff: '2026-08-29T13:00:00Z' }),
      radek(2, { status: 'finished', kickoff: '2026-08-29T15:00:00Z' }),
      radek(3, { status: 'live', kickoff: '2026-08-29T17:00:00Z' }),
    ];

    // Před opravou je den otevřený.
    const pred = evaluateDayClosure({
      footballDay: '2026-08-29',
      matches: sobota.map((r) => toMatchdayMatch(r)!),
    });
    assert.equal(pred.dayClosed, false);

    // Oprava posledního živého zápasu.
    const zmeny = changesFromPersistedFinish([sobota[2]], [
      radek(3, { status: 'finished', kickoff: '2026-08-29T17:00:00Z' }),
    ]);
    assert.equal(zmeny.length, 1);

    const po = evaluateDayClosure({
      footballDay: '2026-08-29',
      matches: [...sobota.slice(0, 2).map((r) => toMatchdayMatch(r)!), zmeny[0].after!],
    });
    assert.equal(po.dayClosed, true, 'Právě tenhle přechod den uzavřel.');
    assert.deepEqual(affectedRoundDays(zmeny), [{ round: 6, footballDay: '2026-08-29' }]);
  });

  test('sloupce pro načtení zpět obsahují vše potřebné', () => {
    for (const sloupec of ['id', 'round', 'kickoff', 'status', 'home_score', 'away_score']) {
      assert.ok(MATCH_CHANGE_COLUMNS.includes(sloupec), `Chybí ${sloupec}.`);
    }
  });
});
