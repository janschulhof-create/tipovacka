/**
 * Proměnné prostředí pro monitoring — VÝHRADNĚ PŘÍMÉ ODKAZY.
 *
 * ── PROČ TAKHLE ─────────────────────────────────────────────────────────────
 * Next.js vkládá `NEXT_PUBLIC_*` do kódu pro prohlížeč jen tam, kde stojí
 * DOSLOVA `process.env.NEXT_PUBLIC_X`. Přístup přes alias
 * (`const env = process.env; env.NEXT_PUBLIC_X`), destrukturalizaci nebo
 * `process.env[klic]` se v prohlížeči NENAHRADÍ a vrátí `undefined`.
 *
 * Přesně to v0.1.82 vypnulo Sentry v prohlížeči: DSN vyšlo `undefined`,
 * prostředí `development`, a SDK se tiše nezapnulo. Server přitom fungoval,
 * protože tam `process.env` existuje za běhu.
 *
 * ⚠️ Každou proměnnou piš celou a přímo. Test `sentry-client-env` to hlídá.
 */
export function readMonitoringEnv(): Record<string, string | undefined> {
  return {
    // Prohlížeč i server – Next.js vloží při buildu.
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    // Jen server/edge (v prohlížeči `undefined`, což je v pořádku – mají
    // nižší přednost než veřejné varianty výše).
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  };
}
