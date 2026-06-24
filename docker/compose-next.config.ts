import type { NextConfig } from "next";

// Compose-friendly rewrite config for the Phase 0 demo stack.
//
// Proxies same-origin /api/firn/* paths to the firn service on the
// Docker network. FIRN_API_URL is baked at image build time (default
// http://firn:4000). Used by docker/Dockerfile.compose — see firn
// docs/DEMO.md and docs/CROSS_REPO.md.
const FIRN_API = (process.env.FIRN_API_URL ?? "http://firn:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    const destination = `${FIRN_API}/:path*`;
    return [
      { source: "/api/firn/local/:path*", destination },
      { source: "/api/firn/testnet/:path*", destination },
      { source: "/api/firn/mainnet/:path*", destination },
    ];
  },
};

export default nextConfig;
