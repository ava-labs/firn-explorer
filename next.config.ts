import type { NextConfig } from "next";

// Box hosting the firn instances. Pinned to a stable Elastic IP — only
// changes if the EIP is detached. Override via FIRN_BOX_HOST in the
// deployment environment when moving boxes.
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
//
// Path naming matches the env-var contract documented in
// lib/api/network.tsx: the public network IDs are `local`, `testnet`,
// `mainnet`. The frontend's API base for each comes from
// `NEXT_PUBLIC_FIRN_{LOCAL,TESTNET,MAINNET}` which on Vercel point at
// `/api/firn/{local,testnet,mainnet}` and get rewritten here.
const FIRN_BOX = process.env.FIRN_BOX_HOST ?? "44.195.57.61";

// Mainnet is fronted by Caddy + Let's Encrypt at a sslip.io hostname
// derived from the box IP (sslip.io maps `a-b-c-d.sslip.io` → `a.b.c.d`
// at the DNS layer). Keeps the destination over HTTPS even though the
// rewrite is server-to-server, so the certificate path stays clean.
const FIRN_BOX_DASH = FIRN_BOX.replace(/\./g, "-");
const MAINNET_HOST = process.env.FIRN_MAINNET_HOST ?? `grotto.${FIRN_BOX_DASH}.sslip.io`;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/firn/local/:path*",
        destination: `http://${FIRN_BOX}:4001/:path*`,
      },
      {
        source: "/api/firn/testnet/:path*",
        destination: `http://${FIRN_BOX}:4002/:path*`,
      },
      {
        source: "/api/firn/mainnet/:path*",
        destination: `https://${MAINNET_HOST}/:path*`,
      },
    ];
  },
};

export default nextConfig;
