import type { paths } from "./types.gen";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_BLOCKSCOUT_API_URL ?? "http://127.0.0.1:4000";

const API_PREFIX = "/api/v2";

type SuccessResponse<P> = P extends {
  get: { responses: { 200: { content: { "application/json": infer T } } } };
}
  ? T
  : never;

export async function apiGet<P extends keyof paths>(
  path: P,
  init?: RequestInit,
): Promise<SuccessResponse<paths[P]>> {
  const url = `${API_BASE_URL}${API_PREFIX}${path as string}`;
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${path as string} → ${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
  }
  return res.json() as Promise<SuccessResponse<paths[P]>>;
}
