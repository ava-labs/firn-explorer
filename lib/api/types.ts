// firn v1 API types — split into per-domain modules under ./types/.
// This barrel preserves the historical `@/lib/api/types` import path
// so existing call sites don't need to change. New code may import
// directly from `@/lib/api/types/<domain>` for finer-grained deps.
export * from "./types/index";
