/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@resvg/resvg-js"],
  experimental: {
    serverActions: {
      allowedOrigins: []
    }
  }
};

module.exports = nextConfig;
