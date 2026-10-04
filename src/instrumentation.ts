import * as Sentry from '@sentry/nextjs';

/**
 * Next.js instrumentace – načte Sentry pro správné prostředí.
 *
 * Bez DSN je SDK vypnuté (viz `sentryShared.ts`), takže lokálně ani v
 * testech nic neodesílá.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
}

/** Chyby Server Components, route handlerů a middleware. */
export const onRequestError = Sentry.captureRequestError;
