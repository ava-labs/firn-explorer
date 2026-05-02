"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiBase } from "@/lib/api/client";
import { useChain } from "@/lib/api/queries";
import { CATALOG, type Endpoint, type Param } from "./catalog";

const STORAGE_KEY = "explorer:api-playground:endpoint";

export default function APIPlaygroundPage() {
  const { data: chain } = useChain();
  const [selectedId, setSelectedId] = useState<string>(CATALOG[0].endpoints[0].id);

  // Restore last-picked endpoint across reloads.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && CATALOG.some((g) => g.endpoints.some((e) => e.id === saved))) {
      setSelectedId(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, selectedId);
    }
  }, [selectedId]);

  const endpoint = useMemo(
    () =>
      CATALOG.flatMap((g) => g.endpoints).find((e) => e.id === selectedId) ??
      CATALOG[0].endpoints[0],
    [selectedId],
  );

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "260px 1fr",
        gap: 0,
        minHeight: "calc(100vh - 60px)",
      }}
    >
      <Sidebar selectedId={selectedId} onSelect={setSelectedId} />
      <Main endpoint={endpoint} chainBase={getApiBase()} chainHelpers={chain} />
    </div>
  );
}

function Sidebar({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <aside
      style={{
        borderRight: "1px solid var(--line)",
        padding: "28px 0 28px 28px",
        position: "sticky",
        top: 60,
        alignSelf: "start",
        maxHeight: "calc(100vh - 60px)",
        overflowY: "auto",
      }}
    >
      <div className="eyebrow mb-3">◆ API playground</div>
      <div className="h-display mb-5" style={{ fontSize: 24 }}>
        firn v1
      </div>
      {CATALOG.map((group) => (
        <div key={group.id} style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10, color: "var(--ink-4)" }}>
            {group.label}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {group.endpoints.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onSelect(e.id)}
                style={{
                  textAlign: "left",
                  padding: "6px 10px 6px 8px",
                  borderRadius: 6,
                  background: selectedId === e.id ? "var(--bg-sunken)" : "transparent",
                  border: 0,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: selectedId === e.id ? "var(--ink)" : "var(--ink-3)",
                }}
              >
                <MethodBadge method={e.method} compact />
                <span
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {e.shortPath ?? e.path}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </aside>
  );
}

type RunState = {
  status: "idle" | "loading" | "ok" | "error";
  httpStatus?: number;
  body?: string;
  durationMs?: number;
  resolvedUrl?: string;
};

function Main({
  endpoint,
  chainBase,
  chainHelpers,
}: {
  endpoint: Endpoint;
  chainBase: string;
  chainHelpers: ReturnType<typeof useChain>["data"];
}) {
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState<string>(endpoint.exampleBody ?? "");
  const [run, setRun] = useState<RunState>({ status: "idle" });

  // Reset inputs whenever the user picks a different endpoint. We also seed
  // sensible defaults so the user can hit "Send" immediately on most rows
  // without typing — addresses come from the chain's first known token /
  // the burn address; numeric ids fall back to "1".
  useEffect(() => {
    const nextPath: Record<string, string> = {};
    for (const p of endpoint.pathParams ?? []) {
      nextPath[p.name] = p.example ?? "";
    }
    setPathValues(nextPath);

    const nextQuery: Record<string, string> = {};
    for (const p of endpoint.queryParams ?? []) {
      nextQuery[p.name] = p.example ?? "";
    }
    setQueryValues(nextQuery);

    setBody(endpoint.exampleBody ?? "");
    setRun({ status: "idle" });
  }, [endpoint.id]);

  const resolvedPath = useMemo(() => {
    let p = endpoint.path;
    for (const param of endpoint.pathParams ?? []) {
      const v = pathValues[param.name] ?? "";
      p = p.replace(`{${param.name}}`, v ? encodeURIComponent(v) : `{${param.name}}`);
    }
    return p;
  }, [endpoint, pathValues]);

  const queryString = useMemo(() => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(queryValues)) {
      if (v.trim() !== "") u.set(k, v);
    }
    const s = u.toString();
    return s ? `?${s}` : "";
  }, [queryValues]);

  const fullUrl = `${chainBase}${resolvedPath}${queryString}`;

  async function send() {
    setRun({ status: "loading" });
    const start = performance.now();
    try {
      const init: RequestInit = {
        method: endpoint.method,
        headers: { Accept: "application/json" },
      };
      if (endpoint.method === "POST") {
        init.headers = { ...init.headers, "Content-Type": "application/json" };
        init.body = body;
      }
      const res = await fetch(fullUrl, init);
      const text = await res.text();
      const duration = performance.now() - start;
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // not JSON — show raw
      }
      setRun({
        status: res.ok ? "ok" : "error",
        httpStatus: res.status,
        body: pretty,
        durationMs: duration,
        resolvedUrl: fullUrl,
      });
    } catch (err) {
      setRun({
        status: "error",
        body: err instanceof Error ? err.message : String(err),
        durationMs: performance.now() - start,
        resolvedUrl: fullUrl,
      });
    }
  }

  const curl = buildCurl(endpoint.method, fullUrl, endpoint.method === "POST" ? body : undefined);

  // Convenience defaults — fill in chain-aware suggestions on first render of
  // a freshly-selected endpoint, but only if the user hasn't typed yet.
  useEffect(() => {
    if (!chainHelpers) return;
    setPathValues((prev) => {
      const out = { ...prev };
      for (const p of endpoint.pathParams ?? []) {
        if (out[p.name]) continue;
        if (p.suggest === "ownAddress") out[p.name] = "0x0000000000000000000000000000000000000000";
        if (p.suggest === "blockchainId") out[p.name] = chainHelpers.blockchainId;
      }
      return out;
    });
    setQueryValues((prev) => {
      const out = { ...prev };
      for (const p of endpoint.queryParams ?? []) {
        if (out[p.name]) continue;
        if (p.suggest === "subnetId") out[p.name] = chainHelpers.subnetId;
      }
      return out;
    });
  }, [endpoint.id, chainHelpers]);

  return (
    <section style={{ padding: "32px 36px 64px" }}>
      <div className="flex items-center gap-3 mb-2">
        <MethodBadge method={endpoint.method} />
        <span
          className="mono"
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: "var(--ink)",
            wordBreak: "break-all",
          }}
        >
          {endpoint.path}
        </span>
      </div>
      <div className="h-display mb-2" style={{ fontSize: 32, lineHeight: 1.15 }}>
        {endpoint.title}
      </div>
      <div
        style={{
          fontSize: 14,
          color: "var(--ink-3)",
          maxWidth: 720,
          marginBottom: 28,
        }}
      >
        {endpoint.description}
      </div>

      {/* Inputs */}
      {endpoint.pathParams && endpoint.pathParams.length > 0 ? (
        <ParamSection
          label="Path parameters"
          params={endpoint.pathParams}
          values={pathValues}
          onChange={(name, v) => setPathValues((prev) => ({ ...prev, [name]: v }))}
        />
      ) : null}
      {endpoint.queryParams && endpoint.queryParams.length > 0 ? (
        <ParamSection
          label="Query parameters"
          params={endpoint.queryParams}
          values={queryValues}
          onChange={(name, v) => setQueryValues((prev) => ({ ...prev, [name]: v }))}
        />
      ) : null}
      {endpoint.method === "POST" ? <BodySection body={body} onChange={setBody} /> : null}

      {/* Send + URL preview */}
      <div className="flex items-center gap-3 mb-3" style={{ flexWrap: "wrap" }}>
        {endpoint.method === "WS" ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              padding: "9px 14px",
              border: "1px dashed var(--line)",
              borderRadius: 8,
            }}
          >
            WebSocket — open from a client (browser console, wscat, etc.). Connect to{" "}
            <span className="mono" style={{ color: "var(--ink-2)" }}>
              {fullUrl.replace(/^http/, "ws")}
            </span>
            .
          </div>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={run.status === "loading"}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              background: "var(--ink)",
              color: "var(--bg)",
              border: 0,
              fontSize: 13,
              fontWeight: 500,
              cursor: run.status === "loading" ? "wait" : "pointer",
              opacity: run.status === "loading" ? 0.7 : 1,
            }}
          >
            {run.status === "loading" ? "Sending…" : "Send"}
          </button>
        )}
        <CopyButton text={fullUrl} label="Copy URL" />
        {endpoint.method !== "WS" ? <CopyButton text={curl} label="Copy curl" /> : null}
      </div>
      <UrlPreview url={fullUrl} />

      {/* Response */}
      <div style={{ marginTop: 28 }}>
        <div
          className="eyebrow"
          style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}
        >
          <span>Response</span>
          {run.status === "ok" || run.status === "error" ? (
            <>
              <StatusPill status={run.status} httpStatus={run.httpStatus} />
              {run.durationMs != null ? (
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                  {Math.round(run.durationMs)} ms
                </span>
              ) : null}
            </>
          ) : null}
        </div>
        <ResponsePanel run={run} />
      </div>
    </section>
  );
}

