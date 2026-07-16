/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static site — deployable to any static host (Azure Static Web Apps).
  // No server code: API routes and middleware are unsupported under 'export'.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};

module.exports = nextConfig;
