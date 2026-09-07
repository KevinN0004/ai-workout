import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Flat config covering both workspaces. The repo had no linter before this, so
 * the rule set is deliberately scoped to defect classes rather than style:
 * unused/undeclared identifiers, unreachable code, and React Hook contract
 * violations. Formatting is left alone -- there is no Prettier here and
 * reflowing 27k lines would bury real findings.
 */
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      ".claude/**",
      ".githooks/**",
      "client/dist/**"
    ]
  },

  js.configs.recommended,

  // ---- Client: browser globals, JSX, React Hooks rules -------------------
  {
    files: ["client/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "18.3" } },
    rules: {
      // Base no-unused-vars cannot see identifiers referenced only from JSX,
      // so every imported component reads as unused without these two.
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },

  // ---- Tests: vitest globals -------------------------------------------
  // client/vite.config.js sets `globals: true`, so suites may use describe /
  // test / expect without importing them. Most files here do import from
  // "vitest" explicitly; the integration suite does not.
  {
    files: ["**/*.test.{js,jsx}", "client/src/test/**"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        describe: "readonly",
        test: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeAll: "readonly",
        beforeEach: "readonly",
        afterAll: "readonly",
        afterEach: "readonly"
      }
    }
  },

  // ---- Server: node globals, ESM ----------------------------------------
  {
    files: ["server/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node }
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^(_|next$)", varsIgnorePattern: "^_" }]
    }
  },

  // ---- Root tooling scripts: CommonJS + node ----------------------------
  {
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node }
    }
  },
  {
    files: ["scripts/**/*.cjs"],
    languageOptions: { sourceType: "commonjs" }
  }
];
