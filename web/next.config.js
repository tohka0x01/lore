/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS || '').split(',').filter(Boolean),
  transpilePackages: ['@lobehub/ui'],
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
