"use client";

/**
 * Lattice-styled API playground driven by openapi.json.
 *
 * Source resolution mirrors the previous Scalar embed:
 *   1. Live   `${apiBase}/v1/openapi.json` so the docs follow firn.
 *   2. Bundled `/openapi.json` as offline fallback.
 *
 * Re-resolves on network switch (apiBase changes via NetworkProvider).
 *
 * Endpoints group by `tags[0]`. Path/query inputs come from
 * `parameters[]`; request body from `requestBody.application/json.schema`,
 * walked into a JSON skeleton if no `example` is provided. If the spec is
 * too bare for a route, the playground reflects that — fix is in firn,
 * not here.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { getApiBase } from "@/lib/api/client";
import { useNetwork } from "@/lib/api/network";
import { CopyButton } from "@/components/lattice/copy-button";

// ─── OpenAPI types (just the bits we touch) ────────────────────────────

interface OpenAPIDoc {
  openapi: string;
  info?: { title?: string; version?: string };
  paths: Record<string, PathItem>;
  components?: { schemas?: Record<string, SchemaObject> };
}

type HttpMethod = "get" | "post" | "put" | "delete" | "patch";
const METHOD_KEYS: ReadonlyArray<HttpMethod> = ["get", "post", "put", "delete", "patch"];

type PathItem = Partial<Record<HttpMethod, Operation>>;

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
}

interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  description?: string;
  required?: boolean;
  schema?: SchemaObject;
  example?: unknown;
}

interface RequestBody {
  required?: boolean;
  content?: Record<string, MediaType>;
}

interface Response {
  description?: string;
  content?: Record<string, MediaType>;
}

interface MediaType {
  schema?: SchemaObject;
  example?: unknown;
}

interface SchemaObject {
  $ref?: string;
  type?: string | string[];
  format?: string;
  description?: string;
  example?: unknown;
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  enum?: unknown[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  allOf?: SchemaObject[];
}

// ─── Derived view model ────────────────────────────────────────────────

interface EndpointView {
  id: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  summary: string;
  description?: string;
  tag: string;
  pathParams: ParamView[];
  queryParams: ParamView[];
  body: BodyView | null;
  responseSchemaSummary: string | null;
}

interface ParamView {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  example?: string;
}

interface BodyView {
  required: boolean;
  example: string;
  schemaSummary: string | null;
}

interface GroupView {
  tag: string;
  endpoints: EndpointView[];
}

// Stable display order for the groups firn emits via huma tags. Anything
// not in this list appears alphabetically after the known tags.
const TAG_ORDER = [
  "Chain",
  "Blocks",
  "Transactions",
  "Addresses",
  "Tokens",
  "Balances",
  "ICM",
  "Validators",
  "P-Chain",
  "RPC",
  "Compliance",
  "Signature",
  "Explorer",
  "Meta",
];

// ─── theme subscription (mirror app's data-theme on <html>) ────────────

function subscribeTheme(onChange: () => void): () => void {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => obs.disconnect();
}
function getThemeSnapshot(): "dark" | "light" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

// ─── spec → view model helpers ─────────────────────────────────────────

function resolveRef(doc: OpenAPIDoc, ref: string): SchemaObject | null {
  // Only "#/components/schemas/Foo" — that's all firn emits.
  const m = ref.match(/^#\/components\/schemas\/(.+)$/);
  if (!m) return null;
  return doc.components?.schemas?.[m[1]] ?? null;
}

function describeType(schema: SchemaObject | undefined): string {
  if (!schema) return "any";
  if (schema.$ref) return schema.$ref.split("/").pop() ?? "object";
  const t = Array.isArray(schema.type) ? schema.type.find((x) => x !== "null") : schema.type;
  if (!t) {
    if (schema.oneOf || schema.anyOf || schema.allOf) return "object";
    return "any";
  }
  if (t === "array") return `${describeType(schema.items)}[]`;
  if (schema.format) return `${t} (${schema.format})`;
  return t;
}

function buildExample(
  doc: OpenAPIDoc,
  schema: SchemaObject | undefined,
  seen: Set<string> = new Set(),
): unknown {
  if (!schema) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return null;
    const next = new Set(seen);
    next.add(schema.$ref);
    return buildExample(doc, resolveRef(doc, schema.$ref) ?? undefined, next);
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  const t = Array.isArray(schema.type) ? schema.type.find((x) => x !== "null") : schema.type;
  if (t === "object" || schema.properties) {
    const out: Record<string, unknown> = {};
    const required = new Set(schema.required ?? []);
    for (const [k, v] of Object.entries(schema.properties ?? {})) {
      // Body example: keep it minimal — only include required properties so
      // the user has something runnable without a wall of nulls.
      if (required.size > 0 && !required.has(k)) continue;
      out[k] = buildExample(doc, v, seen);
    }
    return out;
  }
  if (t === "array") return [buildExample(doc, schema.items, seen)];
  if (t === "string") {
    if (schema.format === "date-time") return new Date().toISOString();
    if (schema.format === "uri") return "https://example.com";
    return "";
  }
  if (t === "integer" || t === "number") return 0;
  if (t === "boolean") return false;
  return null;
}

function summarizeSchema(schema: SchemaObject | undefined): string | null {
  if (!schema) return null;
  if (schema.$ref) return schema.$ref.split("/").pop() ?? null;
  const t = Array.isArray(schema.type) ? schema.type.find((x) => x !== "null") : schema.type;
  if (t) return t;
  return null;
}

function paramExample(p: Parameter): string | undefined {
  if (typeof p.example === "string" || typeof p.example === "number") return String(p.example);
  const ex = p.schema?.example;
  if (typeof ex === "string" || typeof ex === "number") return String(ex);
  return undefined;
}

function buildEndpoints(doc: OpenAPIDoc): GroupView[] {
  const byTag = new Map<string, EndpointView[]>();

  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHOD_KEYS) {
      const op = item[method];
      if (!op) continue;
      const tag = op.tags?.[0] ?? "Other";

      const pathParams: ParamView[] = [];
      const queryParams: ParamView[] = [];
      for (const p of op.parameters ?? []) {
        const pv: ParamView = {
          name: p.name,
          type: describeType(p.schema),
          required: !!p.required || p.in === "path",
          description: p.description ?? p.schema?.description,
          example: paramExample(p),
        };
        if (p.in === "path") pathParams.push(pv);
        else if (p.in === "query") queryParams.push(pv);
      }

      let body: BodyView | null = null;
      const json = op.requestBody?.content?.["application/json"];
      if (json) {
        const schema = json.schema;
        let exampleVal: unknown = json.example ?? schema?.example;
        if (exampleVal === undefined) exampleVal = buildExample(doc, schema);
        const example =
          exampleVal == null
            ? "{}"
            : typeof exampleVal === "string"
              ? exampleVal
              : JSON.stringify(exampleVal, null, 2);
        body = {
          required: !!op.requestBody?.required,
          example,
          schemaSummary: summarizeSchema(schema),
        };
      }

      const okResp = op.responses?.["200"] ?? op.responses?.["201"];
      const responseSchemaSummary = summarizeSchema(okResp?.content?.["application/json"]?.schema);

      const endpoint: EndpointView = {
        id: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase() as EndpointView["method"],
        path,
        summary: op.summary ?? op.operationId ?? path,
        description: op.description,
        tag,
        pathParams,
        queryParams,
        body,
        responseSchemaSummary,
      };

      const list = byTag.get(tag);
      if (list) list.push(endpoint);
      else byTag.set(tag, [endpoint]);
    }
  }

  const tags = [...byTag.keys()].sort((a, b) => {
    const ai = TAG_ORDER.indexOf(a);
    const bi = TAG_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return tags.map((tag) => ({
    tag,
    endpoints: (byTag.get(tag) ?? []).sort((a, b) => a.path.localeCompare(b.path)),
  }));
}

// ─── page ──────────────────────────────────────────────────────────────

export default function APIPlaygroundPage() {
  const { config } = useNetwork(); // re-render on network switch
  const apiBase = config.url ?? getApiBase();
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "light" as const);

  const [doc, setDoc] = useState<OpenAPIDoc | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  // Resolve spec on mount + whenever apiBase changes. setState-in-effect
  // is the right shape here: we're synchronizing local doc state with an
  // external system (a remote URL keyed off the active network).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setDocError(null);

    const live = apiBase ? `${apiBase}/v1/openapi.json` : null;

    async function load(url: string): Promise<OpenAPIDoc> {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as OpenAPIDoc;
    }

    (async () => {
      try {
        if (live) {
          try {
            const json = await load(live);
            if (!cancelled) setDoc(json);
            return;
          } catch {
            // fall through to bundled
          }
        }
        const json = await load("/openapi.json");
        if (!cancelled) setDoc(json);
      } catch (err) {
        if (!cancelled) setDocError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBase]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const groups = useMemo<GroupView[]>(() => (doc ? buildEndpoints(doc) : []), [doc]);

  const flat = useMemo<EndpointView[]>(() => groups.flatMap((g) => g.endpoints), [groups]);

  // Selected endpoint id, persisted in URL hash so reload + share preserves
  // position. Hash format is the raw operation id ("GET /v1/blocks").
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function readHash() {
      const raw = window.location.hash.replace(/^#/, "");
      if (!raw) return;
      try {
        const decoded = decodeURIComponent(raw);
        setSelectedId(decoded);
      } catch {
        setSelectedId(raw);
      }
    }
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  // Pick first endpoint once spec arrives if hash didn't resolve.
  // setState-in-effect: syncing to the freshly-loaded spec (external).
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (flat.length === 0) return;
    if (!selectedId || !flat.some((e) => e.id === selectedId)) {
      setSelectedId(flat[0].id);
    }
  }, [flat]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const selectEndpoint = useCallback((id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    }
  }, []);

  const endpoint = useMemo(
    () => flat.find((e) => e.id === selectedId) ?? flat[0] ?? null,
    [flat, selectedId],
  );

  if (docError) {
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-8">
        <div className="eyebrow mb-2">◆ API playground</div>
        <div className="h-display mb-4" style={{ fontSize: 32 }}>
          firn v1
        </div>
        <div
          className="border border-line rounded-md p-4 bg-bg-elev"
          style={{ color: "var(--accent-ink)", fontSize: 13 }}
        >
          Couldn&apos;t load openapi.json: {docError}
        </div>
      </div>
    );
  }

  if (!doc || !endpoint) {
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-8">
        <div className="eyebrow mb-2">◆ API playground</div>
        <div className="h-display mb-4" style={{ fontSize: 32 }}>
          firn v1
        </div>
        <div className="text-ink-4" style={{ fontSize: 13 }}>
          Loading spec…
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[260px_1fr]"
      style={{ minHeight: "calc(100vh - 60px)" }}
    >
      <Sidebar
        groups={groups}
        selectedId={endpoint.id}
        onSelect={selectEndpoint}
        title={doc.info?.title ?? "firn"}
        version={doc.info?.version ?? "v1"}
      />
      <Main endpoint={endpoint} apiBase={apiBase} themeKey={theme} />
    </div>
  );
}

// ─── sidebar ───────────────────────────────────────────────────────────

function Sidebar({
  groups,
  selectedId,
  onSelect,
  title,
  version,
}: {
  groups: GroupView[];
  selectedId: string;
  onSelect: (id: string) => void;
  title: string;
  version: string;
}) {
  return (
    <aside
      className="border-b lg:border-b-0 lg:border-r border-line"
      style={{
        padding: "24px 20px",
        position: "sticky",
        top: 60,
        alignSelf: "start",
        maxHeight: "calc(100vh - 60px)",
        overflowY: "auto",
      }}
    >
      <div className="eyebrow mb-3">◆ API playground</div>
      <div className="h-display mb-5" style={{ fontSize: 22 }}>
        {title} {version}
      </div>
      {groups.map((group) => (
        <div key={group.tag} style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10, color: "var(--ink-4)" }}>
            {group.tag}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {group.endpoints.map((e) => {
              const active = selectedId === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onSelect(e.id)}
                  style={{
                    textAlign: "left",
                    padding: "6px 10px 6px 8px",
                    borderRadius: 6,
                    background: active ? "var(--bg-sunken)" : "transparent",
                    border: 0,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: active ? "var(--ink)" : "var(--ink-3)",
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
                    {e.path}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}

// ─── main panel ────────────────────────────────────────────────────────

interface RunState {
  status: "idle" | "loading" | "ok" | "error";
  httpStatus?: number;
  body?: string;
  durationMs?: number;
  resolvedUrl?: string;
}

function Main({
  endpoint,
  apiBase,
  themeKey: _themeKey,
}: {
  endpoint: EndpointView;
  apiBase: string;
  themeKey: "dark" | "light";
}) {
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState<string>(endpoint.body?.example ?? "");
  const [run, setRun] = useState<RunState>({ status: "idle" });

  // Reset inputs whenever the user picks a different endpoint. Same
  // setState-in-effect pattern as the previous design — we're syncing to
  // the endpoint id, not maintaining derived state.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    const nextPath: Record<string, string> = {};
    for (const p of endpoint.pathParams) nextPath[p.name] = p.example ?? "";
    setPathValues(nextPath);

    const nextQuery: Record<string, string> = {};
    for (const p of endpoint.queryParams) nextQuery[p.name] = p.example ?? "";
    setQueryValues(nextQuery);

    setBody(endpoint.body?.example ?? "");
    setRun({ status: "idle" });
  }, [endpoint.id]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const resolvedPath = useMemo(() => {
    let p = endpoint.path;
    for (const param of endpoint.pathParams) {
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

  const fullUrl = `${apiBase}${resolvedPath}${queryString}`;
  const hasBody = endpoint.body !== null;

  const send = useCallback(async () => {
    setRun({ status: "loading" });
    const start = performance.now();
    try {
      const init: RequestInit = {
        method: endpoint.method,
        headers: { Accept: "application/json" },
      };
      if (hasBody) {
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
  }, [endpoint.method, fullUrl, hasBody, body]);

  const curl = useMemo(
    () => buildCurl(endpoint.method, fullUrl, hasBody ? body : undefined),
    [endpoint.method, fullUrl, hasBody, body],
  );

  return (
    <section style={{ padding: "28px 24px 64px" }}>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <MethodBadge method={endpoint.method} />
        <span
          className="mono"
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: "var(--ink)",
            wordBreak: "break-all",
          }}
        >
          {endpoint.path}
        </span>
      </div>
      <div className="h-display mb-2" style={{ fontSize: 28, lineHeight: 1.15 }}>
        {endpoint.summary}
      </div>
      {endpoint.description ? (
        <div
          style={{
            fontSize: 14,
            color: "var(--ink-3)",
            maxWidth: 720,
            marginBottom: 24,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {endpoint.description}
        </div>
      ) : (
        <div style={{ marginBottom: 24 }} />
      )}

      {endpoint.pathParams.length > 0 ? (
        <ParamSection
          label="Path parameters"
          params={endpoint.pathParams}
          values={pathValues}
          onChange={(name, v) => setPathValues((prev) => ({ ...prev, [name]: v }))}
        />
      ) : null}
      {endpoint.queryParams.length > 0 ? (
        <ParamSection
          label="Query parameters"
          params={endpoint.queryParams}
          values={queryValues}
          onChange={(name, v) => setQueryValues((prev) => ({ ...prev, [name]: v }))}
        />
      ) : null}
      {endpoint.body ? (
        <BodySection body={body} onChange={setBody} schemaName={endpoint.body.schemaSummary} />
      ) : null}

      <div className="flex items-center gap-3 mb-3 flex-wrap">
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
          {run.status === "loading" ? "Sending…" : "Try it"}
        </button>
        <CopyChip text={fullUrl} label="Copy URL" />
        <CopyChip text={curl} label="Copy curl" />
      </div>
      <UrlPreview url={fullUrl} />

      <div style={{ marginTop: 28 }}>
        <div
          className="eyebrow"
          style={{
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>Response</span>
          {endpoint.responseSchemaSummary ? (
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
              {endpoint.responseSchemaSummary}
            </span>
          ) : null}
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
        <ResponsePanel run={run} apiBase={apiBase} />
      </div>
    </section>
  );
}

// ─── sub-components ────────────────────────────────────────────────────

function ParamSection({
  label,
  params,
  values,
  onChange,
}: {
  label: string;
  params: ParamView[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        {label}
      </div>
      <div className="border border-line rounded-[10px] bg-bg-elev" style={{ padding: 4 }}>
        {params.map((p, i) => (
          <div
            key={p.name}
            className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 items-start"
            style={{
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
                style={inputStyle}
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

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid var(--line)",
  borderRadius: 6,
  background: "var(--bg)",
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
  color: "var(--ink)",
  outline: "none",
};

function BodySection({
  body,
  onChange,
  schemaName,
}: {
  body: string;
  onChange: (value: string) => void;
  schemaName: string | null;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        className="eyebrow"
        style={{
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span>Request body · application/json</span>
        {schemaName ? (
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
            {schemaName}
          </span>
        ) : null}
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
  method: EndpointView["method"];
  compact?: boolean;
}) {
  const tone = methodTone(method);
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
        minWidth: compact ? 32 : 48,
        textAlign: "center",
      }}
    >
      {method}
    </span>
  );
}

function methodTone(method: EndpointView["method"]): { bg: string; fg: string } {
  switch (method) {
    case "GET":
      return { bg: "var(--good-soft)", fg: "oklch(0.42 0.13 145)" };
    case "POST":
      return { bg: "var(--accent-soft)", fg: "var(--accent-ink)" };
    case "DELETE":
      return { bg: "var(--accent-soft)", fg: "var(--accent-ink)" };
    case "PUT":
    case "PATCH":
    default:
      return { bg: "var(--steel-soft)", fg: "oklch(0.42 0.04 240)" };
  }
}

function UrlPreview({ url }: { url: string }) {
  return (
    <div
      className="mono border border-line-soft rounded-md bg-bg-sunken"
      style={{
        fontSize: 12,
        padding: "10px 14px",
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
      className="mono border border-line"
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 99,
        background: ok ? "var(--good-soft)" : "var(--accent-soft)",
        color: ok ? "oklch(0.42 0.13 145)" : "var(--accent-ink)",
        fontWeight: 500,
      }}
    >
      {httpStatus ?? "—"} {ok ? "OK" : "ERR"}
    </span>
  );
}

function ResponsePanel({ run, apiBase }: { run: RunState; apiBase: string }) {
  if (run.status === "idle") {
    return (
      <div
        className="border border-dashed border-line rounded-[10px]"
        style={{
          padding: "32px 18px",
          textAlign: "center",
          color: "var(--ink-4)",
          fontSize: 13,
        }}
      >
        Hit Try it to make a live request against{" "}
        <span className="mono" style={{ color: "var(--ink-3)" }}>
          {apiBase}
        </span>
      </div>
    );
  }
  if (run.status === "loading") {
    return (
      <div
        className="border border-line rounded-[10px]"
        style={{
          padding: "32px 18px",
          textAlign: "center",
          color: "var(--ink-3)",
          fontSize: 13,
        }}
      >
        Waiting for response…
      </div>
    );
  }
  return (
    <div className="border border-line rounded-[10px] bg-bg-elev" style={{ overflow: "hidden" }}>
      <div
        className="border-b border-line-soft"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          gap: 8,
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
            minWidth: 0,
          }}
        >
          {run.resolvedUrl}
        </span>
        <CopyButton text={run.body ?? ""} />
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

function CopyChip({ text, label }: { text: string; label: string }) {
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
      className="border border-line bg-bg text-ink-2"
      style={{
        padding: "5px 10px",
        borderRadius: 6,
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
