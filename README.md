<p align="center">
  <img src="public/firn.png" width="220" alt="firn-explorer" />
</p>

# firn-explorer

> Reference frontend for [firn](https://github.com/ava-labs/firn). Self-hosted block explorer for any Avalanche L1.

Next.js app. Point it at a running firn instance and you're done.

## Built to be forked

This is a **reference UI**, not a closed product. Fork it, rebrand it, ship it as your L1's official explorer:

- Swap `public/firn.png`, the colors in `app/globals.css` (OKLCH tokens), and the strings in `app/layout.tsx` for your branding.
- Add new pages under `app/` against firn's typed [OpenAPI client](./lib/api/) — `pnpm orval` regenerates from `openapi.json` whenever the firn API changes.
- Drop or rewrite any of the existing pages (`/blocks`, `/transactions`, `/address/[hash]`, `/tokens/[hash]`, `/genesis`, `/validators`) — none are load-bearing for the others.
- Wire your own decoded surfaces (e.g. a DEX-specific dashboard) by extending firn with a [custom decoder](https://github.com/ava-labs/firn/blob/main/docs/PLUGINS.md), then consuming the new endpoint here.

The explorer's job is to be a faithful renderer of firn's API. Everything cosmetic is yours to change.

## Run it

```bash
git clone https://github.com/ava-labs/firn-explorer
cd firn-explorer
pnpm install
cp .env.example .env.local
pnpm dev
# → http://localhost:3000
```

`.env.example` ships defaults that work out of the box against the shared dev firn box. The `NEXT_PUBLIC_FIRN_*` values are same-origin paths (`/api/firn/local`, `/api/firn/fuji`) that route through Next.js rewrites in `next.config.ts` to whichever box is hosting firn. Same setup applies to `pnpm dev` and prod, so dev and prod behave identically — and the browser only ever sees same-origin https, sidestepping mixed-content blocks.

To point the rewrites at a different box, set `FIRN_BOX_HOST` in the environment.

Want to run firn yourself instead? `go run github.com/ava-labs/firn/cmd/firn` brings one up on `:4000` against a synthetic in-memory store. Either set `NEXT_PUBLIC_FIRN_LOCAL=http://localhost:4000` directly (skipping the rewrites) or update `next.config.ts` to proxy at your local port.

## Build + deploy

```bash
pnpm build && pnpm start
```

Standard Next.js app — Vercel, Cloudflare, self-hosted, whatever. `NEXT_PUBLIC_FIRN_*` is baked at build time, so set it (and `FIRN_BOX_HOST` if you're overriding the proxy target) on the build environment.

## License

Apache-2.0.
