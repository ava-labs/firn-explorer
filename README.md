<p align="center">
  <img src="public/firn.png" width="220" alt="firn-explorer" />
</p>

# firn-explorer

> Reference frontend for [firn](https://github.com/ava-labs/firn). Self-hosted block explorer for any Avalanche L1.

Next.js app. Point it at a running firn instance and you're done.

## Run it

```bash
git clone https://github.com/ava-labs/firn-explorer
cd firn-explorer
pnpm install
pnpm dev
# → http://localhost:3000
```

Create `.env.local` to point at firn:

```bash
# Required. The local-dev firn instance (or whatever you want named "Local"
# in the topbar network switcher).
NEXT_PUBLIC_FIRN_LOCAL=http://localhost:4000

# Optional. Light up the corresponding option in the network switcher.
NEXT_PUBLIC_FIRN_TESTNET=https://your-firn-testnet.example.com
NEXT_PUBLIC_FIRN_MAINNET=https://your-firn-mainnet.example.com
```

Don't have a firn instance running? `go run github.com/ava-labs/firn/cmd/firn` brings one up against a synthetic in-memory store on `:4000`. Good enough for frontend dev.

## Build + deploy

```bash
pnpm build && pnpm start
```

Standard Next.js app — Vercel, Cloudflare, self-hosted, whatever. `NEXT_PUBLIC_FIRN_*` is baked at build time, set it on the build environment.

## License

Apache-2.0.
