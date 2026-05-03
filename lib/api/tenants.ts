// Tenant directory: maps a `<slug>.firn.gg` subdomain to the firn backend
// for that managed L1. Read at request time by middleware.ts on the Edge
// runtime (which means env vars resolve dynamically — set FIRN_TENANTS in
// the deploy environment, no rebuild needed).
//
// Shape:
//   FIRN_TENANTS='{"cool-l1":{"label":"Cool L1","backend":"https://.../ext/bc/<id>/firn"}}'
//
// The backend URL must be reachable by Vercel's edge — typically the
// existing managed-nodes proxy (`<host>.sslip.io/ext/bc/<chainId>/firn`).
// Trailing slash on the backend is optional; we strip it during rewrite.

export interface TenantConfig {
  label: string;
  backend: string;
}

const RAW = process.env.FIRN_TENANTS ?? "{}";

let parsed: Record<string, TenantConfig> = {};
try {
  parsed = JSON.parse(RAW) as Record<string, TenantConfig>;
} catch {
  // Bad JSON: log once and fall through to empty map. Production deploys
  // should fail loud here, but middleware can't crash the request.
  console.warn("[tenants] FIRN_TENANTS is not valid JSON — no tenants loaded");
}

const TENANTS = parsed;

export function lookupTenant(slug: string): TenantConfig | null {
  const entry = TENANTS[slug];
  if (!entry?.backend) return null;
  return { label: entry.label || slug, backend: entry.backend.replace(/\/$/, "") };
}
