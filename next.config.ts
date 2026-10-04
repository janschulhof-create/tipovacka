import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import pkg from './package.json';

const immutableYear = 'public, max-age=31536000, immutable';

const nextConfig: NextConfig = {
  // Verze pro monitoring (release bez SHA commitu). Do prohlížeče jde jen
  // tento řetězec, ne celý package.json.
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  images: {
    formats: ['image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'r2.thesportsdb.com',
        pathname: '/images/media/team/badge/**',
      },
      {
        protocol: 'https',
        hostname: 'www.thesportsdb.com',
        pathname: '/images/media/team/badge/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/team-sprite-v2.webp',
        headers: [{ key: 'Cache-Control', value: immutableYear }],
      },
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: immutableYear }],
      },
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

/**
 * Sentry obaluje konfiguraci, aby mohl napojit chyby z prohlížeče, serveru
 * i edge. Bez `SENTRY_AUTH_TOKEN` se zdrojové mapy nenahrávají, build ale
 * projde – monitoring je doplněk, ne podmínka nasazení.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Zdrojové mapy se nahrají do Sentry a z veřejného buildu se smažou.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Menší bundle: bez ladicích výpisů a bez kódu Session Replay.
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
  disableLogger: true,
  // Žádný tunel přes vlastní funkci – zbytečné invokace a CPU.
  telemetry: false,
});