function ParamSection({
  label,
  params,
  values,
  onChange,
}: {
  label: string;
  params: Param[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        {label}
      </div>
      <div className="card border border-line rounded-[10px] bg-bg-elev" style={{ padding: 4 }}>
        {params.map((p, i) => (
          <div
            key={p.name}
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              gap: 16,
              alignItems: "start",
              padding: "12px 14px",
              borderTop: i === 0 ? 0 : "1px solid var(--line-soft)",
            }}
          >
            <div>
              <div className="mono" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                {p.name}
                {p.required ? (
                  <span style={{ color: "var(--accent)", marginLeft: 4 }}>*</span>
                ) : null}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                {p.type}
              </div>
            </div>
            <div>
              <input
                value={values[p.name] ?? ""}
                onChange={(e) => onChange(p.name, e.target.value)}
                placeholder={p.example ?? ""}
                spellCheck={false}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  background: "var(--bg)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12.5,
                  color: "var(--ink)",
                  outline: "none",
                }}
              />
              {p.description ? (
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-3)",
                    marginTop: 6,
                    lineHeight: 1.45,
                  }}
                >
                  {p.description}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BodySection({ body, onChange }: { body: string; onChange: (value: string) => void }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        Request body · application/json
      </div>
      <textarea
        value={body}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={Math.min(14, Math.max(6, body.split("\n").length + 1))}
        style={{
          width: "100%",
          padding: "12px 14px",
          border: "1px solid var(--line)",
          borderRadius: 10,
          background: "var(--bg-elev)",
          fontFamily: "var(--font-mono)",
          fontSize: 12.5,
          color: "var(--ink)",
          outline: "none",
          resize: "vertical",
          lineHeight: 1.55,
        }}
      />
    </div>
  );
}

