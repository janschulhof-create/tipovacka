import type { NextConfig } from 'next';

const immutableYear = 'public, max-age=31536000, immutable';

const nextConfig: NextConfig = {
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
        source: '/team-sprite-v1.webp',
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

export default nextConfig;
