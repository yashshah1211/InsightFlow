import type { NextConfig } from 'next';
const traceOfficial = process.env.INSIGHTFLOW_DATA_MODE === 'official' || (!process.env.INSIGHTFLOW_DATA_MODE && !process.env.VERCEL);
const config: NextConfig = {
  poweredByHeader: false,
  // Vercel's Next.js adapter emits Functions; standalone remains the local/container path.
  output: process.env.VERCEL ? undefined : 'standalone',
  turbopack: { root: process.cwd() },
  outputFileTracingIncludes: traceOfficial ? { '/api/**': ['./data/processed/official.json'] } : {},
  outputFileTracingExcludes: { '/*': ['.env*', './data/raw/**/*', './artifacts/**/*', ...(!traceOfficial ? ['./data/processed/**/*'] : [])] },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
export default config;
