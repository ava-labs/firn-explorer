# Generated API client

Don't edit these files. They're regenerated from firn's openapi.json by
`pnpm codegen`.

## Source of truth

- Spec lives at `../../../openapi.json` (vendored copy of `firn/openapi.json`)
- Refresh the vendored copy with `pnpm sync-spec` (reads `FIRN_OPENAPI_PATH`,
  defaults to `../firn/openapi.json`)
- CI fails when the generated output drifts from a freshly-`sync-spec`-d copy

## Workflow after a backend change

1. Backend (firn): change a route, regenerate openapi.json.
2. Frontend: `pnpm sync-spec && pnpm codegen`
3. `pnpm typecheck` flags every breaking call site.

## Network switching

The mutator (`../generated-mutator.ts`) reads `getApiBase()` per call,
so swapping networks via `setApiBase()` (NetworkProvider) immediately
routes future fetches to the new firn.

The query-key builder (`../generated-query-key.ts`) prepends the active
base URL to every key — separate cache slots per network, no
cross-network pollution after a swap.

## Why orval

Picked over `openapi-typescript + @tanstack/react-query` because:

- Generates React Query hooks directly, mature plugin
- Custom mutator + queryKey hooks let us preserve the existing
  `getApiBase()` runtime switch
- Splitting types into per-schema files (`mode: "split"`) keeps PRs
  small when the spec changes

The openapi.json itself stays the cross-language source of truth — any
SDK targets in Phase 2 can re-use the same input file with a different
orval config.
