// Thin client glue for firn — JSON-RPC POST + apiBase state.
//
// The bulk of the typed REST surface flows through orval-generated
// hooks (lib/api/generated/firn.ts) that share the apiBase + error
// shape defined here via the mutator (lib/api/generated-mutator.ts).
//
// What stays here:
//   * `getApiBase()` / `setApiBase()` — module-global the
//     NetworkProvider mutates on network swap. Both this module and
//     the generated mutator read from it.
//   * `FirnApiError` — error class the mutator throws on RFC 9457
//     responses; some pages branch on `.code === "bootstrapping"`.
//   * `pchainCall()` — JSON-RPC helper for /v1/rpc/p, used directly
//     where a typed REST hook isn't available (`platform.getL1Validator`).
//     The opaque RPC body is unspec'd in openapi.json so a generated
//     client wouldn't help us here.

interface APIErrorEnvelope {
  error?: { code?: string; message?: string };
  detail?: string;
  type?: string;
}

/**
 * Default base URL — falls back through, in priority order:
 *   1. NEXT_PUBLIC_FIRN_LOCAL    — explicit local override
 *   2. NEXT_PUBLIC_FIRN_URL      — legacy single-URL var (back-compat)
 *   3. http://localhost:4000     — dev default
 */
export const DEFAULT_API_BASE_URL =
  process.env.NEXT_PUBLIC_FIRN_LOCAL ?? process.env.NEXT_PUBLIC_FIRN_URL ?? "http://localhost:4000";

let currentApiBase = DEFAULT_API_BASE_URL;

/** Mutate the active firn base URL. Used by NetworkProvider on switch. */
export function setApiBase(url: string): void {
  currentApiBase = url;
}

/** Read the active firn base URL. Always call through this — never cache it. */
export function getApiBase(): string {
  return currentApiBase;
}

const API_PREFIX = "/v1";

/**
 * Typed error thrown by the generated mutator + pchainCall on non-2xx.
 * Carries firn's structured error code (e.g. "bootstrapping") so callers
 * can branch on the cause without grepping the message string.
 */
export class FirnApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "FirnApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * JSON-RPC call against firn's P-Chain passthrough (`POST /v1/rpc/p`).
 * The endpoint exists in openapi.json with an opaque body schema, so
 * orval generated a `useMutation` hook for it — but every existing call
 * site is a `useQuery` (we want it cached). Rather than reinvent caching
 * on top of a mutation, we keep this thin POST helper.
 */
export async function pchainCall<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  init?: RequestInit,
): Promise<T> {
  const url = `${getApiBase()}${API_PREFIX}/rpc/p`;
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const res = await fetch(url, {
    ...init,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const errBody = (await res.json()) as APIErrorEnvelope;
      if (errBody?.error?.message) msg = `${errBody.error.code}: ${errBody.error.message}`;
    } catch {
      /* keep status text */
    }
    throw new Error(`POST /rpc/p ${method} → ${msg}`);
  }
  const json = (await res.json()) as { result?: T; error?: { code: number; message: string } };
  if (json.error) {
    throw new Error(`platform.${method} → ${json.error.code}: ${json.error.message}`);
  }
  return json.result as T;
}
