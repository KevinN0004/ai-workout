/**
 * ESLint flat config for every JavaScript file bar the ignores below, read by
 * `npm run lint` and `npm run lint:fix`. Its rules target defect classes, not
 * style, which is Prettier's; eslint-config-prettier, near the end, switches
 * off any style rule enabled above it that would fight Prettier.
 */
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
// reports every one of those imports as unresolved. The server needs none of it
// (its one extensionless import, in a test, names a .js file, which the default
// resolver finds), but both blocks share the setting so the two cannot drift
// apart.
const importResolverSettings = {
  "import-x/resolver": { node: { extensions: [".js", ".jsx", ".json"] } }
};

// jsx-a11y's recommended set. It already leaves label-has-for and
// control-has-associated-label off; the two lines below pin that, because both
// are wrong about this tree.
//
// Switched on, both fire on `<label>Name <input /></label>`, which is how every
// form in this app is written. Nesting alone is a valid association --
// `label-has-for` is deprecated upstream precisely because it demanded a
// matching `id` as well, and `control-has-associated-label` does not see
// through the nesting either.
// axe, running against the real rendered pages in e2e/a11y.spec.js, reports
// zero violations on those same forms. When a linter and the accessibility
// engine disagree about rendered output, the engine is the authority.
//
// The three interaction rules below are off for a different and narrower
// reason. Their 20 findings are all one pattern: an overlay backdrop whose
// onClick dismisses it, plus the inner panel's stopPropagation. Keyboard
// dismissal for every one of those overlays is handled centrally by
// `useCloseOnEscape` -- ModalPortal calls it for every modal and
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
// trips no-undef, or globals but no exemption.
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
  // ordinary config object whose ignores apply to itself alone. That un-ignores
  // everything listed there, .claude included, bar node_modules, which ESLint
  // ignores by default. So linterOptions gets its own object. ESLint 9 defaults
  // reportUnusedDisableDirectives to "warn"; promoting it to "error" stops
  // orphaned suppressions accumulating.
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
  // whose job is to print, so the rule would flag its output rather than stray
  // debugging.
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

  // ---- Root tooling scripts: node globals, CommonJS only in .cjs ------------
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
  // The client and server blocks' patterns also match their own test files, so
  // their no-console would otherwise apply to suites.
  {
    files: testFiles,
    rules: { "no-console": "off" }
  },

  // Turns off every rule on eslint-config-prettier's list. Of the rules enabled
  // above, the only one on it is no-unexpected-multiline, which the next block
  // turns back on; the rest of the list would switch off any style rule a block
  // above enabled.
  prettierCompat,

  // eslint-config-prettier disables this because some of Prettier's line
  // breaks can trip it. Keep it on regardless: it is a defect rule (ASI
  // hazards) out of js.configs.recommended, not a style rule. Prettier's
  // rewrite of a hazard usually leaves it nothing to report, so it earns its
  // place on code that has not been through Prettier yet.
  { rules: { "no-unexpected-multiline": "error" } }
];
