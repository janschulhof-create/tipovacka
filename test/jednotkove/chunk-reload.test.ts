import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { claimChunkReload, isChunkLoadError, RELOAD_COOLDOWN_MS, RELOAD_KEY } from '@/lib/chunkReload';

/** CHUNK-1…5 — Sentry OB-TIPOVACKA-2: „Load failed“ na iPhonu po nasazení. */

const pamet = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
};

describe('CHUNK-1…5', () => {
  test('CHUNK-1: rozpozná hlášky všech prohlížečů', () => {
    for (const message of ['Load failed', 'Loading chunk 755 failed.',
      'Failed to fetch dynamically imported module: x.js', 'Importing a module script failed.']) {
      assert.ok(isChunkLoadError({ message }), message);
    }
    assert.ok(isChunkLoadError({ name: 'ChunkLoadError', message: '' }));
  });

  test('CHUNK-2: jiná chyba stránku nenačítá', () => {
    assert.equal(isChunkLoadError({ message: 'Cannot read properties of undefined' }), false);
    assert.equal(claimChunkReload({ message: 'TypeError: x is null' }, pamet(), 0, true), false);
  });

  test('CHUNK-3: jednou ano, hned podruhé ne – žádná smyčka', () => {
    const s = pamet();
    assert.equal(claimChunkReload({ message: 'Load failed' }, s, 1_000_000, true), true);
    assert.equal(claimChunkReload({ message: 'Load failed' }, s, 1_000_500, true), false);
    assert.equal(claimChunkReload({ message: 'Load failed' }, s, 1_000_000 + RELOAD_COOLDOWN_MS + 1, true), true);
    assert.ok(s.getItem(RELOAD_KEY));
  });

  test('CHUNK-4: offline nebo bez úložiště nic nedělá', () => {
    assert.equal(claimChunkReload({ message: 'Load failed' }, pamet(), 0, false), false);
    assert.equal(claimChunkReload({ message: 'Load failed' }, null, 0, true), false);
    const rozbite = { getItem: () => { throw new Error('x'); }, setItem: () => {} };
    assert.equal(claimChunkReload({ message: 'Load failed' }, rozbite, 0, true), false);
  });

  test('CHUNK-5: chybová hranice to opravdu používá', () => {
    const e = readFileSync(path.join(path.resolve(import.meta.dirname, '../..'), 'src/app/error.tsx'), 'utf8');
    assert.ok(e.includes('claimChunkReload(error, storage, Date.now(), navigator.onLine !== false)'));
    assert.ok(e.includes('window.location.reload()'));
  });
});
