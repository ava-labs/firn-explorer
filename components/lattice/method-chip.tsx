"use client";

import { Chip } from "./chip";
import { useChain, useMethodSignature } from "@/lib/api/queries";

/**
 * Renders a method label for a transaction.
 *
 * Fast path: when `firnName` is set, the backend already resolved the
 * selector (via internal/methodresolver/, which consults the static
 * registry + a chdb-cached openchain.xyz lookup). We render
 * synchronously with no useQuery / Sourcify / external HTTP — table
 * rows paint with the resolved name on first render.
 *
 * Slow path: only when firn doesn't know the selector AND the contract
 * is on Sourcify do we fall through to the Sourcify ABI matcher, then
 * to direct browser openchain/4byte fetches. That's a rare case.
 */
export function MethodChip({
  selector,
  to,
  firnName,
}: {
  selector: string | undefined;
  to: string | null | undefined;
  firnName?: string | null;
}) {
  if (!selector) {
    return <span style={{ color: "var(--ink-4)" }}>—</span>;
  }

  // Fast path — render the firn-resolved name immediately. The chip
  // never sits in a loading state for the 95% of selectors firn knows.
  if (firnName) {
    return (
      <span title={`${firnName} · via firn (selector ${selector})`}>
        <Chip tone="steel">{firnName}</Chip>
      </span>
    );
  }

  return <UnresolvedMethodChip selector={selector} to={to} />;
}

/**
 * Fallback resolver for selectors firn didn't know. Pulled out so the
 * fast path doesn't pay React Query's overhead on every row — only
 * unresolved chips mount this hook.
 */
function UnresolvedMethodChip({
  selector,
  to,
}: {
  selector: string;
  to: string | null | undefined;
}) {
  const { data: chain } = useChain();
  const { data, isPending } = useMethodSignature({
    selector,
    contractAddress: to,
    chainId: chain?.chainId,
    firnName: null,
  });

  if (data) {
    return (
      <span title={`${data.signature} · via ${data.source}`}>
        <Chip tone="steel">{data.name}</Chip>
      </span>
    );
  }
  return (
    <span
      className="mono"
      title={isPending ? "Decoding selector…" : "Unknown selector"}
      style={{ fontSize: 11.5, color: "var(--ink-4)" }}
    >
      {selector}
    </span>
  );
}
