import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * CLIENT-ENV-1…5 — regrese chyby z v0.1.82: Sentry v prohlížeči vypnuté.
 *
 * PŘESNÁ PŘÍČINA (ověřeno na buildu):
 *   `const env = process.env; resolveEnvironment(env)` – Next.js vložil DSN,
 *   ale PROSTŘEDÍ se četlo z objektu dynamicky. V prohlížeči je `process.env`
 *   prázdný → `development` → `enabled: false`. Server fungoval, protože
 *   tam `process.env` existuje za běhu.
 *
 * Plný důkaz na buildu: `npm run verify:client-env` (několik minut, mimo npm test).
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');
const bezKomentaru = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const VEREJNE = [
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_VERCEL_ENV',
  'NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA',
  'NEXT_PUBLIC_APP_VERSION',
];

/** Kód, který běží v prohlížeči při inicializaci Sentry. */
const KLIENTSKE = ['src/lib/monitoringEnv.ts', 'src/lib/sentryShared.ts', 'sentry.client.config.ts'];

describe('CLIENT-ENV-1…3 — jen přímé odkazy', () => {
  test('CLIENT-ENV-1: každá veřejná proměnná je odkazovaná doslova', () => {
    const env = bezKomentaru(cti('src/lib/monitoringEnv.ts'));
    for (const k of VEREJNE) {
      assert.ok(env.includes(`process.env.${k}`), `Chybí přímý odkaz process.env.${k}.`);
    }
  });

  test('CLIENT-ENV-2: žádný alias, destrukturalizace ani dynamický klíč', () => {
    for (const soubor of KLIENTSKE) {
      const kod = bezKomentaru(cti(soubor));
      assert.ok(!/=\s*process\.env\s*(as\b|;|,|\))/.test(kod), `${soubor}: alias process.env.`);
      assert.ok(!/\{[^}]*\}\s*=\s*process\.env\b/.test(kod), `${soubor}: destrukturalizace process.env.`);
      assert.ok(!/process\.env\s*\[/.test(kod), `${soubor}: dynamický klíč process.env[...].`);
      assert.ok(!/\(\s*process\.env\s*[,)]/.test(kod), `${soubor}: process.env předaný jako celek.`);
    }
  });

  test('CLIENT-ENV-3: inicializace bere proměnné z readMonitoringEnv()', () => {
    const shared = bezKomentaru(cti('src/lib/sentryShared.ts'));
    assert.ok(shared.includes('const env = readMonitoringEnv()'));
    assert.ok(shared.includes('const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN'));
  });
});

describe('CLIENT-ENV-4 — server beze změny', () => {
  test('přednost: veřejná proměnná, pak serverová', async () => {
    const { resolveEnvironment, resolveRelease } = await import('@/lib/monitoringConfig');
    // Prohlížeč: jen veřejné hodnoty.
    assert.equal(resolveEnvironment({ NEXT_PUBLIC_VERCEL_ENV: 'production' }), 'production');
    // Server: jen VERCEL_ENV – jako dřív.
    assert.equal(resolveEnvironment({ VERCEL_ENV: 'production' }), 'production');
    assert.equal(resolveRelease({ VERCEL_GIT_COMMIT_SHA: '4f973e831d1cabc' }, '0.1.82'), 'tipovacka@4f973e831d1c');
  });

  test('readMonitoringEnv vrací i serverové proměnné', async () => {
    const { readMonitoringEnv } = await import('@/lib/monitoringEnv');
    const klice = Object.keys(readMonitoringEnv());
    for (const k of [...VEREJNE, 'VERCEL_ENV', 'VERCEL_GIT_COMMIT_SHA']) assert.ok(klice.includes(k));
  });
});

describe('CLIENT-ENV-5 — výchozí zachytávání chyb zůstává', () => {
  test('integrace se slučují s výchozími (globalHandlers zůstává)', () => {
    const shared = bezKomentaru(cti('src/lib/sentryShared.ts'));
    assert.ok(/integrations:\s*\[\]/.test(shared), 'Pole se slučuje s výchozími integracemi.');
    assert.ok(!/defaultIntegrations\s*:\s*false/.test(shared), 'Vypnutí by zrušilo globální zachytávání.');
    assert.ok(!/integrations:\s*\(/.test(shared), 'Funkce místo pole by mohla výchozí integrace vyřadit.');
  });

  test('soukromí beze změny', () => {
    const shared = cti('src/lib/sentryShared.ts');
    assert.ok(shared.includes('sendDefaultPii: false'));
    assert.ok(shared.includes('beforeSend: (event) => scrubEvent('));
    assert.ok(!shared.includes('replayIntegration'));
  });

  test('build-level ověření je k dispozici', () => {
    assert.ok(JSON.parse(cti('package.json')).scripts['verify:client-env']);
    const skript = cti('scripts/verify-client-env.mjs');
    assert.ok(skript.includes('=process\\.env,'), 'Kontroluje i dynamické předání, ne jen přítomnost DSN.');
  });
});
