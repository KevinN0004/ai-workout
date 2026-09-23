import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import importX from "eslint-plugin-import-x";
import prettierCompat from "eslint-config-prettier";
import jsxA11y from "eslint-plugin-jsx-a11y";

// Extensions import-x/no-unresolved must try before it reports a miss. The
// client is why they are needed: it imports .jsx without an extension, which
// Vite resolves and the default node resolver does not -- without this the rule
// emits 53 false positives there. The server has no extensionless imports, but
// both blocks share the setting so the two cannot drift apart.
const importResolverSettings = {
  "import-x/resolver": { node: { extensions: [".js", ".jsx", ".json"] } }
};

// jsx-a11y's recommended set, minus two rules that are wrong about this tree.
// Measured before enabling, the way every other rule here was: recommended
// reported 153 findings, and 128 of them came from these two.
//
// Both fire on `<label>Name <input /></label>`, which is how every form in this
// app is written. Nesting alone is a valid association -- `label-has-for` is
// deprecated upstream precisely because it demanded a matching `id` as well,
// and `control-has-associated-label` does not see through the nesting either.
// axe, running against the real rendered pages in e2e/a11y.spec.js, reports
// zero violations on those same forms. When a linter and the accessibility
// engine disagree about rendered output, the engine is the authority.
//
// The three interaction rules below are off for a different and narrower
// reason. Their 20 findings are all one pattern: an overlay backdrop whose
// onClick dismisses it, plus the inner panel's stopPropagation. Keyboard
// dismissal for every one of those overlays is handled centrally by
// `useCloseOnEscape` -- ModalPortal calls it for all six modals and
// DashboardDrawer calls it directly -- so the backdrop click is a redundant
// mouse affordance rather than the only way out. The rules cannot see that,
// because it lives in a hook rather than on the element.
//
// This is a real trade: the rules would also catch a genuinely
// keyboard-inaccessible control somewhere new. They are off as one recorded
// decision rather than twenty inline disables, and the guard against that
// regression is the axe scan in e2e/a11y.spec.js, which tests rendered output.
// If a keyboard trap ever ships, that is what should catch it.
const jsxA11yRules = {
  ...jsxA11y.flatConfigs.recommended.rules,
  "jsx-a11y/label-has-for": "off",
  "jsx-a11y/control-has-associated-label": "off",
  "jsx-a11y/click-events-have-key-events": "off",
  "jsx-a11y/no-static-element-interactions": "off",
  "jsx-a11y/no-noninteractive-element-interactions": "off"
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
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      ".claude/**",
      ".githooks/**",
      "client/dist/**",
      // Generated v8 coverage reports. Gitignored and prettier-ignored, but
      // this list is separate -- and the reports carry their own
      // eslint-disable comments, which reportUnusedDisableDirectives turns
      // into errors the moment anyone runs coverage locally.
      "**/coverage/**",
      // Playwright run output. Same reasoning as coverage: generated, and
      // gitignored and prettier-ignored separately from this list.
      "test-results/**",
      "playwright-report/**"
    ]
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
    plugins: { react, "react-hooks": reactHooks, "import-x": importX, "jsx-a11y": jsxA11y },
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
      "no-console": "error",
      ...jsxA11yRules
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

  // ---- Playwright: its config reads process.env; the specs do not ---------
  //
  // Both global sets, because a spec file legitimately contains code for two
  // runtimes: the test body runs in node, while the callback handed to
  // `page.evaluate` is serialised and executed in the browser, where
  // `document` and `getComputedStyle` are the whole point. With node globals
  // alone, every such callback is a no-undef error.
  {
    files: ["playwright.config.js", "e2e/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser }
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
