/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // Con Docker se genera una versión autónoma y liviana. En Vercel no hace falta.
  ...(process.env.DOCKER_BUILD ? { output: 'standalone' } : {}),
};
