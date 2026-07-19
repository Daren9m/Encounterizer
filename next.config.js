/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static site — deployable to any static host (Azure Static Web Apps).
  // No server code: API routes and middleware are unsupported under 'export'.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // Pin the workspace root to THIS checkout. Without it, Turbopack sees the
  // primary repo's lockfile from inside .claude/worktrees/* checkouts and
  // resolves the client bundle from the wrong tree (SSR right, page wrong).
  turbopack: { root: __dirname },
};

module.exports = nextConfig;
