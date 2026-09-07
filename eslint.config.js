import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import importX from "eslint-plugin-import-x";
import prettierCompat from "eslint-config-prettier";

// Extensions import-x/no-unresolved must try before it reports a miss. The
// client is why they are needed: it imports .jsx without an extension, which
// Vite resolves and the default node resolver does not -- without this the rule
// emits 53 false positives there. The server has no extensionless imports, but
// both blocks share the setting so the two cannot drift apart.
const importResolverSettings = {
  "import-x/resolver": { node: { extensions: [".js", ".jsx", ".json"] } }
};

// One list for both test blocks: one supplies the vitest globals, the other
// exempts tests from no-console. Kept together because a file that landed in
// only one would get half the pair -- no-console off but no globals, which
// trips no-undef, or globals but no exemption, as client/src/test/** was.
const testFiles = ["**/*.test.{js,jsx,mjs}", "client/src/test/**"];

// Spread into a block's `rules` alongside `plugins: { "import-x": importX }`;
// a new block needs both. Omitting the plugin fails loudly -- ESLint refuses to
// load the config -- but omitting this spread just silently drops the rules.
const importRules = {
  "import-x/no-cycle": "error",
  "import-x/no-unresolved": "error",
  "import-x/no-self-import": "error",
  "import-x/no-duplicates": "error"
};

/**
 * Flat config covering both workspaces. The repo had no linter before this, so
 * the rule set is deliberately scoped to defect classes rather than style:
 * unused/undeclared identifiers, unreachable code, and React Hook contract
 * violations. Formatting is left alone -- there is no Prettier here and
 * reflowing 27k lines would bury real findings.
 */
export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**", ".claude/**", ".githooks/**", "client/dist/**"]
  },

  // A config object holding only `ignores` is ESLint 9's global-ignores form.
  // Adding any other key to it -- linterOptions included -- demotes it to an
  // ordinary config object whose ignores apply to itself alone, which un-ignores
  // node_modules and .claude. So linterOptions gets its own object. ESLint 9
  // defaults reportUnusedDisableDirectives to "warn"; promoting it to "error"
  // stops orphaned suppressions accumulating. Zero unused directives today.
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error"
    }
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
    plugins: { react, "react-hooks": reactHooks, "import-x": importX },
    settings: { react: { version: "18.3" }, ...importResolverSettings },
    rules: {
      // Base no-unused-vars cannot see identifiers referenced only from JSX,
      // so every imported component reads as unused without these two.
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      ...importRules,
      "react/jsx-key": "error",
      "react/no-unstable-nested-components": "error",
      "no-console": "error"
    }
  },

  // ---- Tests: vitest globals -------------------------------------------
  // client/vite.config.js sets `globals: true`, so suites may use describe /
  // test / expect without importing them. Most files here do import from
  // "vitest" explicitly; the integration suite does not.
  {
    files: testFiles,
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
  // "server/**" reaches server/scripts/ too, so no-console covers those CLIs.
  // Root scripts/** is deliberately left out of it: that tree is repo tooling
  // whose job is to print, and enabling the rule there flags 13 valid calls.
  {
    files: ["server/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node }
    },
    plugins: { "import-x": importX },
    settings: { ...importResolverSettings },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^(_|next$)", varsIgnorePattern: "^_" }],
      ...importRules,
      "no-console": "error"
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
  },

  // ---- Tests may log: no-console is a production-code guard --------------
  // files: ["server/**/*.js"] also matches server/src/**/*.test.js, so the
  // server block's no-console would otherwise apply to suites. No test file
  // logs today; this is a forward guard.
  {
    files: testFiles,
    rules: { "no-console": "off" }
  },

  prettierCompat,

  // eslint-config-prettier disables this because Prettier's output makes it
  // unreachable. Keep it on regardless: it is a defect rule (ASI hazards) out of
  // js.configs.recommended, not a style rule, and it still guards code Prettier
  // does not reach.
  { rules: { "no-unexpected-multiline": "error" } }
];
