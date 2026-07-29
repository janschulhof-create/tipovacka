import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateAnthropicText, getTimeoutMs } from '@/lib/anthropicText';
import { mapHttpStatus, jeOpakovatelne } from '@/lib/anthropicErrors';

/**
 * AI-R1…R11 — deterministické testy klienta Claude API.
 *
 * Žádná živá síť: `fetch` i `sleep` se injektují. Testy nečekají reálný čas.
 * Všechny „klíče" jsou syntetické, vytvořené jen pro test.
 */

const FAKE_KEY = 'test-nikoli-skutecny-klic';
let puvodniKlic: string | undefined;
let puvodniModel: string | undefined;

beforeEach(() => {
  puvodniKlic = process.env.ANTHROPIC_API_KEY;
  puvodniModel = process.env.ANTHROPIC_ROAST_MODEL;
  process.env.ANTHROPIC_API_KEY = FAKE_KEY;
  process.env.ANTHROPIC_ROAST_MODEL = 'claude-sonnet-4-6';
});

afterEach(() => {
  if (puvodniKlic === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = puvodniKlic;
  if (puvodniModel === undefined) delete process.env.ANTHROPIC_ROAST_MODEL;
  else process.env.ANTHROPIC_ROAST_MODEL = puvodniModel;
});

/** Vytvoří odpověď s daným stavem a tělem. */
function odpoved(status: number, body: unknown, requestId = 'req_test_123'): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'request-id': requestId, 'content-type': 'application/json' },
  });
}

/** Mock fetch, který počítá volání. */
function mockFetch(odpovedi: (Response | Error)[]) {
  let volani = 0;
  const impl = (async () => {
    const dalsi = odpovedi[Math.min(volani, odpovedi.length - 1)];
    volani++;
    if (dalsi instanceof Error) throw dalsi;
    return dalsi.clone();
  }) as unknown as typeof fetch;
  return { impl, pocetVolani: () => volani };
}

const bezCekani = { sleep: async () => {} };

describe('AI-R1 — chybějící klíč', () => {
  test('reason = missing_key a provider se vůbec nezavolá', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { impl, pocetVolani } = mockFetch([odpoved(200, {})]);

    const v = await generateAnthropicText('x', 10, { fetchImpl: impl, ...bezCekani });

    assert.equal(v.ok, false);
    assert.equal(v.ok === false && v.reason, 'missing_key');
    assert.equal(pocetVolani(), 0, 'Bez klíče se API nesmí volat.');
  });
});

describe('AI-R2…R4 — trvalé chyby se NEOPAKUJÍ', () => {
  const pripady: [number, string][] = [
    [401, 'authentication'],
    [403, 'permission'],
    [404, 'model_unavailable'],
    [400, 'invalid_request'],
  ];

  for (const [status, reason] of pripady) {
    test(`HTTP ${status} → ${reason}, jediný pokus`, async () => {
      const { impl, pocetVolani } = mockFetch([odpoved(status, { error: { type: 'x' } })]);
      const v = await generateAnthropicText('x', 10, { fetchImpl: impl, ...bezCekani });

      assert.equal(v.ok, false);
      assert.equal(v.ok === false && v.reason, reason);
      assert.equal(v.ok === false && v.httpStatus, status);
      assert.equal(pocetVolani(), 1, 'Trvalá chyba se nesmí opakovat.');
      assert.equal(v.ok === false && v.requestId, 'req_test_123');
    });
  }
});

describe('AI-R5…R6 — dočasné chyby se opakují PRÁVĚ JEDNOU', () => {
  const docasne: [number, string][] = [
    [429, 'rate_limit'],
    [529, 'overloaded'],
    [500, 'api_error'],
    [503, 'api_error'],
    [504, 'provider_timeout'],
  ];

  for (const [status, reason] of docasne) {
    test(`HTTP ${status} → ${reason}, attempts = 2`, async () => {
      const { impl, pocetVolani } = mockFetch([odpoved(status, {}), odpoved(status, {})]);
      const v = await generateAnthropicText('x', 10, { fetchImpl: impl, ...bezCekani });

      assert.equal(v.ok, false);
      assert.equal(v.ok === false && v.reason, reason);
      assert.equal(pocetVolani(), 2, 'Právě jeden opakovaný pokus.');
      assert.equal(v.ok === false && v.attempts, 2);
    });
  }

  test('429 a poté úspěch → ok, attempts = 2', async () => {
    const { impl } = mockFetch([
      odpoved(429, {}),
      odpoved(200, { content: [{ type: 'text', text: 'Hotovo.' }], stop_reason: 'end_turn' }),
    ]);
    const v = await generateAnthropicText('x', 10, { fetchImpl: impl, ...bezCekani });

    assert.equal(v.ok, true);
    assert.equal(v.ok === true && v.attempts, 2);
  });
});

