import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createBoundedFetch, SUPABASE_REQUEST_TIMEOUT_MS } from '@/lib/supabase/boundedFetch';

const ROOT = path.resolve(import.meta.dirname, '../..');
const middlewareSource = readFileSync(path.join(ROOT, 'src/middleware.ts'), 'utf8');
const serverSource = readFileSync(path.join(ROOT, 'src/lib/supabase/server.ts'), 'utf8');
const authSource = readFileSync(path.join(ROOT, 'src/lib/auth.ts'), 'utf8');

describe('AUTH-HOTFIX — skutečné ukončení uvázlého Supabase requestu', () => {
  test('bounded fetch abortuje podkladový request, nejen čekání volajícího', { timeout: 1000 }, async () => {
    let abortSeen = false;

    const hungFetch = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      assert.ok(signal, 'Bounded fetch musí podkladovému requestu předat AbortSignal.');
      signal.addEventListener('abort', () => {
        abortSeen = true;
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    })) as typeof fetch;

    const bounded = createBoundedFetch(60, hungFetch);
    const started = Date.now();

    await assert.rejects(() => bounded('https://example.invalid/auth/v1/user'));

    const elapsed = Date.now() - started;
    assert.equal(abortSeen, true, 'Podkladový fetch musí být opravdu abortován.');
    assert.ok(elapsed < 500, `Request trval ${elapsed} ms — timeout nefunguje.`);
  });

  test('rychlý request projde bez abortu', async () => {
    const fastFetch = (async () => new Response('ok', { status: 200 })) as typeof fetch;
    const bounded = createBoundedFetch(500, fastFetch);
    const response = await bounded('https://example.invalid');
    assert.equal(response.status, 200);
  });

  test('respektuje už existující AbortSignal', { timeout: 1000 }, async () => {
    let abortSeen = false;
    const hungFetch = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        abortSeen = true;
        reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    })) as typeof fetch;

    const upstream = new AbortController();
    const bounded = createBoundedFetch(500, hungFetch);
    const request = bounded('https://example.invalid', { signal: upstream.signal });
    upstream.abort(new DOMException('caller aborted', 'AbortError'));

    await assert.rejects(() => request);
    assert.equal(abortSeen, true);
  });

  test('produkční auth timeout zůstává hluboko pod Vercel middleware limitem', () => {
    assert.ok(SUPABASE_REQUEST_TIMEOUT_MS <= 3000);
    assert.ok(SUPABASE_REQUEST_TIMEOUT_MS >= 1000);
  });
});

describe('AUTH-HOTFIX — globální request path je ohraničená', () => {
  test('middleware Supabase klient používá bounded fetch', () => {
    assert.ok(middlewareSource.includes("global: { fetch: boundedSupabaseFetch }"));
  });

  test('server auth klient používá bounded fetch pro všechny getUser volající', () => {
    assert.ok(serverSource.includes("global: { fetch: boundedSupabaseFetch }"));
  });

  test('RootLayout session discovery degraduje při chybě na null', () => {
    assert.ok(authSource.includes('try {'));
    assert.ok(authSource.includes('catch (error)'));
    assert.ok(authSource.includes('if (authError || !user) return null;'));
    assert.ok(authSource.includes("event: 'session_player_lookup_failed'"));
  });
});
