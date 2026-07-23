/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Los paquetes del monorepo se publican como TypeScript sin compilar.
  transpilePackages: [
    '@validasri/shared',
    '@validasri/validation',
    '@validasri/sri-client',
    '@validasri/database',
    '@validasri/export',
  ],
  // `soap`, `exceljs` y `node:sqlite` solo deben ejecutarse en el servidor.
  serverExternalPackages: ['soap', 'exceljs'],
  experimental: {
    serverActions: { bodySizeLimit: '8mb' },
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      },
    ];
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
