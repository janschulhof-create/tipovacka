import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  pendingForTests, reportError, reportExpected, reportOnce,
  resetMonitoringForTests, resetReportOnceForTests, setMonitoringSink, type MonitoringSink,
} from '@/lib/monitoring';
import {
  categorizeProviderStatus, resolveEnvironment, resolveRelease, scrubData, scrubEvent, scrubUrl, tracesSampleRate,
} from '@/lib/monitoringConfig';
import { buildHealthPayload } from '@/lib/health';
import { runWithSyncLease, type SyncLeaseStore } from '@/lib/syncLease';

/**
 * OBS-1…7 — monitoring. Sentry SDK je nahrazené napodobeninou; testy
 * nesahají na síť ani na službu Sentry.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

function napodobenina() {
  const zaznam = { exceptions: [] as unknown[], messages: [] as string[], breadcrumbs: [] as string[] };
  const sink: MonitoringSink = {
    captureException: (e) => { zaznam.exceptions.push(e); },
    captureMessage: (m) => { zaznam.messages.push(m); },
    addBreadcrumb: (b) => { zaznam.breadcrumbs.push(b.message); },
  };
  return { sink, zaznam };
}

beforeEach(() => { resetMonitoringForTests(); resetReportOnceForTests(); });

describe('OBS-1…2 — endpoint zdraví', () => {
  test('OBS-1: vrací očekávaný tvar', () => {
    const p = buildHealthPayload({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' }, new Date('2026-10-04T12:00:00Z'));
    assert.deepEqual(p, {
      ok: true, environment: 'production', release: 'tipovacka@abcdef123456', time: '2026-10-04T12:00:00.000Z',
    });
  });

  test('OBS-2: nesahá na databázi, poskytovatele, AI ani zámek', () => {
    const zdroj = cti('src/app/api/health/route.ts') + cti('src/lib/health.ts');
    for (const zakazane of ['supabase', 'createAdminClient', 'fetch(', 'Highlightly', 'espn',
      'anthropic', 'generateAnthropicText', 'claim_sync_lease', 'runWithSyncLease']) {
      assert.ok(!zdroj.toLowerCase().includes(zakazane.toLowerCase()), `Health nesmí obsahovat ${zakazane}.`);
    }
    assert.ok(cti('src/app/api/health/route.ts').includes("'Cache-Control': 'no-store'"));
  });

  test('middleware na /api/health nesahá (žádná autentizace)', () => {
    assert.ok(cti('src/middleware.ts').includes('(?!api(?:/|$)'));
  });
});

describe('OBS-3 — selhání monitoringu neshodí požadavek', () => {
  test('výjimka v SDK se pohltí', () => {
    setMonitoringSink({
      captureException: () => { throw new Error('Sentry spadl'); },
      captureMessage: () => { throw new Error('Sentry spadl'); },
      addBreadcrumb: () => { throw new Error('Sentry spadl'); },
    });
    assert.doesNotThrow(() => reportError(new Error('x'), { area: 'test' }));
    assert.doesNotThrow(() => reportExpected('provider_timeout'));
    assert.doesNotThrow(() => reportOnce('k', 'zprava'));
  });

  test('před načtením SDK se chyby podrží a pak odešlou', () => {
    reportError(new Error('raná'), { area: 'test' });
    reportExpected('client_sync_failed');
    assert.equal(pendingForTests(), 2);
    const { sink, zaznam } = napodobenina();
    setMonitoringSink(sink);
    assert.equal(zaznam.exceptions.length, 1);
    assert.equal(zaznam.breadcrumbs.length, 1);
    assert.equal(pendingForTests(), 0);
  });

  test('fronta je omezená – žádné hromadění paměti', () => {
    for (let i = 0; i < 500; i++) reportError(new Error(`e${i}`), { area: 'test' });
    assert.ok(pendingForTests() <= 20);
  });
});

describe('OBS-4 — čištění citlivých dat', () => {
  test('CRON_SECRET v URL se skryje', () => {
    assert.equal(scrubUrl('/api/sync?key=tipovacka-ms-2026-obtipovacka'), '/api/sync?key=[Filtered]');
    assert.ok(!scrubUrl('https://obtipovacka.vercel.app/api/sync?key=tajne&x=1').includes('tajne'));
  });

  test('citlivé hlavičky, cookies, tělo i uživatel se odstraní', () => {
    const e = scrubEvent({
      request: {
        url: '/api/sync?key=tajne',
        headers: { Authorization: 'Bearer abc', Cookie: 'sb=xyz', 'user-agent': 'Chrome' },
        cookies: { sb: 'xyz' },
        data: { tips: [1, 2, 3], poznamka: 'tělo požadavku' },
      },
      user: { email: 'a@b.cz' },
    });
    assert.equal(e.request?.headers?.Authorization, '[Filtered]');
    assert.equal(e.request?.headers?.Cookie, '[Filtered]');
    assert.equal(e.request?.headers?.['user-agent'], 'Chrome');
    assert.equal(e.request?.cookies, undefined);
    assert.equal(e.request?.data, undefined, 'Tělo požadavku (tipy, přihlašovací údaje) se neposílá celé.');
    assert.equal(e.user, undefined);
    assert.ok(!JSON.stringify(e).includes('tajne'));
  });

  test('tajné klíče v kontextu a drobečcích se nahradí', () => {
    const d = scrubData({ SUPABASE_SERVICE_ROLE_KEY: 'x', nested: { cronSecret: 'y', ok: 1 } }) as Record<string, unknown>;
    assert.equal(d.SUPABASE_SERVICE_ROLE_KEY, '[Filtered]');
    assert.deepEqual(d.nested, { cronSecret: '[Filtered]', ok: 1 });
    const e = scrubEvent({ breadcrumbs: [{ message: '/api/sync?key=tajne', data: { url: '/api/sync?key=tajne' } }] });
    assert.ok(!JSON.stringify(e).includes('tajne'));
  });

  test('Session Replay je vypnutý a PII se neposílá', () => {
    const shared = cti('src/lib/sentryShared.ts');
    assert.ok(shared.includes('sendDefaultPii: false'));
    assert.ok(!shared.includes('replayIntegration'));
    assert.ok(shared.includes('integrations: []'));
  });
});

describe('OBS-5…6 — co je issue a co jen stopa', () => {
  test('OBS-5: cizí zámek NENÍ chyba aplikace', async () => {
    const { sink, zaznam } = napodobenina();
    setMonitoringSink(sink);
    const obsazeno: SyncLeaseStore = { claim: async () => false, release: async () => {} };
    const v = await runWithSyncLease(obsazeno, 'liga', async () => 1);
    assert.equal(v.owner, false);
    assert.equal(zaznam.exceptions.length, 0, 'Žádné issue.');
    assert.equal(zaznam.messages.length, 0);
    assert.deepEqual(zaznam.breadcrumbs, ['lease_held_elsewhere']);
  });

  test('nedostupný zámek se ohlásí JEDNOU za běh', async () => {
    const { sink, zaznam } = napodobenina();
    setMonitoringSink(sink);
    const rozbity: SyncLeaseStore = { claim: async () => { throw new Error('permission denied'); }, release: async () => {} };
    for (let i = 0; i < 5; i++) await runWithSyncLease(rozbity, 'liga', async () => 1);
    assert.equal(zaznam.messages.length, 1, 'Jinak by každý požadavek plnil kvótu.');
  });

  test('OBS-6: skutečná chyba synchronizace se zachytí', () => {
    const { sink, zaznam } = napodobenina();
    setMonitoringSink(sink);
    reportError(new Error('sync_database_write_failed'), { area: 'live_sync' });
    assert.equal(zaznam.exceptions.length, 1);
  });

  test('stavy poskytovatele se třídí správně', () => {
    assert.equal(categorizeProviderStatus(429, false), 'provider_rate_limited');
    assert.equal(categorizeProviderStatus(503, false), 'provider_unavailable');
    assert.equal(categorizeProviderStatus(null, true), 'provider_timeout');
    assert.equal(categorizeProviderStatus(400, false), 'provider_error');
  });

  test('napojení: chyby DB jsou issue, poskytovatel jen stopa', () => {
    const route = cti('src/app/api/sync-football/route.ts');
    assert.ok(route.includes("reportError(new Error('sync_database_write_failed')"));
    assert.ok(route.includes("reportExpected('provider_unavailable'"));
    assert.ok(route.includes("reportError(error, { area: 'matchday_recap'"));
  });
});

describe('OBS-7 — prostředí a release', () => {
  test('prostředí: neznámé = development', () => {
    assert.equal(resolveEnvironment({ VERCEL_ENV: 'production' }), 'production');
    assert.equal(resolveEnvironment({ NEXT_PUBLIC_VERCEL_ENV: 'preview' }), 'preview');
    assert.equal(resolveEnvironment({}), 'development');
    assert.equal(resolveEnvironment({ VERCEL_ENV: 'cokoli' }), 'development');
  });

  test('release je deterministický a bere SHA commitu', () => {
    const env = { VERCEL_GIT_COMMIT_SHA: '0123456789abcdef0123' };
    assert.equal(resolveRelease(env, '0.1.82'), resolveRelease(env, '0.1.82'));
    assert.equal(resolveRelease(env, '0.1.82'), 'tipovacka@0123456789ab');
    assert.equal(resolveRelease({}, '0.1.82'), 'tipovacka@0.1.82-local');
    assert.equal(resolveRelease({ VERCEL_GIT_COMMIT_SHA: 'nesmysl!' }, '0.1.82'), 'tipovacka@0.1.82-local');
  });

  test('vzorkování: produkce 10 %, lokálně nic, nikdy 100 %', () => {
    assert.equal(tracesSampleRate('production'), 0.1);
    assert.equal(tracesSampleRate('development'), 0);
    for (const e of ['production', 'preview', 'development'] as const) assert.ok(tracesSampleRate(e) < 1);
  });

  test('bez DSN nebo lokálně je SDK vypnuté', () => {
    assert.ok(cti('src/lib/sentryShared.ts').includes("enabled: Boolean(dsn) && environment !== 'development'"));
  });
});

describe('Výkon — SDK mimo první načtení', () => {
  test('prohlížeč načítá SDK odloženě', () => {
    const client = cti('sentry.client.config.ts');
    assert.ok(client.includes("import('./src/lib/sentryShared')"), 'Dynamický import = samostatný chunk.');
    assert.ok(client.includes('requestIdleCallback'));
    assert.ok(!/^import \* as Sentry/m.test(client), 'Statický import by SDK přibalil do prvního načtení.');
  });

  test('monitoring.ts SDK neimportuje', () => {
    assert.ok(!cti('src/lib/monitoring.ts').includes('@sentry'), 'Jinak by šel do každého klientského bundlu.');
  });
});
