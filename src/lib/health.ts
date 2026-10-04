import { resolveEnvironment, resolveRelease } from './monitoringConfig';

/**
 * Odpověď endpointu zdraví.
 *
 * ZÁMĚRNĚ bez databáze, poskytovatelů, AI i zámku synchronizace. Externí
 * monitor ho volá často — každý dotaz do databáze by se násobil a sám by
 * zátěž zvyšoval. Říká jen: „aplikace běží a odpovídá“.
 */
export function buildHealthPayload(env: Record<string, string | undefined>, now: Date) {
  return {
    ok: true as const,
    environment: resolveEnvironment(env),
    release: resolveRelease(env, env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'),
    time: now.toISOString(),
  };
}
