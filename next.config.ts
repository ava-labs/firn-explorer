import type { NextConfig } from "next";

// Box hosting the firn instances. Pinned to a stable Elastic IP — only
// changes if the EIP is detached. Override via FIRN_BOX_HOST in the
// deployment environment when moving boxes.
//
// Why we proxy via rewrites instead of pointing the frontend straight
// at the box:
//   1. Vercel hosts at https://; browsers block fetch from https→http
//      (mixed-content). Rewrites are server-side proxies, so the
//      browser only sees same-origin https; Vercel's edge does the
//      hop.
//   2. Same setup also works locally with `pnpm dev` (Next dev server
//      applies the same rewrites), so dev and prod behave identically.
//   3. SSE / long-lived streams work — rewrites are network-layer
//      proxies, not serverless function invocations, so no timeout.
//
// Why all three rewrites target HTTPS sslip.io hostnames (not raw
// IP+port): Vercel's edge can't reach plain HTTP on non-standard ports
// — the connection hangs and returns the request as 504/timeout.
// Caddy on the box terminates TLS for all three subdomains
// (`local|echo|grotto.<dashed-ip>.sslip.io`) on :443 and reverse-
// proxies to the firn process on its localhost port. From Vercel's
// perspective everything is plain HTTPS:443.
//
// Path naming matches the env-var contract documented in
// lib/api/network.tsx: the public network IDs are `local`, `testnet`,
// `mainnet`. The frontend's API base for each comes from
// `NEXT_PUBLIC_FIRN_{LOCAL,TESTNET,MAINNET}` which on Vercel point at
// `/api/firn/{local,testnet,mainnet}` and get rewritten here.
const FIRN_BOX = process.env.FIRN_BOX_HOST ?? "44.195.57.61";
const FIRN_BOX_DASH = FIRN_BOX.replace(/\./g, "-");

const LOCAL_HOST = process.env.FIRN_LOCAL_HOST ?? `local.${FIRN_BOX_DASH}.sslip.io`;
const TESTNET_HOST = process.env.FIRN_TESTNET_HOST ?? `echo.${FIRN_BOX_DASH}.sslip.io`;
const MAINNET_HOST = process.env.FIRN_MAINNET_HOST ?? `grotto.${FIRN_BOX_DASH}.sslip.io`;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/firn/local/:path*",
        destination: `https://${LOCAL_HOST}/:path*`,
      },
      {
        source: "/api/firn/testnet/:path*",
        destination: `https://${TESTNET_HOST}/:path*`,
      },
      {
        source: "/api/firn/mainnet/:path*",
        destination: `https://${MAINNET_HOST}/:path*`,
      },
    ];
  },
};

export default nextConfig;
