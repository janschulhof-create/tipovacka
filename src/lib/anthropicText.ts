import {
  jeOpakovatelne,
  mapHttpStatus,
  providerTypeZOdpovedi,
  type AnthropicFailureReason,
  type AnthropicResult,
} from './anthropicErrors';

const DEFAULT_ROAST_MODEL = 'claude-sonnet-4-6';
const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_POKUSU = 2; // původní pokus + nejvýše jeden retry

export function getRoastModel(): string {
  return process.env.ANTHROPIC_ROAST_MODEL || DEFAULT_ROAST_MODEL;
}

/** Timeout z prostředí, bezpečně omezený na 5–60 s. */
export function getTimeoutMs(): number {
  const raw = Number(process.env.ANTHROPIC_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(raw)));
}

/** Závislosti se injektují, aby testy nepotřebovaly síť ani reálné čekání. */
export interface AnthropicDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface Pokus {
  reason: AnthropicFailureReason;
  httpStatus: number | null;
  providerType: string | null;
  requestId: string | null;
}

function requestIdZHlavicek(headers: Headers | undefined): string | null {
  if (!headers || typeof headers.get !== 'function') return null;
  return headers.get('request-id') ?? headers.get('x-request-id') ?? null;
}

/** Jeden pokus o zavolání API. Vrací buď text, nebo kategorizovanou chybu. */
async function jedenPokus(
  prompt: string,
  maxTokens: number,
  key: string,
  model: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ text: string; requestId: string | null; stopReason: string | null } | Pokus> {
  let response: Response;
  try {
    response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Lokální timeout vs. síťová chyba se rozliší podle jména výjimky,
    // protože tady žádný HTTP stav neexistuje.
    const jmeno = (error as { name?: string } | null)?.name ?? '';
    const reason: AnthropicFailureReason =
      jmeno === 'TimeoutError' || jmeno === 'AbortError' ? 'local_timeout' : 'network';
    return { reason, httpStatus: null, providerType: null, requestId: null };
  }

  const requestId = requestIdZHlavicek(response.headers);

  if (!response.ok) {
    let providerType: string | null = null;
    try {
      providerType = providerTypeZOdpovedi(await response.json());
    } catch {
      // Tělo chyby nemusí být JSON – kategorii určí samotný stavový kód.
    }
    return {
      reason: mapHttpStatus(response.status, providerType),
      httpStatus: response.status,
      providerType,
      requestId,
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { reason: 'invalid_json', httpStatus: response.status, providerType: null, requestId };
  }

  const stopReason = (data as { stop_reason?: unknown })?.stop_reason;
  const stop = typeof stopReason === 'string' ? stopReason : null;
  if (stop === 'refusal') {
    return { reason: 'refusal', httpStatus: response.status, providerType: null, requestId };
  }

  const content = (data as { content?: unknown })?.content;
  if (!Array.isArray(content)) {
    return { reason: 'invalid_response', httpStatus: response.status, providerType: null, requestId };
  }

  const text = content
    .filter((blok) => (blok as { type?: string })?.type === 'text')
    .map((blok) => (blok as { text?: string })?.text ?? '')
    .join('')
    .trim();

  if (!text) {
    return { reason: 'empty_response', httpStatus: response.status, providerType: null, requestId };
  }

  return { text, requestId, stopReason: stop };
}

/**
 * Nízkoúrovňový klient pro textové generování.
 *
 * Vrací STRUKTUROVANÝ výsledek – nikdy `null`. Volající tak pozná, jestli
 * šlo o chybějící klíč, autentizaci, kredit, rate limit, timeout nebo
 * neplatnou odpověď.
 */
export async function generateAnthropicText(
  prompt: string,
  maxTokens = 640,
  deps: AnthropicDeps = {},
): Promise<AnthropicResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());

  const model = getRoastModel();
  const timeoutMs = getTimeoutMs();
  const start = now();
  const key = process.env.ANTHROPIC_API_KEY;

  // Bez klíče se poskytovatel vůbec nevolá.
  if (!key) {
    return {
      ok: false,
      reason: 'missing_key',
      model,
      durationMs: now() - start,
      requestId: null,
      httpStatus: null,
      providerType: null,
      attempts: 0,
    };
  }

  let posledni: Pokus | null = null;

  for (let attempt = 1; attempt <= MAX_POKUSU; attempt++) {
    const vysledek = await jedenPokus(prompt, maxTokens, key, model, timeoutMs, fetchImpl);

    if ('text' in vysledek) {
      return {
        ok: true,
        text: vysledek.text,
        model,
        durationMs: now() - start,
        requestId: vysledek.requestId,
        stopReason: vysledek.stopReason,
        attempts: attempt,
      };
    }

    posledni = vysledek;

    const muzeZnovu = attempt < MAX_POKUSU && jeOpakovatelne(vysledek.reason);
    if (!muzeZnovu) break;
    await sleep(250); // krátký backoff, dashboard nesmí čekat desítky sekund
  }

  return {
    ok: false,
    reason: posledni?.reason ?? 'unknown',
    model,
    durationMs: now() - start,
    requestId: posledni?.requestId ?? null,
    httpStatus: posledni?.httpStatus ?? null,
    providerType: posledni?.providerType ?? null,
    attempts: Math.min(MAX_POKUSU, posledni && jeOpakovatelne(posledni.reason) ? MAX_POKUSU : 1),
  };
}
