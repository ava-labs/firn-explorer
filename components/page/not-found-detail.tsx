"use client";

import Link from "next/link";

/**
 * Full-page "Not found / Couldn't load" layout used by detail pages
 * when their primary fetch errors. firn returns a 404-shaped error
 * with a `not_found` code; we surface a different copy for that case
 * vs. a generic transport error so users on `-store=mem` know why a
 * previously-cached id evaporated.
 *
 * Used by:
 *   - app/transactions/[hash]/page.tsx
 *   - app/blocks/[id]/page.tsx
 */
export function NotFoundDetail({
  /** Eyebrow + back-link target (e.g. "Transaction" / "Block"). */
  kind,
  /** Plural index path the back link points at (e.g. "/transactions"). */
  indexHref,
  /** "All transactions" / "All blocks" — back-link copy. */
  indexLabel,
  /** Short label for the action button — "See latest transactions →". */
  actionLabel,
  /** The id/hash the user attempted to load — rendered monospace. */
  identifier,
  /** Error returned by the query — used to detect not-found vs other failures. */
  error,
}: {
  kind: string;
  indexHref: string;
  indexLabel: string;
  actionLabel: string;
  identifier: string;
  error: Error;
}) {
  const notFound = /not[_ ]?found/i.test(error.message);
  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-12 max-w-[1080px] mx-auto">
      <Link
        href={indexHref}
        style={{
          fontSize: 12,
          color: "var(--ink-4)",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: 16,
        }}
      >
        ← {indexLabel}
      </Link>
      <div className="eyebrow mb-2.5">{kind}</div>
      <div className="h-display mb-2" style={{ fontSize: 32 }}>
        {notFound ? "Not found" : `Couldn't load ${kind.toLowerCase()}`}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 12.5,
          color: "var(--ink-3)",
          wordBreak: "break-all",
          marginBottom: 16,
        }}
      >
        {identifier}
      </div>
      {notFound ? (
        <div
          style={{
            fontSize: 13.5,
            color: "var(--ink-3)",
            maxWidth: 640,
            marginBottom: 20,
            lineHeight: 1.55,
          }}
        >
          firn doesn&apos;t have this {kind.toLowerCase()} in its index. If you&apos;re running{" "}
          <code className="mono" style={{ fontSize: 12 }}>
            -store=mem
          </code>
          , the index resets every time firn restarts — old cached entries in your browser may point
          at items that no longer exist. Refreshing the page should reconcile.
        </div>
      ) : (
        <div
          className="mono"
          style={{
            fontSize: 11.5,
            color: "var(--ink-4)",
            maxWidth: 640,
            marginBottom: 20,
            wordBreak: "break-all",
          }}
        >
          {error.message}
        </div>
      )}
      <Link href={indexHref} className="lat-btn">
        {actionLabel}
      </Link>
    </div>
  );
}
