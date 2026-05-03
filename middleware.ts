import { NextResponse, type NextRequest } from "next/server";
import { lookupTenant } from "@/lib/api/tenants";

// Tenant slugs are the lowercased first 8 chars of the L1's blockchainID
// (base58, with `0`, `l`, `o`, `I` already excluded by the cb58 alphabet).
// Hardcoding the alphabet + length here turns the regex itself into the
// reservation list:
//   • `explorer.firn.gg` → contains `l` and `o`, can't match → falls
//     through to apex behavior (the network switcher).
//   • `www.firn.gg`, `api.firn.gg`, etc. → wrong length, can't match.
//   • `*.vercel.app` preview URLs → don't match `firn.gg` at all.
//
// Anything that doesn't match this shape gets the apex experience —
// no separate blocklist needed.
const TENANT_HOST_RE = /^([123456789abcdefghijkmnpqrstuvwxyz]{8})\.firn\.gg$/i;

const TENANT_API_PREFIX = "/api/firn/tenant/";

export async function middleware(request: NextRequest) {
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
