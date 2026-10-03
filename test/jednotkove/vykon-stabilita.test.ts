import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { diffLiveRow, detailContent } from '@/lib/liveRowDiff';
import {
  backoffDelay, createLivePoller, LIVE_POLL_BACKOFF_MS, type SyncOutcome,
} from '@/lib/livePoller';
import { runWithSyncLease, type SyncLeaseStore } from '@/lib/syncLease';

/**
 * Behaviorální testy výkonu a stability. Testují čisté moduly, které
 * používá produkce – ne text zdrojáku.
 */

// ── PERF-CHANGED ───────────────────────────────────────────────────────────
const radek = {
  home_score: 1, away_score: 0, status: 'live', minute: 34, clock: '34:12',
  duration: null, reg_home: null, reg_away: null, pen_home: null, pen_away: null,
  detail: { goals: [{ min: "12'", side: 'home' }], _highlightly: { listFetchedAt: '2026-08-29T15:00:00Z' } },
};

describe('PERF-CHANGED-1…2 — co je změna', () => {
  test('PERF-CHANGED-1: stejná data a jen nová časová značka → žádná změna', () => {
    const d = diffLiveRow(radek, {
      ...radek,
      detail: { ...radek.detail, _highlightly: { listFetchedAt: '2026-08-29T15:02:00Z' } },
    });
    assert.equal(d.visible, false, 'Časová značka poskytovatele parta nevidí.');
    assert.equal(d.semantic, false);
  });

  test('PERF-CHANGED-2: změna minuty je viditelná, ale ne sémantická', () => {
    const d = diffLiveRow(radek, { ...radek, minute: 36, clock: '36:01' });
    assert.equal(d.visible, true);
    assert.equal(d.semantic, false, 'Minuta nemění body ani hodnocení.');
  });

  test('změna skóre je sémantická', () => {
    const d = diffLiveRow(radek, { ...radek, home_score: 2 });
    assert.equal(d.semantic, true);
    assert.equal(d.visible, true);
  });

  test('změna stavu je sémantická', () => {
    assert.equal(diffLiveRow(radek, { ...radek, status: 'finished' }).semantic, true);
  });

  test('nový gól v detailu je viditelný', () => {
    const d = diffLiveRow(radek, {
      ...radek,
      detail: { ...radek.detail, goals: [...radek.detail.goals, { min: "40'", side: 'away' }] },
    });
    assert.equal(d.visible, true);
  });

  test('pořadí klíčů v detailu nerozhoduje', () => {
    assert.equal(detailContent({ a: 1, b: 2 }), detailContent({ b: 2, a: 1 }));
  });

  test('null a undefined jsou totéž', () => {
    assert.equal(diffLiveRow({ ...radek, duration: null }, { ...radek, duration: undefined }).visible, false);
  });
});

// ── Falešné hodiny pro plánovač ────────────────────────────────────────────
function falesneHodiny() {
  let ted = 0;
  const fronta: { at: number; fn: () => void; id: number }[] = [];
  let id = 0;
  return {
    setTimeout(fn: () => void, ms: number) {
      const h = ++id;
      fronta.push({ at: ted + ms, fn, id: h });
      return h;
    },
    clearTimeout(h: unknown) {
      const i = fronta.findIndex((f) => f.id === h);
      if (i >= 0) fronta.splice(i, 1);
    },
    /** Posune čas a spustí vše, co je na řadě. */
    async posun(ms: number) {
      ted += ms;
      for (;;) {
        fronta.sort((a, b) => a.at - b.at);
        const dalsi = fronta[0];
        if (!dalsi || dalsi.at > ted) break;
        fronta.shift();
        dalsi.fn();
        // Nechat doběhnout asynchronní kolo.
        for (let i = 0; i < 10; i++) await Promise.resolve();
      }
    },
    naplanovano: () => fronta.map((f) => f.at - ted),
  };
}

