const prod = process.env.NODE_ENV === 'production';
// Cabeceras de seguridad para todas las páginas (menos /api/medios, que ya trae las suyas).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (prod ? '' : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self'" + (prod ? '' : ' ws: http:'),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'imapflow', 'mailparser', 'nodemailer', 'sharp'],
  // Con Docker se genera una versión autónoma y liviana. En Vercel no hace falta.
  ...(process.env.DOCKER_BUILD ? { output: 'standalone' } : {}),
  async headers() {
    return [
      {
        source: '/((?!api/medios|api/archivos|api/webhooks/web).*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          ...(prod ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
        ],
      },
    ];
  },
};
