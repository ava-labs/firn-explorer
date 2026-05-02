// Thin fetch wrapper for the firn v1 API.

import type { APIError } from "./types";

/**
 * Default base URL — falls back through, in priority order:
 *   1. NEXT_PUBLIC_FIRN_LOCAL    — explicit local override
 *   2. NEXT_PUBLIC_FIRN_URL      — legacy single-URL var (back-compat)
 *   3. http://localhost:4000     — dev default
 *
 * Multi-network deployments are driven by the runtime base set via
 * `setApiBase()` (called by the NetworkProvider when the user picks a
 * different network in the topbar). Per-network env vars are read at the
 * provider layer, not here, so this module stays free of React deps.
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
 * Typed error thrown by apiGet / pchainCall on non-2xx responses. Carries
 * firn's structured error code (e.g. "bootstrapping", "not_found") so
 * callers can branch on the cause without grepping the message string.
 * `status` is the HTTP status; `code` is empty when the upstream didn't
 * return a JSON error envelope.
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
 * GET /v1<path>. Throws FirnApiError on non-2xx with the API's structured
 * error code populated when available.
 */
export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBase()}${API_PREFIX}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    let code = "";
    try {
      const body = (await res.json()) as APIError;
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) msg = `${body.error.code}: ${body.error.message}`;
    } catch {
      // body not JSON — keep status text
    }
    throw new FirnApiError(`GET ${path} → ${msg}`, res.status, code);
  }
  return res.json() as Promise<T>;
}

/** Build a URL with query parameters, dropping undefined/null values. */
export function withQuery(
  path: string,
  params: Record<string, string | number | undefined | null>,
): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    u.set(k, String(v));
  }
  const qs = u.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * JSON-RPC call against firn's P-Chain passthrough (`POST /v1/rpc/p`).
 * `method` should be a P-Chain `platform.*` method per
 * https://build.avax.network/docs/rpcs/p-chain. Returns the raw `result`
 * field; throws on `error` or transport failure.
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
      const errBody = (await res.json()) as APIError;
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
