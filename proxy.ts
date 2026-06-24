import { NextResponse, type NextRequest } from "next/server";
import { lookupTenant } from "@/lib/api/tenants";

// Tenant slugs are the lowercased first 8 chars of the L1's blockchainID.
// Base58 (cb58) excludes `0`/`I`/`l`/`o` from its raw alphabet, but
// only at specific case positions: uppercase has `L`/`O`, lowercase
// has `i`/`o`. After lowercasing, you can produce ANY of `a-z` (plus
// digits 1-9) — e.g., blockchainID `QRLFr3FU…` → slug `qrlfr3fu`,
// where the `l` came from uppercase `L`. So the alphabet here must
// be inclusive of all a-z plus 1-9 (no `0`).
//
// Reserved subdomains stay safe via length: `www`, `api`, `app`, etc.
// can't match the {8} length. `explorer.firn.gg` would match by shape
// but lookupTenant() returns null for it, so the layout falls through
// to apex rendering anyway.
const TENANT_HOST_RE = /^([1-9a-z]{8})\.firn\.gg$/i;

const TENANT_API_PREFIX = "/api/firn/tenant/";

export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0]; // strip :port for dev
  const m = host.match(TENANT_HOST_RE);
  const slug = m ? m[1].toLowerCase() : null;

  // /api/firn/tenant/* → proxy to the backend for this host's tenant.
  if (request.nextUrl.pathname.startsWith(TENANT_API_PREFIX)) {
    if (!slug) {
      return NextResponse.json(
        { error: "tenant routing requires an 8-char base58 slug at <slug>.firn.gg" },
        { status: 400 },
      );
    }
    const tenant = await lookupTenant(slug);
    if (!tenant) {
      return NextResponse.json(
        { error: `no tenant configured for slug "${slug}"` },
        { status: 404 },
      );
    }
    const tail = request.nextUrl.pathname.slice(TENANT_API_PREFIX.length);
    const target = `${tenant.backend}/${tail}${request.nextUrl.search}`;
    return NextResponse.rewrite(new URL(target));
  }

  // Page request — tag headers so the layout (server component) can pick
  // up the tenant identity and pass it down to the NetworkProvider. This
  // is what makes the SSR'd HTML render in tenant mode (no flicker).
  if (slug) {
    const tenant = await lookupTenant(slug);
    const headers = new Headers(request.headers);
    headers.set("x-firn-tenant-slug", slug);
    if (tenant) {
      headers.set("x-firn-tenant-label", tenant.label);
      // Frontend never reads the backend URL directly — it only ever
      // talks to /api/firn/tenant/* on its own origin. We still expose
      // a hint header for debug/visibility.
      headers.set("x-firn-tenant-resolved", "1");
    }
    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals + static assets so the per-request cost is just
  // the actual page + tenant API surface.
  matcher: ["/((?!_next/|favicon|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
