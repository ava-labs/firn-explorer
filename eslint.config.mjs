import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";
import firnLocal from "./eslint-rules/index.js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "eslint-rules/**",
    "lib/api/generated/**",
  ]),
  {
    plugins: {
      "unused-imports": unusedImports,
      "firn-local": firnLocal,
    },
    rules: {
      // ───── unused code hygiene ──────────────────────────────────────
      // Disable the base TS rule so unused-imports can fire its own
      // version with the autofix that strips dead imports cleanly.
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          // Allow underscore-prefixed bindings as intentional placeholders.
          // Common in destructuring: `const { logs: _logs, ...rest } = tx;`.
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],

      // ───── react-query discipline ──────────────────────────────────
      // Critical for multi-network deployments. See
      // eslint-rules/enforce-network-query-key.js for rationale.
      "firn-local/enforce-network-query-key": "error",

      // ───── mobile responsiveness ───────────────────────────────────
      // Warn on bare desktop horizontal padding (px-10+) without a
      // smaller-breakpoint counterpart. See
      // eslint-rules/responsive-horizontal-padding.js for the heuristic.
      "firn-local/responsive-horizontal-padding": "warn",

      // ───── general best practices ──────────────────────────────────
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "smart"],
      // Console.log is often left in by accident — warn but don't block,
      // since intentional debug logs in dev paths are still valuable.
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],

      // ───── Next 16 React Compiler ──────────────────────────────────
      // These rules are experimental in eslint-config-next 16 and fire
      // on long-standing patterns (intentional setState-in-effect for
      // external-state subscriptions, ref reads in render for stable
      // identity). Treat as warnings: they're useful as a heads-up but
      // not blocking — many flagged sites are correct by design.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      // Comment-as-jsx-text is a real bug but pre-existing one-off; let
      // it ride at warning level rather than fail CI on legacy markup.
      "react/jsx-no-comment-textnodes": "warn",
    },
  },
]);

export default eslintConfig;
