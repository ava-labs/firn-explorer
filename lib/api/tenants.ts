// Tenant directory: maps a `<slug>.firn.gg` subdomain to the firn
// backend for that managed L1. Fetched at request time by middleware.ts
// from the managed-testnet-nodes platform's `/explorer/tenants` endpoint
// and cached for ~30s in Edge-runtime module memory.
//
// Why fetched, not env-baked: managed L1s spin up and expire on a 3-day
// TTL, so the tenant list churns constantly. Baking it into Vercel env
// would mean a redeploy on every L1 provision/expire — not viable.
//
// Cache topology: each Edge isolate keeps its own cache. Cold starts
// pay one fetch (~150ms cross-region to the AWS box); warm hits are
// instant. Stale entries are served if the upstream is briefly
// unreachable so the apex never breaks on a network blip.

export interface TenantConfig {
  label: string;
  backend: string;
}

interface TenantsResponse {
  tenants: Record<string, { label: string; backend: string; blockchainId?: string }>;
}

const TENANTS_URL =
  process.env.FIRN_TENANTS_URL ?? "https://nodes-prod.18.182.4.86.sslip.io/explorer/tenants";

const TTL_MS = 30_000;
const STALE_TTL_MS = 5 * 60 * 1000; // serve stale cache up to 5 min on upstream failure

interface Cache {
  data: Record<string, TenantConfig>;
  expiresAt: number;
  // When `expiresAt` is in the past but `staleUntil` isn't, we serve
  // the stale data and try to refresh in the background. This bounds
  // user-visible failures to a brief window when the directory
  // upstream is hard-down at the same moment as a cache miss.
  staleUntil: number;
}

let cache: Cache | null = null;
let inflight: Promise<Cache | null> | null = null;

async function refresh(): Promise<Cache | null> {
  // De-dup concurrent refreshes within the same isolate so a burst of
  // requests at cache expiry triggers exactly one upstream fetch.
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(TENANTS_URL, {
        // Belt-and-suspenders: managed-nodes also sets Cache-Control:
        // max-age=30, but Edge fetch may not always honor it.
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        console.warn(`[tenants] upstream ${res.status}: ${TENANTS_URL}`);
        return cache; // hold onto whatever we had; caller decides freshness
      }
      const body = (await res.json()) as TenantsResponse;
      const data: Record<string, TenantConfig> = {};
      for (const [slug, entry] of Object.entries(body.tenants ?? {})) {
        if (!entry?.backend) continue;
        data[slug] = { label: entry.label || slug, backend: entry.backend.replace(/\/$/, "") };
      }
      const now = Date.now();
      cache = { data, expiresAt: now + TTL_MS, staleUntil: now + STALE_TTL_MS };
      return cache;
    } catch (err) {
      console.warn(`[tenants] refresh failed: ${err instanceof Error ? err.message : String(err)}`);
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function lookupTenant(slug: string): Promise<TenantConfig | null> {
  const now = Date.now();

  // Fresh cache: serve immediately.
  if (cache && cache.expiresAt > now) {
    return cache.data[slug] ?? null;
  }

  // Stale-but-tolerable: serve and kick a background refresh.
  if (cache && cache.staleUntil > now) {
    void refresh();
    return cache.data[slug] ?? null;
  }

  // No cache (or fully expired): block on a refresh.
  const updated = await refresh();
  return updated?.data[slug] ?? null;
}