describe('PERF-6, STAB — plánovač prohlížeče', () => {
  test('backoff roste a má strop', () => {
    const bezRozptylu = () => 0.5; // rozptyl 0
    assert.equal(backoffDelay(0, bezRozptylu), 90_000);
    assert.equal(backoffDelay(1, bezRozptylu), 180_000);
    assert.equal(backoffDelay(2, bezRozptylu), 300_000);
    assert.equal(backoffDelay(3, bezRozptylu), 600_000);
    assert.equal(backoffDelay(50, bezRozptylu), 600_000, 'Strop – žádné nekonečné prodlužování.');
  });

  test('rozptyl je v mezích ±10 %', () => {
    assert.equal(backoffDelay(0, () => 0), 81_000);
    assert.ok(backoffDelay(0, () => 0.999) <= 99_000);
  });

  test('STAB-2: chyba prodlouží interval a NEVYKRESLÍ stránku', async () => {
    const h = falesneHodiny();
    let vykresleni = 0;
    const p = createLivePoller({
      sync: async () => 'error', refresh: () => { vykresleni++; },
      isVisible: () => true, setTimeout: h.setTimeout, clearTimeout: h.clearTimeout,
      random: () => 0.5,
    });
    p.start();
    await h.posun(90_000);

    assert.equal(vykresleni, 0, 'Výpadek nesmí spouštět drahé vykreslení naprázdno.');
    assert.equal(p.consecutiveErrors(), 1);
    assert.deepEqual(h.naplanovano(), [180_000], 'Další pokus později.');
    p.stop();
  });

  test('po úspěchu se interval vrátí na normál', async () => {
    const h = falesneHodiny();
    const vysledky: SyncOutcome[] = ['error', 'error', 'unchanged'];
    const p = createLivePoller({
      sync: async () => vysledky.shift() ?? 'unchanged', refresh: () => {},
      isVisible: () => true, setTimeout: h.setTimeout, clearTimeout: h.clearTimeout,
      random: () => 0.5,
    });
    p.start();
    await h.posun(90_000);
    await h.posun(180_000);
    await h.posun(300_000);
    assert.equal(p.consecutiveErrors(), 0);
    assert.deepEqual(h.naplanovano(), [90_000]);
    p.stop();
  });

  test('PERF-CHANGED-3: vykreslí se JEN při změně', async () => {
    const h = falesneHodiny();
    let vykresleni = 0;
    const vysledky: SyncOutcome[] = ['unchanged', 'unchanged', 'changed', 'unchanged'];
    const p = createLivePoller({
      sync: async () => vysledky.shift() ?? 'unchanged',
      refresh: () => { vykresleni++; },
      isVisible: () => true, setTimeout: h.setTimeout, clearTimeout: h.clearTimeout,
      random: () => 0.5,
    });
    p.start();
    for (let i = 0; i < 4; i++) await h.posun(90_000);
    assert.equal(vykresleni, 1, 'Čtyři dotazy, jedna změna, jedno vykreslení.');
    p.stop();
  });

  test('PERF-6: skrytá záložka nedotazuje', async () => {
    const h = falesneHodiny();
    let dotazu = 0;
    const p = createLivePoller({
      sync: async () => { dotazu++; return 'unchanged'; }, refresh: () => {},
      isVisible: () => false, setTimeout: h.setTimeout, clearTimeout: h.clearTimeout,
      random: () => 0.5,
    });
    p.start();
    for (let i = 0; i < 5; i++) await h.posun(90_000);
    assert.equal(dotazu, 0);
    p.stop();
  });

  test('pomalý dotaz delší než interval → nikdy dva naráz', async () => {
    const h = falesneHodiny();
    let soucasne = 0;
    let maximum = 0;
    let dokonci: () => void = () => {};

    const p = createLivePoller({
      sync: () => new Promise<SyncOutcome>((r) => {
        soucasne++; maximum = Math.max(maximum, soucasne);
        dokonci = () => { soucasne--; r('unchanged'); };
      }),
      refresh: () => {}, isVisible: () => true,
      setTimeout: h.setTimeout, clearTimeout: h.clearTimeout, random: () => 0.5,
    });
    p.start();
    await h.posun(90_000);            // dotaz začne a visí
    await h.posun(500_000);           // i po dlouhé době žádný druhý
    assert.equal(p.inFlight(), 1);
    assert.equal(maximum, 1, 'Ze záložky nikdy dva dotazy současně.');
    dokonci();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(p.inFlight(), 0);
    p.stop();
  });

  test('STAB-4: výjimka v dotazu neshodí plánovač', async () => {
    const h = falesneHodiny();
    const p = createLivePoller({
      sync: async () => { throw new Error('síť'); }, refresh: () => {},
      isVisible: () => true, setTimeout: h.setTimeout, clearTimeout: h.clearTimeout,
      random: () => 0.5,
    });
    p.start();
    await h.posun(90_000);
    assert.equal(p.consecutiveErrors(), 1, 'Výjimka se počítá jako chyba.');
    assert.equal(h.naplanovano().length, 1, 'A plánuje se dál – žádné zamrznutí.');
    p.stop();
  });

  test('zastavení zruší naplánované kolo', async () => {
    const h = falesneHodiny();
    const p = createLivePoller({
      sync: async () => 'unchanged', refresh: () => {}, isVisible: () => true,
      setTimeout: h.setTimeout, clearTimeout: h.clearTimeout, random: () => 0.5,
    });
    p.start();
    p.stop();
    assert.deepEqual(h.naplanovano(), []);
  });
});

