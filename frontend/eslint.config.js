import js from "@eslint/js";
import solid from "eslint-plugin-solid/configs/recommended";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";

// Flat config (ESLint 9+). Only src/ is linted; build output and
// node_modules are excluded by default (no need to list them here).
export default [
  js.configs.recommended,
  solid,
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      // espree (ESLint's default parser) can't parse TypeScript syntax
      // (interface, type annotations, etc.), so every .ts/.tsx source
      // file needs the TS parser here too, not just *.config.ts below.
      parser: tsParser,
      globals: {
        ...globals.browser,
        // Injected by vite.config.ts's `define`; a build-time string
        // replacement, not a real runtime global.
        __APP_NAME__: "readonly",
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Base no-unused-vars doesn't understand TS-only syntax (interface/type
      // function signatures, ambient `declare const`, etc.): its scope
      // analysis misreads type-level parameter and declaration names as
      // unused variables. Fixing this properly needs
      // @typescript-eslint/eslint-plugin's own no-unused-vars, which isn't
      // installed here, so the unreliable base rule is just switched off
      // for TS/TSX files.
      "no-unused-vars": "off",
    },
  },
  {
    // Root-level config files (vite.config.ts, etc.) run under Node,
    // not the browser, so they need Node globals like `process`.
    files: ["*.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Same as above, but for TypeScript config files (vite.config.ts):
    // espree (ESLint's default parser) can't parse TS syntax like type
    // imports or type annotations, so this swaps in the TS parser just
    // for this file pattern.
    files: ["*.config.ts"],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.node,
      },
    },
  },
];
