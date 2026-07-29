/**
 * Kategorie selhání volání Anthropic API.
 *
 * Dřív se všechny tyto situace sloučily do jediného `null`, takže z produkce
 * nešlo poznat, jestli chybí klíč, došel kredit, nebo model odmítl odpovědět.
 */
export type AnthropicFailureReason =
  | 'missing_key'
  | 'invalid_request'
  | 'authentication'
  | 'permission'
  | 'model_unavailable'
  | 'billing_or_quota'
  | 'rate_limit'
  | 'api_error'
  | 'provider_timeout'
  | 'overloaded'
  | 'local_timeout'
  | 'network'
  | 'invalid_json'
  | 'invalid_response'
  | 'empty_response'
  | 'refusal'
  | 'validation_rejected'
  | 'unknown';

export interface AnthropicSuccess {
  ok: true;
  text: string;
  model: string;
  durationMs: number;
  requestId: string | null;
  stopReason: string | null;
  attempts: number;
}

export interface AnthropicFailure {
  ok: false;
  reason: AnthropicFailureReason;
  model: string;
  durationMs: number;
  requestId: string | null;
  httpStatus: number | null;
  providerType: string | null;
  attempts: number;
}

export type AnthropicResult = AnthropicSuccess | AnthropicFailure;

/**
 * Dočasné chyby, u kterých má smysl jeden opakovaný pokus.
 * Trvalé chyby (klíč, oprávnění, neplatný požadavek) se NIKDY neopakují —
 * druhý pokus by dopadl stejně a jen by zdržel dashboard.
 */
const OPAKOVATELNE: ReadonlySet<AnthropicFailureReason> = new Set([
  'rate_limit',
  'api_error',
  'provider_timeout',
  'overloaded',
  'network',
]);

export function jeOpakovatelne(reason: AnthropicFailureReason): boolean {
  return OPAKOVATELNE.has(reason);
}

/**
 * Mapování HTTP stavu na kategorii.
 *
 * Rozhoduje se podle STAVOVÉHO KÓDU a `type` z odpovědi poskytovatele,
 * nikdy podle textu výjimky.
 */
export function mapHttpStatus(status: number, providerType: string | null): AnthropicFailureReason {
  // U 400 umí Anthropic rozlišit billing/kredit přes `type`.
  if (status === 400) {
    if (providerType && /billing|credit|quota|payment/i.test(providerType)) return 'billing_or_quota';
    return 'invalid_request';
  }
  if (status === 401) return 'authentication';
  if (status === 402) return 'billing_or_quota';
  if (status === 403) return 'permission';
  if (status === 404) return 'model_unavailable';
  if (status === 413) return 'invalid_request';
  if (status === 429) return 'rate_limit';
  if (status === 529) return 'overloaded';
  if (status === 504 || status === 522 || status === 524) return 'provider_timeout';
  if (status === 502 || status === 503) return 'api_error';
  if (status >= 500) return 'api_error';
  if (status >= 400) return 'invalid_request';
  return 'unknown';
}

/** Bezpečně vytáhne `type` chyby z odpovědi, aniž by se cokoli dalšího logovalo. */
export function providerTypeZOdpovedi(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const error = (data as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return null;
  const typ = (error as { type?: unknown }).type;
  return typeof typ === 'string' ? typ : null;
}
