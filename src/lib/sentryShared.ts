import * as Sentry from '@sentry/nextjs';
import { setMonitoringSink } from './monitoring';
import { readMonitoringEnv } from './monitoringEnv';
import {
  resolveEnvironment, resolveRelease, scrubEvent, scrubUrl, tracesSampleRate, type ScrubbableEvent,
} from './monitoringConfig';

/**
 * Společná inicializace Sentry pro prohlížeč, server i edge.
 *
 * Bez `NEXT_PUBLIC_SENTRY_DSN` nebo lokálně je SDK VYPNUTÉ – nic se
 * neposílá a nic se nezpomalí. Selhání inicializace aplikaci neshodí.
 */
export function initSentry(runtime: 'client' | 'server' | 'edge'): void {
  try {
    // Přímé odkazy na proměnné – jinak je Next.js do prohlížeče nevloží.
    const env = readMonitoringEnv();
    const environment = resolveEnvironment(env);
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

    Sentry.init({
      dsn,
      enabled: Boolean(dsn) && environment !== 'development',
      environment,
      release: resolveRelease(env, env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'),
      // Chyby vždy, trasy jen u části požadavků.
      sampleRate: 1,
      tracesSampleRate: tracesSampleRate(environment),
      // Žádné IP adresy, cookies ani těla požadavků.
      sendDefaultPii: false,
      // Session Replay se ZÁMĚRNĚ nezapíná – nahrával by obrazovku s tipy.
      integrations: [],
      beforeSend: (event) => scrubEvent(event as unknown as ScrubbableEvent) as unknown as typeof event,
      beforeSendTransaction: (event) => scrubEvent(event as unknown as ScrubbableEvent) as unknown as typeof event,
      beforeBreadcrumb: (crumb) => {
        const data = crumb.data as Record<string, unknown> | undefined;
        if (data && typeof data.url === 'string') data.url = scrubUrl(data.url);
        return crumb;
      },
      initialScope: { tags: { runtime } },
    });

    setMonitoringSink({
      captureException: (error, ctx) => { Sentry.captureException(error, ctx); },
      captureMessage: (message, level, ctx) => { Sentry.captureMessage(message, { level, ...ctx }); },
      addBreadcrumb: (crumb) => { Sentry.addBreadcrumb(crumb); },
    });
  } catch {
    // Monitoring nesmí nikdy zabránit načtení aplikace.
  }
}
