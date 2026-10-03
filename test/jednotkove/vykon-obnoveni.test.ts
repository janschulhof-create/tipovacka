import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Doplňkové architektonické kontroly napojení.
 *
 * HLAVNÍ důkaz chování je v `vykon-stabilita.test.ts`, který testuje čisté
 * moduly (plánovač, porovnání řádku, zámek). Tady se jen ověřuje, že je
 * produkční kód opravdu používá.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');
const live = cti('src/components/LiveRefresh.tsx');
const sync = cti('src/app/api/sync-football/route.ts');

describe('Napojení výkonových oprav', () => {
  test('změna se odvozuje ze skutečných zápisů', () => {
    assert.ok(sync.includes('const changed = userVisibleChanges > 0 || vzniklyRecapy'));
    assert.ok(sync.includes("if (changed) revalidateTag('tipovacka-data')"));
    assert.ok(!sync.includes('!allIdle || vzniklyRecapy'), 'Nečinný běh není změna.');
  });

  test('Highlightly zapisuje jen při změně', () => {
    assert.ok(sync.includes('const rozdil = diffLiveRow('));
    assert.ok(sync.includes('if (!rozdil.visible)'));
  });

  test('poskytovatel jen pod zámkem', () => {
    assert.equal((sync.match(/await syncHighlightlyLigaUnderLease\(/g) ?? []).length, 2,
      'live_only i plná cesta.');
    assert.ok(!/await syncHighlightlyLiga\(\{/.test(sync), 'Žádné volání mimo zámek.');
  });

  test('prohlížeč používá plánovač, ne setInterval', () => {
    assert.ok(live.includes('createLivePoller('));
    assert.ok(!live.includes('window.setInterval'), 'setInterval se mohl překrývat.');
  });

  test('ruční obnovení obnovuje vždy', () => {
    const blok = live.slice(live.indexOf('const doRefresh'));
    assert.ok(blok.slice(0, 500).includes('router.refresh();'));
  });

  test('souhrnný log pro měření ve Vercelu', () => {
    for (const pole of ['live_sync_summary', 'heavy_sync_owner', 'provider_requests',
      'semantic_match_changes', 'cache_revalidated', 'duration_ms']) {
      assert.ok(sync.includes(pole), `Chybí ${pole}.`);
    }
  });
});
