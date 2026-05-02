import { defineConfig } from "orval";
const SPEC_PATH = process.env.FIRN_OPENAPI_PATH ?? "./openapi.json";
export default defineConfig({
  firn: {
    input: { target: SPEC_PATH },
    output: {
      target: "./lib/api/generated/firn.ts",
      schemas: "./lib/api/generated/schemas",
      client: "react-query",
      mode: "split",
      override: {
        mutator: { path: "./lib/api/generated-mutator.ts", name: "firnFetch" },
        query: {
          useQuery: true,
          queryKey: { path: "./lib/api/generated-query-key.ts", name: "firnQueryKey" },
        },
      },
    },
  },
});
