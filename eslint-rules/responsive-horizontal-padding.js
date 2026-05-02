/**
 * Custom ESLint rule: responsive-horizontal-padding
 *
 * Warn (not error) when a Tailwind className string literal applies a
 * large horizontal padding (`px-10` and up) without ALSO applying a
 * smaller-breakpoint variant. The smaller variant is what tells the
 * mobile-mode renderer to ignore the desktop padding — without it, the
 * page leaves an 80px+ horizontal gutter on a 360px-wide viewport,
 * which crushes the content column to <200px.
 *
 *   GOOD:  className="px-4 sm:px-6 lg:px-10"
 *   GOOD:  className="px-6 lg:px-12"
 *   WARN:  className="px-10 py-8"
 *   WARN:  className="px-12 max-w-[1080px] mx-auto"
 *
 * Heuristic, not a type-system proof:
 *   - Only fires on string literals (most call sites in this repo). Not
 *     on tagged template / cn(...) builders. Adding those would require
 *     constant-folding the call expression, which trades a lot of
 *     complexity for very little extra coverage.
 *   - Recognises only Tailwind's stock breakpoint prefixes (`sm:`,
 *     `md:`, `lg:`, `xl:`, `2xl:`) plus an unprefixed smaller `px-N`
 *     (e.g. `px-4 lg:px-10` is fine — the `px-4` is the mobile default).
 */

"use strict";

const LARGE_PX = new Set(["px-10", "px-12", "px-14", "px-16", "px-20", "px-24"]);
// Anything `px-N` with N < 10 counts as a mobile-friendly default that
// the larger value would override at the relevant breakpoint.
const SMALLER_PX_RE = /^px-(?:0|0\.5|1|1\.5|2|2\.5|3|3\.5|4|5|6|7|8|9)$/;
// Tailwind's responsive prefixes that imply "only at this width and
// above" — any `<prefix>:px-N` token earns the className a free pass
// because the unprefixed (or smaller-prefixed) px-N is then the mobile
// fallback. We accept any of these prefixes followed by `px-`.
const RESPONSIVE_PREFIX_RE = /(?:^|\s)(?:sm|md|lg|xl|2xl):px-/;

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Discourage large desktop horizontal padding (px-10+) without a smaller-breakpoint counterpart",
      category: "Best Practices",
    },
    schema: [],
    messages: {
      missing:
        "className uses '{{token}}' without a smaller breakpoint or unprefixed px-N. On mobile this leaves a wide gutter that crushes the content column. Add a mobile default like 'px-4 sm:px-6 lg:{{token}}'.",
    },
  },

  create(context) {
    /** Inspect a string literal value used as a `className`. */
    function checkClassName(node, raw) {
      if (typeof raw !== "string") return;
      const tokens = raw.split(/\s+/).filter(Boolean);
      const offending = tokens.find((t) => LARGE_PX.has(t));
      if (!offending) return;
      // Bail out if any responsive-prefixed `px-…` is present — the
      // author has already opted in to a per-breakpoint scheme.
      if (RESPONSIVE_PREFIX_RE.test(raw)) return;
      // Bail out if there's an unprefixed smaller `px-N` alongside the
      // big one (e.g. weirdly `className="px-4 px-10"` — Tailwind's
      // last-write-wins makes that a no-op, but it is still safer than
      // a bare `px-10`).
      if (tokens.some((t) => SMALLER_PX_RE.test(t))) return;
      context.report({
        node,
        messageId: "missing",
        data: { token: offending },
      });
    }

    return {
      // <div className="..."> — the JSX-attribute path.
      JSXAttribute(node) {
        if (!node.name || node.name.name !== "className") return;
        const v = node.value;
        if (!v) return;
        if (v.type === "Literal") {
          checkClassName(v, v.value);
          return;
        }
        // className={"…literal…"} — unwrap the JSXExpressionContainer.
        if (
          v.type === "JSXExpressionContainer" &&
          v.expression &&
          v.expression.type === "Literal"
        ) {
          checkClassName(v.expression, v.expression.value);
        }
      },
      // const cls = "…" used elsewhere — covers patterns like:
      //   const Page = ({ children }) => <div className={CONTAINER}>…
      //   const CONTAINER = "px-10 py-8 …";
      // We don't track the full data flow; instead we flag any string
      // literal whose value smells like a Tailwind class set with a
      // large px-N. False-positive risk is low because the LARGE_PX set
      // is small and very specific.
      VariableDeclarator(node) {
        if (
          node.init &&
          node.init.type === "Literal" &&
          typeof node.init.value === "string" &&
          /\bpx-\d/.test(node.init.value)
        ) {
          checkClassName(node.init, node.init.value);
        }
      },
    };
  },
};
