import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLivePoller, createSingleFlight, type SyncOutcome } from '@/lib/livePoller';

/**
 * TAB-1…6, LEASE-GRANT — jeden běh synchronizace na záložku a funkční zámek.
 *
 * Plánovač bránil překryvu jen svých kol. Záložka má ale i další spouštěče
 * (první načtení, návrat do aplikace, ruční stažení) a ty běžely nezávisle.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

/** Napodobí dotaz na server, který visí, dokud ho test nepustí. */
function visiciServer() {
  let soucasne = 0;
  let maximum = 0;
  let celkem = 0;
  const cekajici: ((v: SyncOutcome) => void)[] = [];
  return {
    async dotaz(): Promise<SyncOutcome> {
      soucasne++; celkem++;
      maximum = Math.max(maximum, soucasne);
      const v = await new Promise<SyncOutcome>((r) => cekajici.push(r));
      soucasne--;
      return v;
    },
    pustit(v: SyncOutcome = 'unchanged') { cekajici.shift()?.(v); },
    maximum: () => maximum,
    celkem: () => celkem,
  };
}

const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('TAB-1…4 — spouštěče sdílejí jeden běh', () => {
  test('TAB-1: čtyři spouštěče naráz → jeden dotaz', async () => {
    const server = visiciServer();
    const sdileny = createSingleFlight(() => server.dotaz());

    // plánovač, první načtení, návrat do aplikace, ruční stažení
    const sliby = [sdileny.run(), sdileny.run(), sdileny.run(), sdileny.run()];
    await tick();
    assert.equal(server.celkem(), 1, 'Ze záložky odešel jediný dotaz.');
    assert.equal(sdileny.inFlight(), 1);

    server.pustit('changed');
    const vysledky = await Promise.all(sliby);
    assert.deepEqual(vysledky, ['changed', 'changed', 'changed', 'changed'],
      'Všichni dostanou výsledek téhož běhu.');
    assert.equal(server.maximum(), 1);
  });

  test('TAB-2: po dokončení může začít nový běh', async () => {
    const server = visiciServer();
    const sdileny = createSingleFlight(() => server.dotaz());

    const a = sdileny.run(); await tick(); server.pustit(); await a;
    assert.equal(sdileny.inFlight(), 0);
    const b = sdileny.run(); await tick();
    assert.equal(server.celkem(), 2, 'Druhý běh smí začít až po prvním.');
    server.pustit(); await b;
  });

  test('TAB-3: chyba běh uvolní', async () => {
    const sdileny = createSingleFlight(async () => { throw new Error('síť'); });
    await assert.rejects(() => sdileny.run());
    assert.equal(sdileny.inFlight(), 0, 'Výjimka nesmí běh zablokovat navždy.');
  });

  test('TAB-4: plánovač a návrat do aplikace současně → jeden dotaz', async () => {
    const server = visiciServer();
    const sdileny = createSingleFlight(() => server.dotaz());
    let fronta: (() => void) | null = null;

    const poller = createLivePoller({
      sync: () => sdileny.run(),
      refresh: () => {},
      isVisible: () => true,
      setTimeout: (fn) => { fronta = fn; return 1; },
      clearTimeout: () => {},
      random: () => 0.5,
    });
    poller.start();

    // Kolo plánovače začne a visí…
    (fronta as unknown as () => void)();
    await tick();
    // …a do toho se uživatel vrátí do aplikace.
    const navrat = sdileny.run();
    await tick();

    assert.equal(server.celkem(), 1, 'Návrat do aplikace nesmí odeslat druhý dotaz.');
    assert.equal(server.maximum(), 1);
    server.pustit();
    await navrat;
    poller.stop();
  });
});

describe('TAB-5…6 — napojení v LiveRefresh', () => {
  const live = cti('src/components/LiveRefresh.tsx');

  test('TAB-5: všechny spouštěče jdou přes sdílený běh', () => {
    assert.ok(live.includes('createSingleFlight(syncLiveData)'));
    assert.equal(
      (live.match(/sdilenySync\.run\(\)/g) ?? []).length, 4,
      'Plánovač, první načtení, návrat do aplikace a ruční stažení.',
    );
    assert.ok(
      !/await syncLiveData\(\)|return syncLiveData\(\)/.test(live),
      'Přímé volání by obešlo sdílený běh.',
    );
  });

  test('TAB-6: první načtení vykreslí jen při změně', () => {
    const blok = live.slice(live.indexOf('initialSyncDone.current = true'));
    assert.ok(blok.slice(0, 500).includes("if (vysledek === 'changed') router.refresh()"));
  });
});

describe('LEASE-GRANT — zámek je v produkci opravdu funkční', () => {
  const migrace = cti('db/06-sync-lease.sql');
  const aktivni = migrace.replace(/--.*$/gm, '');

  test('service role smí obě funkce volat', () => {
    for (const fn of [
      'public.claim_sync_lease(text, text, integer)',
      'public.release_sync_lease(text, text)',
    ]) {
      assert.ok(
        aktivni.includes(`grant execute on function ${fn} to service_role`),
        `Bez GRANT by RPC selhalo a zámek by se tiše vypnul: ${fn}`,
      );
    }
  });

  test('GRANT následuje AŽ po REVOKE', () => {
    const iRevoke = aktivni.lastIndexOf('revoke all on function');
    const iGrant = aktivni.indexOf('grant execute on function');
    assert.ok(iRevoke >= 0 && iGrant > iRevoke, 'Opačné pořadí by grant zrušilo.');
  });

  test('prohlížeč funkce volat nesmí', () => {
    assert.ok(!/grant execute[^;]*to (anon|authenticated|public)/.test(aktivni));
  });

  test('postflight ověří oprávnění', () => {
    assert.ok(migrace.includes("has_function_privilege('service_role'"));
    assert.ok(migrace.includes("has_function_privilege('anon'"));
  });
});