describe('AI-R7…R10 — lokální a obsahové chyby', () => {
  test('lokální timeout → local_timeout', async () => {
    const chyba = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const { impl } = mockFetch([chyba]);
    const v = await generateAnthropicText('x', 10, { fetchImpl: impl, ...bezCekani });
    assert.equal(v.ok === false && v.reason, 'local_timeout');
  });

  test('síťová chyba → network (a jeden retry)', async () => {
    const { impl, pocetVolani } = mockFetch([new TypeError('fetch failed')]);
    const v = await generateAnthropicText('x', 10, { fetchImpl: impl, ...bezCekani });
    assert.equal(v.ok === false && v.reason, 'network');
    assert.equal(pocetVolani(), 2);
  });

  test('neplatný JSON → invalid_json', async () => {
    const { impl } = mockFetch([odpoved(200, 'tohle není json')]);
    const v = await generateAnthropicText('x', 10, { fetchImpl: impl, ...bezCekani });
    assert.equal(v.ok === false && v.reason, 'invalid_json');
  });

  test('HTTP 200 bez textu → empty_response', async () => {
    const { impl } = mockFetch([odpoved(200, { content: [] })]);
    const v = await generateAnthropicText('x', 10, { fetchImpl: impl, ...bezCekani });
    assert.equal(v.ok === false && v.reason, 'empty_response');
  });

  test('content není pole → invalid_response', async () => {
    const { impl } = mockFetch([odpoved(200, { content: 'nesmysl' })]);
    const v = await generateAnthropicText('x', 10, { fetchImpl: impl, ...bezCekani });
    assert.equal(v.ok === false && v.reason, 'invalid_response');
  });

  test('stop_reason = refusal → refusal', async () => {
    const { impl } = mockFetch([
      odpoved(200, { content: [{ type: 'text', text: 'nemohu' }], stop_reason: 'refusal' }),
    ]);
    const v = await generateAnthropicText('x', 10, { fetchImpl: impl, ...bezCekani });
    assert.equal(v.ok === false && v.reason, 'refusal');
  });
});

describe('AI-R11 — úspěch', () => {
  test('vrátí text, model, requestId, durationMs, attempts', async () => {
    const { impl } = mockFetch([
      odpoved(200, { content: [{ type: 'text', text: '  Studio hlásí.  ' }], stop_reason: 'end_turn' }),
    ]);
    let cas = 1000;
    const v = await generateAnthropicText('x', 10, {
      fetchImpl: impl,
      ...bezCekani,
      now: () => (cas += 150),
    });

    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(v.text, 'Studio hlásí.');
    assert.equal(v.model, 'claude-sonnet-4-6');
    assert.equal(v.requestId, 'req_test_123');
    assert.equal(v.attempts, 1);
    assert.ok(v.durationMs > 0);
    assert.equal(v.stopReason, 'end_turn');
  });
});

describe('AI-R12 — výsledek nikdy neobsahuje API klíč', () => {
  test('ani při úspěchu, ani při chybě', async () => {
    const { impl } = mockFetch([odpoved(401, { error: { type: 'authentication_error' } })]);
    const v = await generateAnthropicText('tajny prompt', 10, { fetchImpl: impl, ...bezCekani });

    const serializovano = JSON.stringify(v);
    assert.ok(!serializovano.includes(FAKE_KEY), 'Klíč se nesmí objevit ve výsledku.');
    assert.ok(!serializovano.includes('tajny prompt'), 'Prompt se nesmí objevit ve výsledku.');
  });
});

describe('Mapování stavů a pravidla opakování', () => {
  test('400 s billing typem → billing_or_quota', () => {
    assert.equal(mapHttpStatus(400, 'billing_error'), 'billing_or_quota');
    assert.equal(mapHttpStatus(400, 'invalid_request_error'), 'invalid_request');
  });

  test('trvalé chyby se neopakují', () => {
    for (const r of ['authentication', 'permission', 'model_unavailable', 'invalid_request', 'missing_key'] as const) {
      assert.equal(jeOpakovatelne(r), false, `${r} se nesmí opakovat`);
    }
  });

  test('dočasné chyby se opakují', () => {
    for (const r of ['rate_limit', 'api_error', 'provider_timeout', 'overloaded', 'network'] as const) {
      assert.equal(jeOpakovatelne(r), true, `${r} se má opakovat`);
    }
  });
});

describe('Timeout je konfigurovatelný a omezený', () => {
  test('výchozí 30 s', () => {
    delete process.env.ANTHROPIC_TIMEOUT_MS;
    assert.equal(getTimeoutMs(), 30_000);
  });

  test('rozsah se ořízne na 5–60 s', () => {
    process.env.ANTHROPIC_TIMEOUT_MS = '1000';
    assert.equal(getTimeoutMs(), 5_000);
    process.env.ANTHROPIC_TIMEOUT_MS = '999999';
    assert.equal(getTimeoutMs(), 60_000);
    process.env.ANTHROPIC_TIMEOUT_MS = '45000';
    assert.equal(getTimeoutMs(), 45_000);
    delete process.env.ANTHROPIC_TIMEOUT_MS;
  });
});
