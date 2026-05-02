/**
 * Custom ESLint rule: enforce-network-query-key
 *
 * Every `useQuery({ queryKey: [...] })` whose result depends on the
 * active firn deployment MUST include a network-scoping element in
 * its queryKey (the API base URL or an equivalent network identifier).
 * Without it, switching networks via the topbar leaves stale data in
 * the cache from the previous deployment under the new network's UI.
 *
 * The rule fires when a queryKey array's elements are all literals or
 * primitive references with no obvious network dependency. Two opt-out
 * mechanisms:
 *
 *   1. Reference `net`, `apiBase`, or call `useNetKey()` /
 *      `useNetwork()` somewhere in the same function body.
 *   2. Annotate the queryKey with a leading comment containing the
 *      string `network-agnostic` — used for global resources
 *      (Sourcify, openchain.xyz, 4byte.directory) that legitimately
 *      transcend the active firn deployment.
 *
 * Trade-off: this is a heuristic, not a type-system proof. It catches
 * the common case (forgetting the net prefix on a new query) without
 * needing to evaluate the queryFn's transitive dependencies.
 */

"use strict";

const NETWORK_REFERENCES = new Set(["net", "apiBase", "networkUrl", "networkKey"]);
const NETWORK_HOOKS = new Set(["useNetKey", "useNetwork", "useApiBase"]);
const OPT_OUT_TAG = "network-agnostic";

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "queryKey must include a network-scoping identifier (net) or be marked /* network-agnostic */",
      category: "Possible Errors",
    },
    schema: [],
    messages: {
      missing:
        "useQuery queryKey is missing a network-scoping identifier. Add `useNetKey()` (or useNetwork().config.url) and prepend it to the queryKey, or annotate the key with `/* network-agnostic */` if this query genuinely targets a deployment-independent resource.",
    },
  },

  create(context) {
    /** Walk a function/arrow body looking for `net` etc. */
    function bodyReferencesNetwork(fnNode) {
      let found = false;
      function walk(node) {
        if (found || !node || typeof node !== "object") return;
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        if (node.type === "Identifier" && NETWORK_REFERENCES.has(node.name)) {
          found = true;
          return;
        }
        if (
          node.type === "CallExpression" &&
          node.callee &&
          node.callee.type === "Identifier" &&
          NETWORK_HOOKS.has(node.callee.name)
        ) {
          found = true;
          return;
        }
        for (const key in node) {
          if (key === "parent" || key === "loc" || key === "range") continue;
          walk(node[key]);
        }
      }
      walk(fnNode.body);
      return found;
    }

    /** Find the nearest enclosing function/arrow node for a given node. */
    function enclosingFunction(node) {
      let cur = node.parent;
      while (cur) {
        if (
          cur.type === "FunctionDeclaration" ||
          cur.type === "FunctionExpression" ||
          cur.type === "ArrowFunctionExpression"
        ) {
          return cur;
        }
        cur = cur.parent;
      }
      return null;
    }

    /** Does the queryKey ArrayExpression carry an "network-agnostic" comment? */
    function hasOptOutComment(arrayNode) {
      const sourceCode = context.getSourceCode();
      const before = sourceCode.getCommentsBefore(arrayNode);
      const inside = sourceCode.getCommentsInside ? sourceCode.getCommentsInside(arrayNode) : [];
      const all = [...before, ...inside];
      return all.some((c) => c.value.includes(OPT_OUT_TAG));
    }

    /** Does the queryKey contain any element referencing a network identifier? */
    function elementsReferenceNetwork(arrayNode) {
      let found = false;
      function walk(node) {
        if (found || !node || typeof node !== "object") return;
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        if (node.type === "Identifier" && NETWORK_REFERENCES.has(node.name)) {
          found = true;
          return;
        }
        if (
          node.type === "CallExpression" &&
          node.callee &&
          ((node.callee.type === "Identifier" && NETWORK_HOOKS.has(node.callee.name)) ||
            (node.callee.type === "MemberExpression" &&
              node.callee.property &&
              NETWORK_HOOKS.has(node.callee.property.name)))
        ) {
          found = true;
          return;
        }
        for (const key in node) {
          if (key === "parent" || key === "loc" || key === "range") continue;
          walk(node[key]);
        }
      }
      walk(arrayNode);
      return found;
    }

    return {
      CallExpression(node) {
        // Match useQuery({ ... }) and useQuery<T>({ ... }) and similar.
        const callee = node.callee;
        const calleeName =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" && callee.property
              ? callee.property.name
              : null;
        if (calleeName !== "useQuery" && calleeName !== "useInfiniteQuery") {
          return;
        }
        const arg0 = node.arguments[0];
        if (!arg0 || arg0.type !== "ObjectExpression") return;

        const queryKeyProp = arg0.properties.find(
          (p) =>
            p.type === "Property" &&
            !p.computed &&
            p.key &&
            ((p.key.type === "Identifier" && p.key.name === "queryKey") ||
              (p.key.type === "Literal" && p.key.value === "queryKey")),
        );
        if (!queryKeyProp) return;

        // Find the actual array expression (may be wrapped in `as const`).
        let value = queryKeyProp.value;
        if (value && value.type === "TSAsExpression") value = value.expression;
        if (!value || value.type !== "ArrayExpression") return;

        if (hasOptOutComment(value)) return;
        if (elementsReferenceNetwork(value)) return;

        // Last resort: look at the enclosing function for a network reference
        // — covers the case where someone declared `const net = useNetKey()`
        // and used it in queryKey without us picking it up via the array
        // walk (e.g. through a spread).
        const fn = enclosingFunction(node);
        if (fn && bodyReferencesNetwork(fn)) return;

        context.report({ node: value, messageId: "missing" });
      },
    };
  },
};
