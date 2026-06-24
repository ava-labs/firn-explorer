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
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
# → http://localhost:3000
```

**Local-first defaults.** With no `FIRN_BOX_HOST`, `/api/firn/local` rewrites to
`http://127.0.0.1:4000`. Start firn beside the UI:

```bash
# terminal 1 — firn repo
go run ./cmd/firn serve -store=mem -addr=127.0.0.1:4000

# terminal 2 — this repo
pnpm dev
```

`NEXT_PUBLIC_FIRN_*` values are same-origin paths (`/api/firn/local`,
`/api/firn/testnet`) that route through Next.js rewrites in `next.config.ts`.
Testnet/mainnet rewrites to the legacy remote demo box require
`FIRN_BOX_HOST` — see [firn docs/DEMO.md](https://github.com/ava-labs/firn/blob/main/docs/DEMO.md).

Or use firn's compose stack (`docker compose up` in the firn repo) which builds
this app with compose-friendly rewrites.

## Build + deploy

```bash
pnpm build && pnpm start
```

Standard Next.js app — Vercel, Cloudflare, self-hosted, whatever. `NEXT_PUBLIC_FIRN_*` is baked at build time. Set `FIRN_BOX_HOST` on the build environment only when proxying testnet/mainnet to the legacy remote box.

## License

Apache-2.0.
