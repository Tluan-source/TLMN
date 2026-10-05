import type { NextConfig } from 'next';

const DATE = ':date(\\d{4}-\\d{2}-\\d{2})';
// Tab URLs (see src/app/routes.ts) all serve the single app page, which reads the path on the client.
// Keeping one page means switching tabs never remounts the app or drops its loaded state.
const APP_PATHS = ['/profile', '/memories', `/memories/${DATE}`, `/day/${DATE}`];

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: '/settings', destination: '/profile', permanent: false }];
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL || 'http://localhost:4000';
    return {
      beforeFiles: APP_PATHS.map((source) => ({ source, destination: '/' })),
      afterFiles: [{ source: '/api/:path*', destination: `${backend}/api/:path*` }],
      fallback: [],
    };
  },
};

export default nextConfig;
