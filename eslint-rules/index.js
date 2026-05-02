/**
 * Local ESLint plugin — collects firn-specific rules under one namespace
 * so eslint.config.mjs can register them as `firn-local/<rule>`.
 */

"use strict";

module.exports = {
  rules: {
    "enforce-network-query-key": require("./enforce-network-query-key"),
    "responsive-horizontal-padding": require("./responsive-horizontal-padding"),
  },
};
