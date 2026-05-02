"use client";

/**
 * Hook + merge: pull the canonical route inventory from firn's
 * /v1/_meta/routes, then decorate each entry with hand-crafted
 * examples / pathParams / queryParams from the local CATALOG when a
 * matching path+method exists.
 *
 * Adding a route in firn surfaces it on the API page automatically
 * (with the basic backend description). Removing a route makes it
 * disappear. CATALOG remains the source for rich playground inputs
 * — empty fields just degrade to "no body / no params" UI.
 */

import { useQuery } from "@tanstack/react-query";
import { CATALOG, type Endpoint, type Group, type Param } from "./catalog";
import { getApiBase } from "@/lib/api/client";

interface FirnRoute {
  method: string;
  path: string;
  group: string;
  description: string;
  queryParams?: Record<string, string>;
}

interface RoutesResponse {
  routes: FirnRoute[];
}

/**
 * Stable identifier for a route — used for sidebar selection persistence
 * and for matching firn-fetched routes against CATALOG entries.
 */
export function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

/**
 * Builds a `Map<routeKey, Endpoint>` from the bundled CATALOG so we can
 * O(1)-decorate each fetched route with its rich playground inputs.
 */
function buildCatalogIndex(): Map<string, Endpoint> {
  const map = new Map<string, Endpoint>();
  for (const group of CATALOG) {
    for (const endpoint of group.endpoints) {
      map.set(routeKey(endpoint.method, endpoint.path), endpoint);
    }
  }
  return map;
}

/**
 * Convert firn's `queryParams: Record<string, string>` into the
 * playground's `Param[]` shape. Backend doesn't carry types, so
 * everything lands as `string` — that's fine for input rendering.
 */
function fromBackendQueryParams(qp?: Record<string, string>): Param[] | undefined {
  if (!qp) return undefined;
  const entries = Object.entries(qp);
  if (entries.length === 0) return undefined;
  return entries.map(([name, description]) => ({
    name,
    type: "string",
    description,
  }));
}

/**
 * The merged catalog as Group[]. Same shape the existing API page
 * already renders, just rebuilt from live data.
 */
export interface MergedCatalog {
  groups: Group[];
  /** Source-of-truth label for the count card on the page. */
  routeCount: number;
  /** Routes present in CATALOG but not on firn — surfaces stale local
   *  entries that should be removed. */
  stale: Endpoint[];
}

function mergeRoutes(routes: FirnRoute[]): MergedCatalog {
  const localIndex = buildCatalogIndex();
  const seen = new Set<string>();

  // Group fetched routes by their `group` label, preserving the order
  // firn returned them in (which matches the source-of-truth ordering
  // in routes_meta.go::allRoutes).
  const groupOrder: string[] = [];
  const grouped = new Map<string, Endpoint[]>();

  for (const r of routes) {
    const key = routeKey(r.method, r.path);
    seen.add(key);
    const local = localIndex.get(key);

    // Build the merged Endpoint. `local` provides rich inputs; fall
    // back to firn's basic description when we have no local entry.
    const endpoint: Endpoint = {
      id: local?.id ?? slugifyRouteKey(key),
      method: r.method as Endpoint["method"],
      path: r.path,
      shortPath: local?.shortPath,
      title: local?.title ?? r.description.split(".")[0] ?? r.path,
      description: local?.description ?? r.description,
      pathParams: local?.pathParams,
      queryParams: local?.queryParams ?? fromBackendQueryParams(r.queryParams),
      exampleBody: local?.exampleBody,
    };

    if (!grouped.has(r.group)) {
      groupOrder.push(r.group);
      grouped.set(r.group, []);
    }
    grouped.get(r.group)!.push(endpoint);
  }

  const groups: Group[] = groupOrder.map((label) => ({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    endpoints: grouped.get(label) ?? [],
  }));

  // Stale = local CATALOG entry whose path+method wasn't in the fetched
  // set. The drift-CI on firn-side already prevents this for backend
  // additions; this catches frontend-side stale entries when firn
  // removes a route.
  const stale: Endpoint[] = [];
  for (const [key, endpoint] of localIndex) {
    if (!seen.has(key)) stale.push(endpoint);
  }

  return { groups, routeCount: routes.length, stale };
}

function slugifyRouteKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `useFirnRoutes` — fetches the route inventory from the active firn
 * instance and returns the merged catalog. Caches per-network so a
 * network switch picks up that backend's specific surface (which may
 * differ if e.g. one box has --signature-aggregator enabled and the
 * other doesn't).
 */
export function useFirnRoutes() {
  // Key on the resolved API base so a network switch (which mutates
  // the apiBase module-global) re-fetches against the new backend.
  const apiBase = getApiBase();
  return useQuery({
    queryKey: ["api-routes", apiBase] as const,
    queryFn: async (): Promise<MergedCatalog> => {
      const res = await fetch(`${getApiBase()}/v1/_meta/routes`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`/_meta/routes ${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as RoutesResponse;
      return mergeRoutes(body.routes ?? []);
    },
    // The route surface only changes on firn deploy; treat it as
    // stable for the session. A page refresh re-fetches.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
