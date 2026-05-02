import { FirnApiError, getApiBase } from "./client";

interface RFC9457Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: Array<{ message?: string; location?: string; value?: unknown }>;
  error?: { code?: string; message?: string };
}

function extractCode(body: RFC9457Problem | null): string {
  if (!body) return "";
  if (body.type) {
    const tail = body.type.split("/").pop();
    if (tail && tail !== "blank") return tail;
  }
  return body.error?.code ?? "";
}

interface FirnFetchOptions extends RequestInit {
  data?: unknown;
}

export const firnFetch = async <T>(url: string, options?: FirnFetchOptions): Promise<T> => {
  const base = getApiBase();
  const fullUrl = `${base}${url}`;
  const init: RequestInit = {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers ?? {}),
    },
  };
  if (options?.data !== undefined && init.body === undefined) {
    init.body = typeof options.data === "string" ? options.data : JSON.stringify(options.data);
    init.headers = { "Content-Type": "application/json", ...(init.headers as object) };
  }
  const res = await fetch(fullUrl, init);
  if (!res.ok) {
    let body: RFC9457Problem | null = null;
    let statusMsg = `${res.status} ${res.statusText}`;
    try {
      body = (await res.json()) as RFC9457Problem;
      const detail = body.detail ?? body.title ?? body.error?.message;
      if (detail) statusMsg = `${extractCode(body) || res.status}: ${detail}`;
    } catch {}
    throw new FirnApiError(
      `${(init.method ?? "GET").toUpperCase()} ${url} → ${statusMsg}`,
      res.status,
      extractCode(body),
    );
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return (await res.text()) as unknown as T;
  return (await res.json()) as T;
};

export default firnFetch;
