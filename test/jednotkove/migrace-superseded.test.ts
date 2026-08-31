import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * MIG-1…8 — smlouva schématu pro stav `superseded`.
 *
 * PŘÍČINA: `03-round-recaps.sql` už v produkci proběhl s v0.1.80, tehdy
 * jen se stavy `generating`, `success`, `failed`. Doplnit stav jen do
 * souboru 03 NESTAČÍ — produkční omezení by zápis `superseded` odmítlo.
 *
 * Proto samostatná aditivní migrace pro existující tabulku.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

const migrace = cti('db/05-round-recaps-superseded.sql');
const puvodni = cti('db/03-round-recaps.sql');

/** Stavy, které kód opravdu zapisuje. */
const POUZIVANE_STAVY = ['generating', 'success', 'failed', 'superseded'];

describe('MIG-1…3 — nové omezení pokrývá všechny stavy', () => {
  test('MIG-1: povoluje `superseded`', () => {
    assert.ok(
      /check \(status in \('generating', 'success', 'failed', 'superseded'\)\)/.test(migrace),
      'Bez toho by zápis v produkci selhal.',
    );
  });

  test('MIG-2: dosavadní stavy zůstávají povolené', () => {
    const nove = migrace.slice(migrace.indexOf('add constraint round_recaps_status_chk'));
    for (const stav of ['generating', 'success', 'failed']) {
      assert.ok(nove.includes(`'${stav}'`), `${stav} se nesmí ztratit.`);
    }
  });

  test('MIG-3: neznámý stav se nepovoluje', () => {
    const seznam = /check \(status in \(([^)]+)\)\)/.exec(migrace)?.[1] ?? '';
    const povolene = [...seznam.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    assert.deepEqual(povolene.sort(), [...POUZIVANE_STAVY].sort());
    assert.ok(!povolene.includes('cokoliv'), 'Výčet je uzavřený.');
  });

  test('kód nezapisuje jiný stav, než omezení dovolí', () => {
    const store = cti('src/lib/supabaseRecapStore.ts');
    const zapisovane = [...store.matchAll(/status: '([a-z_]+)'/g)].map((m) => m[1]);
    for (const stav of new Set(zapisovane)) {
      assert.ok(POUZIVANE_STAVY.includes(stav), `Kód zapisuje neznámý stav ${stav}.`);
    }
    assert.ok(zapisovane.includes('superseded'), 'Nový stav se opravdu používá.');
  });
});

describe('MIG-4…6 — migrace je bezpečná', () => {
  test('MIG-4: netvoří tabulku znovu a nemaže data', () => {
    const bezKomentaru = migrace.replace(/--.*$/gm, '');
    for (const nebezpecne of ['create table', 'drop table', 'truncate', 'delete from']) {
      assert.ok(
        !new RegExp(nebezpecne, 'i').test(bezKomentaru),
        `Migrace nesmí obsahovat ${nebezpecne}.`,
      );
    }
  });

  test('MIG-5: nesahá na RLS, politiky ani indexy', () => {
    const bezKomentaru = migrace.replace(/--.*$/gm, '');
    for (const nedotknutelne of ['row level security', 'create policy', 'drop policy', 'create index']) {
      assert.ok(
        !new RegExp(nedotknutelne, 'i').test(bezKomentaru),
        `Migrace nesmí měnit ${nedotknutelne}.`,
      );
    }
  });

  test('MIG-6: opakované spuštění projde a běží v transakci', () => {
    assert.ok(migrace.includes('drop constraint if exists'), 'Idempotentní.');
    assert.ok(migrace.includes('begin;') && migrace.includes('commit;'));
    // Ruší se jen známé omezení, ne všechna. Rollback v komentáři se nepočítá.
    const aktivni = migrace.slice(migrace.indexOf('begin;'), migrace.indexOf('commit;'));
    assert.equal((aktivni.match(/drop constraint/g) ?? []).length, 1);
    assert.ok(migrace.includes('round_recaps_status_chk'));
  });
});

describe('MIG-7…8 — preflight, postflight a pořadí nasazení', () => {
  test('MIG-7: preflight ověří neslučitelné hodnoty', () => {
    assert.ok(
      migrace.includes("where status not in ('generating', 'success', 'failed', 'superseded')"),
      'Před změnou se musí ověřit, že žádný řádek novému omezení neodporuje.',
    );
    assert.ok(/select status, count\(\*\)/.test(migrace), 'A jaké stavy tam jsou.');
  });

  test('MIG-8: postflight ověří omezení, RLS i zachovaná data', () => {
    const post = migrace.slice(migrace.indexOf('POSTFLIGHT'));
    assert.ok(post.includes('pg_get_constraintdef'));
    assert.ok(post.includes('relrowsecurity'), 'RLS musí zůstat zapnuté.');
    assert.ok(post.includes('group by status'), 'Počty se porovnají s preflightem.');
  });

  test('rollback počítá s existujícími řádky', () => {
    const rollback = migrace.slice(migrace.indexOf('ROLLBACK'));
    assert.ok(
      rollback.includes("set status = 'failed' where status = 'superseded'"),
      'Bez převedení řádků by staré omezení nešlo vytvořit.',
    );
  });

  test('soubor 03 upozorňuje, že v produkci už proběhl', () => {
    assert.ok(
      puvodni.includes('UŽ V PRODUKCI PROBĚHL'),
      'Jinak by někdo doplnil stav jen tam a produkce by zápis odmítla.',
    );
    assert.ok(puvodni.includes('05-round-recaps-superseded.sql'));
  });
});
