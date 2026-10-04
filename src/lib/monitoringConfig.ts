/**
 * Konfigurace monitoringu — čisté funkce bez SDK.
 *
 * Vše, co rozhoduje o tom, CO a KOLIK se posílá do Sentry, je tady, aby to
 * šlo otestovat bez sítě. Samotné SDK se jen napojí (`sentry.*.config.ts`).
 */

export type MonitoringEnvironment = 'production' | 'preview' | 'development';

/**
 * Prostředí z proměnných Vercelu.
 *
 * Neznámá hodnota = `development`, aby se lokální chyby nikdy nepřimíchaly
 * do produkčních upozornění.
 */
export function resolveEnvironment(env: Record<string, string | undefined>): MonitoringEnvironment {
  const v = env.NEXT_PUBLIC_VERCEL_ENV ?? env.VERCEL_ENV;
  if (v === 'production' || v === 'preview') return v;
  return 'development';
}

/**
 * Release = SHA commitu, který Vercel nasadil.
 *
 * Nic se neudržuje ručně. Bez SHA (lokálně) se vrátí verze z package.json
 * s příznakem, aby bylo zřejmé, že nejde o nasazený build.
 */
export function resolveRelease(
  env: Record<string, string | undefined>,
  packageVersion: string,
): string {
  const sha = env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? env.VERCEL_GIT_COMMIT_SHA;
  if (sha && /^[0-9a-f]{7,40}$/i.test(sha)) return `tipovacka@${sha.slice(0, 12)}`;
  return `tipovacka@${packageVersion}-local`;
}

/**
 * Podíl vzorkovaných transakcí.
 *
 * Chyby se zachytávají VŽDY (sampleRate 1). Trasy výkonu jen u části
 * požadavků: aplikace má jednotky uživatelů, takže 10 % stačí na obrázek
 * o pomalých cestách a nevytváří zbytečný provoz ani zátěž.
 */
export function tracesSampleRate(environment: MonitoringEnvironment): number {
  switch (environment) {
    case 'production': return 0.1;
    case 'preview': return 0.2;
    default: return 0;
  }
}

/** Hlavičky, které se do Sentry nikdy nepošlou. */
const CITLIVE_HLAVICKY = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token',
  'apikey', 'x-supabase-auth', 'proxy-authorization', 'x-cron-key',
]);

/**
 * Parametry dotazu, které nesou tajemství.
 *
 * Externí cron volá `/api/sync?key=<CRON_SECRET>` — bez vyčištění by se
 * CRON_SECRET objevil v URL každé chyby a každé drobečkové stopy.
 */
const CITLIVE_PARAMETRY = ['key', 'token', 'secret', 'apikey', 'api_key', 'access_token', 'code'];

/** Klíče v datech, jejichž hodnota se nahradí. */
const CITLIVE_KLICE = /secret|password|passwd|token|apikey|api_key|service_role|authorization|cookie|cron/i;

const SKRYTO = '[Filtered]';

/** Vyčistí tajemství z URL — zachová cestu, ať jde chybu přiřadit. */
export function scrubUrl(url: string): string {
  try {
    const absolutni = /^https?:\/\//.test(url);
    const u = new URL(url, 'http://placeholder.local');
    for (const p of CITLIVE_PARAMETRY) {
      if (u.searchParams.has(p)) u.searchParams.set(p, SKRYTO);
    }
    const vysledek = absolutni ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
    return vysledek.replace(/%5BFiltered%5D/g, SKRYTO);
  } catch {
    // Neparsovatelná URL – radši vyčistit hrubě než poslat tajemství.
    return url.replace(/([?&](?:key|token|secret|apikey|api_key|access_token|code)=)[^&#]*/gi, `$1${SKRYTO}`);
  }
}

/** Rekurzivně nahradí hodnoty citlivých klíčů. Omezená hloubka – žádné velké payloady. */
export function scrubData(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[Truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrubData(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = CITLIVE_KLICE.test(k) ? SKRYTO : scrubData(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && /^(https?:\/\/|\/)/.test(value)) return scrubUrl(value);
  return value;
}

/** Minimální tvar události, se kterým čištění pracuje. */
export interface ScrubbableEvent {
  request?: {
    url?: string;
    headers?: Record<string, string>;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
  };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  breadcrumbs?: Array<{ data?: Record<string, unknown>; message?: string }>;
  user?: unknown;
}

/**
 * `beforeSend` — poslední pojistka před odesláním.
 *
 * Tělo požadavku se zahazuje celé: obsahuje tipy, hesla při přihlášení
 * nebo prompty. Uživatel se neposílá (žádné osobní údaje).
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    if (event.request.headers) {
      const h: Record<string, string> = {};
      for (const [k, v] of Object.entries(event.request.headers)) {
        h[k] = CITLIVE_HLAVICKY.has(k.toLowerCase()) ? SKRYTO : v;
      }
      event.request.headers = h;
    }
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.query_string) event.request.query_string = SKRYTO;
  }
  if (event.extra) event.extra = scrubData(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubData(event.contexts) as Record<string, unknown>;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      data: b.data ? scrubData(b.data) as Record<string, unknown> : b.data,
      message: b.message ? scrubUrl(b.message) : b.message,
    }));
  }
  delete event.user;
  return event;
}

/**
 * Druhy chyb, které jsou OČEKÁVANÉ a obnovitelné.
 *
 * Ty se nehlásí jako problém — jen jako drobečková stopa a strukturovaný
 * log. Jinak by Sentry zaplavily běžné stavy živého zápasu.
 */
export type ExpectedCategory =
  | 'provider_rate_limited'   // 429
  | 'provider_unavailable'    // 5xx
  | 'provider_timeout'        // náš časový limit
  | 'lease_held_elsewhere'    // souběžný běh má zámek – to je správně
  | 'client_sync_failed';     // prohlížeč nedosáhl na server

/** Kategorie chyby podle HTTP stavu poskytovatele. */
export function categorizeProviderStatus(status: number | null, timedOut: boolean): ExpectedCategory | 'provider_error' {
  if (timedOut) return 'provider_timeout';
  if (status === 429) return 'provider_rate_limited';
  if (status != null && status >= 500) return 'provider_unavailable';
  return 'provider_error';
}
