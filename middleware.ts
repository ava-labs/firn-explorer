import { NextResponse, type NextRequest } from "next/server";
import { lookupTenant } from "@/lib/api/tenants";

// Subdomains that are NOT tenants: apex `firn.gg`, `www.firn.gg`, and the
// per-deployment `*.vercel.app` URL Vercel mints for previews.
const RESERVED = new Set(["", "www"]);

const TENANT_HOST_RE = /^([^.]+)\.firn\.gg$/i;

const TENANT_API_PREFIX = "/api/firn/tenant/";

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0]; // strip :port for dev
  const m = host.match(TENANT_HOST_RE);
  const slug = m && !RESERVED.has(m[1].toLowerCase()) ? m[1].toLowerCase() : null;

  // /api/firn/tenant/* → proxy to the backend for this host's tenant.
  if (request.nextUrl.pathname.startsWith(TENANT_API_PREFIX)) {
    if (!slug) {
      return NextResponse.json(
        { error: "tenant routing requires a <slug>.firn.gg host" },
        { status: 400 },
      );
    }
    const tenant = lookupTenant(slug);
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
    const tenant = lookupTenant(slug);
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
