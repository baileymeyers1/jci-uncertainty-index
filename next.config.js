/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: []
    },
    serverComponentsExternalPackages: ["@resvg/resvg-js"]
  }
};

module.exports = nextConfig;
