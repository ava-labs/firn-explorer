// Thin fetch wrapper for the firn v1 API.

import type { APIError } from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_FIRN_URL ?? "http://localhost:4000";

const API_PREFIX = "/v1";

/**
 * GET /v1<path>. Throws on non-2xx with the API's structured error message
 * when available, falling back to the HTTP status text.
 */
export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${API_PREFIX}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as APIError;
      if (body?.error?.message) msg = `${body.error.code}: ${body.error.message}`;
    } catch {
      // body not JSON — keep status text
    }
    throw new Error(`GET ${path} → ${msg}`);
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

/** Derive ws://...  URL from API_BASE_URL for the WebSocket endpoint. */
export function streamUrl(): string {
  return API_BASE_URL.replace(/^http/, "ws") + "/v1/stream";
}
