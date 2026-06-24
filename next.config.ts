import type { NextConfig } from "next";

// Rewrite targets for same-origin `/api/firn/*` paths.
//
// Default (no FIRN_BOX_HOST): local network proxies to a firn instance on
// :4000 — `firn serve -store=mem`, compose, or `firn up`. Testnet/mainnet
// rewrites are omitted unless the legacy remote box is opted in.
//
// Legacy remote box (DevRel): set FIRN_BOX_HOST to the box IP. sslip.io
// hostnames terminate TLS on :443 and reverse-proxy to firn on the VM.
// See firn docs/DEMO.md § Legacy remote demo box.
//
// Compose / Docker builds inject FIRN_API_URL or FIRN_LOCAL_DEST instead
// (see firn/docker/explorer-next.config.ts).
const strip = (u: string) => u.replace(/\/$/, "");

const localDest = strip(
  process.env.FIRN_LOCAL_DEST ?? process.env.FIRN_API_URL ?? "http://127.0.0.1:4000",
);

const boxHost = process.env.FIRN_BOX_HOST?.trim();

function boxRewrites() {
  if (!boxHost) return [];
  const dash = boxHost.replace(/\./g, "-");
  const testnet = process.env.FIRN_TESTNET_HOST ?? `echo.${dash}.sslip.io`;
  const mainnet = process.env.FIRN_MAINNET_HOST ?? `grotto.${dash}.sslip.io`;
  return [
    {
      source: "/api/firn/testnet/:path*",
      destination: `https://${testnet}/:path*`,
    },
    {
      source: "/api/firn/mainnet/:path*",
      destination: `https://${mainnet}/:path*`,
    },
  ];
}

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/firn/local/:path*",
        destination: `${localDest}/:path*`,
      },
      ...boxRewrites(),
    ];
  },
};

export default nextConfig;
