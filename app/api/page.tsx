"use client";

/**
 * API reference rendered by Scalar from firn's openapi.json.
 *
 * Two source paths, in priority order:
 *   1. Live fetch from the active firn (`${apiBase}/v1/openapi.json`) so
 *      the docs reflect whatever's actually running. If firn evolves
 *      and this UI is stale, you still see the up-to-date spec.
 *   2. Bundled fallback (`/openapi.json` on this app's origin), only
 *      used when the live fetch fails (offline dev, firn not reachable).
 *
 * The hand-written playground + 245 lines of CATALOG decorations are
 * gone — they were drifting from the backend faster than they could
 * be maintained. Scalar reads the spec directly so adding a new
 * endpoint in firn surfaces here automatically after a `pnpm sync-spec`.
 */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getApiBase } from "@/lib/api/client";
import "@scalar/api-reference-react/style.css";

// Scalar's React component pulls in DOM-only deps (highlight.js,
// markdown renderers); load it client-only so SSR doesn't choke.
const ApiReferenceReact = dynamic(
  () => import("@scalar/api-reference-react").then((m) => m.ApiReferenceReact),
  { ssr: false },
);

export default function APIReferencePage() {
  const [specUrl, setSpecUrl] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = getApiBase();
    const live = `${apiBase}/v1/openapi.json`;
    // HEAD-probe the live spec. If firn's behind a network we can't
    // reach (or this build hasn't pointed at a real firn yet), fall
    // back to the vendored copy at `/openapi.json`.
    let cancelled = false;
    fetch(live, { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;
        setSpecUrl(res.ok ? live : "/openapi.json");
      })
      .catch(() => {
        if (cancelled) return;
        setSpecUrl("/openapi.json");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!specUrl) return null;

  return (
    <div style={{ minHeight: "calc(100vh - 60px)" }}>
      <ApiReferenceReact
        configuration={{
          url: specUrl,
          theme: "default",
          hideDownloadButton: false,
        }}
      />
    </div>
  );
}
