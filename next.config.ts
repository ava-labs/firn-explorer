import type { NextConfig } from "next";

// Box hosting the firn instances. Public AWS IP changes when the EC2
// stops/starts; if you upgrade the box or detach it, update here (or
// override with FIRN_BOX_HOST in the deployment environment).
//
// Why we proxy via rewrites instead of pointing the frontend straight
// at the IP:
//   1. Vercel hosts at https://; browsers block fetch from https→http
//      (mixed-content). Rewrites are server-side proxies, so the
//      browser only sees same-origin https; Vercel's edge does the
//      http hop server-to-server.
//   2. Same setup also works locally with `pnpm dev` (Next dev server
//      applies the same rewrites), so dev and prod behave identically.
//   3. SSE / long-lived streams work — rewrites are network-layer
//      proxies, not serverless function invocations, so no timeout.
const FIRN_BOX = process.env.FIRN_BOX_HOST ?? "100.31.54.139";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/firn/local/:path*",
        destination: `http://${FIRN_BOX}:4001/:path*`,
      },
      {
        source: "/api/firn/fuji/:path*",
        destination: `http://${FIRN_BOX}:4002/:path*`,
      },
    ];
  },
};

export default nextConfig;