// ── SYNC-LEASE ─────────────────────────────────────────────────────────────
/** Napodobenina SQL funkce: atomický claim s vypršením. */
function leaseStore(now = () => Date.now()): SyncLeaseStore & { crash(): void } {
  let drzi: { owner: string; expires: number } | null = null;
  return {
    async claim(_n, owner, ttl) {
      if (drzi && drzi.expires > now()) return false;
      drzi = { owner, expires: now() + ttl * 1000 };
      return true;
    },
    async release(_n, owner) {
      if (drzi?.owner === owner) drzi = null;
    },
    crash() { /* vlastník zmizí bez release – zámek zůstává */ },
  };
}

describe('SYNC-LEASE-1…4 — jeden vlastník těžké práce', () => {
  test('SYNC-LEASE-1: dva souběžné dotazy → jeden se ptá poskytovatele', async () => {
    const store = leaseStore();
    let prace = 0;
    let uvolni: () => void = () => {};
    const branka = new Promise<void>((r) => { uvolni = r; });

    const a = runWithSyncLease(store, 'liga', async () => { prace++; await branka; return 'a'; });
    const b = runWithSyncLease(store, 'liga', async () => { prace++; return 'b'; });
    const vysledekB = await b;
    uvolni();
    await a;

    assert.equal(prace, 1, 'Poskytovatele se ptá jen jeden.');
    assert.equal(vysledekB.owner, false);
  });

  test('SYNC-LEASE-2: cron a prohlížeč sdílejí tentýž zámek', async () => {
    const store = leaseStore();
    let uvolni: () => void = () => {};
    const branka = new Promise<void>((r) => { uvolni = r; });
    const cron = runWithSyncLease(store, 'highlightly-liga', async () => { await branka; return 1; });
    const prohlizec = await runWithSyncLease(store, 'highlightly-liga', async () => 2);
    assert.equal(prohlizec.owner, false);
    uvolni();
    await cron;
  });

  test('SYNC-LEASE-3: po pádu zámek vyprší a další běh se ujme', async () => {
    let cas = 0;
    const store = leaseStore(() => cas);
    // Vlastník spadne: claim proběhne, release nikdy.
    await store.claim('liga', 'mrtvy', 90);
    store.crash();

    assert.equal((await runWithSyncLease(store, 'liga', async () => 1)).owner, false);
    cas += 91_000;
    assert.equal((await runWithSyncLease(store, 'liga', async () => 1)).owner, true,
      'Zámek nesmí zablokovat synchronizaci navždy.');
  });

  test('SYNC-LEASE-4: ne-vlastník se vrátí hned a nic nepočítá', async () => {
    const store = leaseStore();
    await store.claim('liga', 'jiny', 90);
    let prace = 0;
    const v = await runWithSyncLease(store, 'liga', async () => { prace++; return 1; });
    assert.equal(v.owner, false);
    assert.equal(prace, 0);
  });

  test('STAB-5: selhání práce zámek neotráví', async () => {
    const store = leaseStore();
    await assert.rejects(() => runWithSyncLease(store, 'liga', async () => { throw new Error('x'); }));
    assert.equal((await runWithSyncLease(store, 'liga', async () => 1)).owner, true,
      'Zámek se po chybě uvolní.');
  });

  test('nedostupný zámek (bez migrace) práci neblokuje', async () => {
    const rozbity: SyncLeaseStore = {
      claim: async () => { throw new Error('function does not exist'); },
      release: async () => {},
    };
    const v = await runWithSyncLease(rozbity, 'liga', async () => 'hotovo');
    assert.equal(v.owner, true);
    assert.ok('leaseUnavailable' in v, 'Chybějící migrace nesmí zastavit synchronizaci.');
  });
});

describe('Strop backoffu je rozumný', () => {
  test('nejdelší pauza je 10 minut', () => {
    assert.equal(LIVE_POLL_BACKOFF_MS[LIVE_POLL_BACKOFF_MS.length - 1], 600_000);
  });
});

describe('Ohraničené dotazy na poskytovatele', () => {
  test('žádný fetch na poskytovatele bez časového limitu', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const koren = path.resolve(import.meta.dirname, '../..');
    for (const soubor of ['src/lib/espn.ts', 'src/lib/apiFootball.ts', 'src/lib/espnCompetition.ts']) {
      const zdroj = readFileSync(path.join(koren, soubor), 'utf8');
      const fetche = (zdroj.match(/await fetch\(/g) ?? []).length;
      const ohranicene = (zdroj.match(/PROVIDER_TIMEOUT_MS\)|controller\.signal|signal: controller/g) ?? []).length;
      assert.ok(ohranicene >= fetche, `${soubor}: ${fetche} dotazů, ohraničených ${ohranicene}.`);
    }
  });
});
