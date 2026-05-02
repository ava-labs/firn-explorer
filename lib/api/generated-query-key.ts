import { getApiBase } from "./client";

interface QueryKeyMeta {
  url: string;
  queryOptions?: unknown;
}

export const firnQueryKey = (
  parts: Record<string, unknown>,
  meta: QueryKeyMeta,
): readonly unknown[] => {
  const net = getApiBase();
  const url = meta?.url ?? "";
  const partValues = Object.values(parts ?? {}).filter((v) => v !== undefined && v !== null);
  return [net, url, ...partValues] as const;
};

export default firnQueryKey;