function MethodBadge({
  method,
  compact = false,
}: {
  method: "GET" | "POST" | "WS";
  compact?: boolean;
}) {
  const tone =
    method === "GET"
      ? { bg: "var(--good-soft)", fg: "oklch(0.42 0.13 145)" }
      : method === "POST"
        ? { bg: "var(--accent-soft)", fg: "var(--accent-ink)" }
        : { bg: "var(--steel-soft)", fg: "oklch(0.42 0.04 240)" };
  return (
    <span
      className="mono"
      style={{
        fontSize: compact ? 9.5 : 11,
        letterSpacing: "0.04em",
        padding: compact ? "2px 5px" : "3px 8px",
        borderRadius: 4,
        background: tone.bg,
        color: tone.fg,
        fontWeight: 600,
        minWidth: compact ? 28 : 40,
        textAlign: "center",
      }}
    >
      {method}
    </span>
  );
}

function UrlPreview({ url }: { url: string }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: 12,
        padding: "10px 14px",
        background: "var(--bg-sunken)",
        border: "1px solid var(--line-soft)",
        borderRadius: 8,
        color: "var(--ink-2)",
        wordBreak: "break-all",
      }}
    >
      {url}
    </div>
  );
}

function StatusPill({ status, httpStatus }: { status: "ok" | "error"; httpStatus?: number }) {
  const ok = status === "ok";
  return (
    <span
      className="mono"
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 99,
        border: "1px solid var(--line)",
        background: ok ? "var(--good-soft)" : "var(--accent-soft)",
        color: ok ? "oklch(0.42 0.13 145)" : "var(--accent-ink)",
        fontWeight: 500,
      }}
    >
      {httpStatus ?? "—"} {ok ? "OK" : "ERR"}
    </span>
  );
}

function ResponsePanel({ run }: { run: RunState }) {
  if (run.status === "idle") {
    return (
      <div
        style={{
          padding: "32px 18px",
          textAlign: "center",
          color: "var(--ink-4)",
          fontSize: 13,
          border: "1px dashed var(--line)",
          borderRadius: 10,
        }}
      >
        Hit Send to make a live request against{" "}
        <span className="mono" style={{ color: "var(--ink-3)" }}>
          {getApiBase()}
        </span>
      </div>
    );
  }
  if (run.status === "loading") {
    return (
      <div
        style={{
          padding: "32px 18px",
          textAlign: "center",
          color: "var(--ink-3)",
          fontSize: 13,
          border: "1px solid var(--line)",
          borderRadius: 10,
        }}
      >
        Waiting for response…
      </div>
    );
  }
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--bg-elev)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--ink-4)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {run.resolvedUrl}
        </span>
        <CopyButton text={run.body ?? ""} label="Copy" />
      </div>
      <pre
        style={{
          margin: 0,
          padding: "14px 16px",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          color: "var(--ink)",
          overflowX: "auto",
          maxHeight: 540,
          lineHeight: 1.55,
        }}
      >
        {run.body || "(empty body)"}
      </pre>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // ignore
        }
      }}
      style={{
        padding: "5px 10px",
        borderRadius: 6,
        border: "1px solid var(--line)",
        background: "var(--bg)",
        color: "var(--ink-2)",
        fontSize: 11.5,
        cursor: "pointer",
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function buildCurl(method: string, url: string, body: string | undefined): string {
  const lines: string[] = [`curl -X ${method} '${url}'`];
  lines.push(`  -H 'Accept: application/json'`);
  if (body) {
    lines.push(`  -H 'Content-Type: application/json'`);
    lines.push(`  -d '${body.replace(/'/g, `'\\''`)}'`);
  }
  return lines.join(" \\\n");
}
