# Foundation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the project's tooling floor — Prettier, an expanded defect-scoped ESLint, a restructured CI with a self-invalidating dependency-security gate, Docker Compose for dev parity, and boot-time environment validation.

**Architecture:** Six independent PRs, sequenced so each lands on a green tree. Configuration changes are verified by running the tool and checking the exit code. The two pieces carrying real logic — the audit-allowlist expiry checker and the environment validator — are pure functions built test-first and unit-tested without filesystem or network.

**Tech Stack:** Node 20.19+/24 (ESM), npm workspaces, ESLint 9 flat config, Prettier 3, Vitest 4, `audit-ci`, Docker Compose, GitHub Actions.


**Design spec:** [`docs/superpowers/specs/2026-09-06-foundation-hardening-design.md`](../specs/2026-09-06-foundation-hardening-design.md)

---

## Baseline (must not regress)

| Check | Command | Expected |
| --- | --- | --- |
| Lint | `npx eslint .` | exit 0 |
| Client tests | `npm -w client run test` | 33 files, 655 tests passing |
| Server tests | `npm -w server run test` | 32 files, 750 tests passing |
| Build | `npm run build` | exit 0 (the "chunks larger than 500 kB" warning is pre-existing) |

Server tests need Postgres reachable on `127.0.0.1:55432` with `DATABASE_URL` set in `server/.env`.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `.prettierrc` | Create | Formatter settings matched to house style |
| `.prettierignore` | Create | Paths the formatter must not touch |
| `eslint.config.js` | Modify | Add import-x, React defect rules, `no-console`, Prettier compat |
| `package.json` (root) | Modify | `type: module`, `engines`, `overrides`, format/test scripts, devDeps |
| `.git-blame-ignore-revs` | Create | Quarantines the reformat commit from blame |
| `.nvmrc` | Create | Pins the development Node version (24) |
| `.npmrc` | Create | `engine-strict` trial (kept only if `npm ci` passes) |
| `.audit-ci.json` | Create | audit-ci gate config and advisory allowlist |
| `security/advisory-reviews.json` | Create | Per-advisory reason and `reviewBy` date |
| `scripts/check-audit-allowlist.mjs` | Create | Pure expiry/consistency checker + CLI entry |
| `scripts/check-audit-allowlist.test.mjs` | Create | Unit tests for the checker |
| `vitest.config.js` (root) | Create | Runs `scripts/**` tests, which have none today |
| `.github/workflows/ci.yml` | Modify | Split into `quality` / `test` / `build` |
| `docker-compose.yml` | Create | Postgres + Redis for dev parity |
| `server/src/services/envValidationService.js` | Create | Pure env preflight validator |
| `server/src/services/envValidationService.test.js` | Create | Unit tests for the validator |
| `server/src/index.js:757` | Modify | Invoke preflight inside the existing test guard |
| `.env.example` | Create | Tracked template for every documented variable |
| `.github/dependabot.yml` | Create | Weekly npm + actions updates |
| `.github/pull_request_template.md` | Create | PR checklist |
| `CODEOWNERS` | Create | Review routing |
| `CLAUDE.md` | Modify | Document the blame-ignore and compose gotchas |
| `README.md` | Modify | Document compose usage and `.env.example` |

---

## PR 1 — Prettier and ESLint configuration

No reformatting happens in this PR. Config only, so it stays reviewable.

### Task 1: Add Prettier and the new lint plugins

**Files:**

- Modify: `package.json` (root)
- Create: `.prettierrc`
- Create: `.prettierignore`

- [ ] **Step 1: Install the dev dependencies**

Run from the repository root. Do not pass `-w` — these belong to the root package, not a workspace.

```bash
npm install -D prettier@3 eslint-config-prettier eslint-plugin-import-x eslint-import-resolver-node vitest
```

`vitest` is added at the root deliberately: it currently resolves only by hoisting from the workspaces, and Task 9 adds root-level tests that must not depend on that accident.

- [ ] **Step 2: Create `.prettierrc`**

Settings are matched to the existing code, not to Prettier's defaults. `trailingComma: "none"` and `singleQuote: false` reflect house style; `endOfLine: "lf"` matches `.gitattributes` (`* text=auto eol=lf`).

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "none",
  "arrowParens": "always",
  "bracketSpacing": true,
  "endOfLine": "lf"
}
```

- [ ] **Step 3: Create `.prettierignore`**

```text
node_modules
dist
client/dist
coverage
.claude
.githooks
.postgres-data
.postgres-pw
package-lock.json
```

- [ ] **Step 4: Add format scripts to root `package.json`**

Add to the `scripts` block:

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 5: Verify Prettier sees the expected work**

```bash
npx prettier --check . ; echo "EXIT=$?"
```

Expected: `EXIT=1` with roughly 181 files listed (174 JS/JSX + 7 Markdown). This confirms the config loads and the ignore file works — the reformat itself is Task 4.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .prettierrc .prettierignore
git commit -m "build: add Prettier config and lint plugin dependencies

Config only -- no files are reformatted here, so the settings stay
reviewable on their own. printWidth 100 is chosen on measured evidence:
line-length p99 is 96 and only 201 lines exceed 100 chars, versus 1906
exceeding 80. trailingComma none and singleQuote false match existing
house style; endOfLine lf matches .gitattributes.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 2: Make the root package an ES module

**Files:**

- Modify: `package.json` (root)

- [ ] **Step 1: Reproduce the warning**

```bash
npx eslint . 2>&1 | grep MODULE_TYPELESS
```

Expected: a line containing `MODULE_TYPELESS_PACKAGE_JSON`, because `eslint.config.js` uses ESM syntax while the root package declares no type.

- [ ] **Step 2: Add the field**

In root `package.json`, immediately after `"private": true`:

```json
"type": "module",
```

- [ ] **Step 3: Verify the warning is gone and lint still passes**

```bash
npx eslint . ; echo "EXIT=$?"
```

Expected: `EXIT=0`, no `MODULE_TYPELESS_PACKAGE_JSON` line.

- [ ] **Step 4: Verify the CommonJS scripts still load**

`scripts/scrub-junk-files.js` is CommonJS. With `"type": "module"` a bare `.js` file is now treated as ESM, which would break it.

```bash
node scripts/scrub-junk-files.js --dry-run ; echo "EXIT=$?"
```

Expected: `EXIT=0`. **If this fails with `require is not defined in ES module scope`, rename the file to `scripts/scrub-junk-files.cjs`** and update every reference to it (`.claude/settings.json`, `CLAUDE.md`) in the same commit. Verify with:

```bash
grep -rn "scrub-junk-files" --include=*.json --include=*.md --include=*.mjs . | grep -v node_modules
```

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "build: declare the root package as an ES module

eslint.config.js is ESM, so every eslint run emitted
MODULE_TYPELESS_PACKAGE_JSON and paid a reparse cost.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 3: Expand the ESLint config

Every rule added here was measured against the tree first and reports **zero** violations, except `no-console` which reports exactly one. See Finding 9 in the design spec.

**Files:**

- Modify: `eslint.config.js`

- [ ] **Step 1: Add the imports at the top of `eslint.config.js`**

```js
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import importX from "eslint-plugin-import-x";
import prettierCompat from "eslint-config-prettier";
```

- [ ] **Step 2: Add a shared resolver settings constant below the imports**

This is mandatory. Without it `import-x/no-unresolved` produces **53 false positives** on the client's extensionless `.jsx` imports (`./DashboardHeader`, `../../components/ModalPortal`), which Vite resolves and the default Node resolver does not.

```js
// The client imports .jsx files without an extension, which Vite resolves and
// the default node resolver does not. Without these extensions no-unresolved
// reports 53 false positives.
const importResolverSettings = {
  "import-x/resolver": { node: { extensions: [".js", ".jsx", ".json"] } }
};

const importRules = {
  "import-x/no-cycle": "error",
  "import-x/no-unresolved": "error",
  "import-x/no-self-import": "error",
  "import-x/no-duplicates": "error"
};
```

- [ ] **Step 3: Add `linterOptions` to the first config object**

Replace the existing `ignores`-only first entry with:

```js
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      ".claude/**",
      ".githooks/**",
      "client/dist/**"
    ],
    linterOptions: {
      // ESLint 9 defaults this to "warn". Promoting it to "error" stops dead
      // suppressions accumulating. There are zero unused directives today.
      reportUnusedDisableDirectives: "error"
    }
  },
```

- [ ] **Step 4: Extend the client block**

Add `importX` to `plugins`, merge the resolver into `settings`, and add the two React defect rules plus the import rules:

```js
    plugins: { react, "react-hooks": reactHooks, "import-x": importX },
    settings: { react: { version: "18.3" }, ...importResolverSettings },
    rules: {
      ...importRules,
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-key": "error",
      "react/no-unstable-nested-components": "error",
      "no-console": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
```

- [ ] **Step 5: Extend the server block**

```js
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
      ...importRules,
      "no-console": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^(_|next$)", varsIgnorePattern: "^_" }]
    }
  },
```

- [ ] **Step 6: Allow `console` in test files**

`files: ["server/**/*.js"]` matches `server/src/**/*.test.js`, so `no-console` would apply to tests
too. There are **zero** `console.*` calls in any test file today, so this is a forward guard, not a
cleanup. Append **before** the Prettier compat entry:

```js
  {
    files: ["**/*.test.{js,jsx,mjs}"],
    rules: { "no-console": "off" }
  },
```

`scripts/**` needs no exemption — `no-console` is scoped to `client/**` and `server/**` only, so it
never applied there.

- [ ] **Step 7: Append the Prettier compat entry last**

It must be last so it can switch off any stylistic rule an earlier block enabled.

```js
  prettierCompat
];
```

- [ ] **Step 8: Run lint and triage the single expected failure**

```bash
npx eslint . ; echo "EXIT=$?"
```

Expected: `EXIT=1` with exactly **one** `no-console` error in `server/src` (measured: 1 occurrence outside tests, 0 in the client). Replace that call with the pino `logger` already available in that module, or with `process.stderr.write` if no logger is in scope.

If any *other* rule fires, stop and report it — the measurement said zero, so a violation means the config differs from what was probed.

- [ ] **Step 9: Verify a clean run**

```bash
npx eslint . ; echo "EXIT=$?"
```

Expected: `EXIT=0`.

- [ ] **Step 10: Prove `no-unresolved` is actually working, not silently passing**

A rule that resolves nothing also reports nothing. Confirm it can fail:

```bash
printf 'import x from "./definitely-not-a-real-module.js";\nexport default x;\n' > server/src/__probe.js
npx eslint server/src/__probe.js ; echo "EXIT=$?"
rm server/src/__probe.js
```

Expected: `EXIT=1` with an `import-x/no-unresolved` error. Then confirm the probe file is gone with `git status --porcelain`.

- [ ] **Step 11: Run the full suite**

```bash
npm test
```

Expected: 655 client and 750 server tests passing.

- [ ] **Step 12: Commit**

```bash
git add eslint.config.js server/src
git commit -m "lint: add import-x, React defect rules, and no-console

Every rule here was measured against the tree before being enabled, and
all report zero violations except no-console, which reported exactly one
call in server/src. Nothing lands as a warning or silently disabled.

Records the resolver setting that makes import-x/no-unresolved usable
here: the client imports .jsx extensionlessly, which Vite resolves and
the default node resolver does not, so without
resolver.node.extensions the rule emits 53 false positives.

reportUnusedDisableDirectives is promoted from ESLint 9's default warn to
error; there are zero unused directives today, so it only ever fires on
newly-orphaned ones.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## PR 2 — The reformat

Land this against a quiet tree. It touches roughly 10,447 lines and will conflict with any open branch.

### Task 4: Reformat the repository in one isolated commit

**Files:** ~181 files across `client/`, `server/`, `scripts/`, and tracked Markdown.

- [ ] **Step 1: Confirm the tree is clean**

```bash
git status --porcelain
```

Expected: empty output. Do not proceed otherwise — this commit must contain formatting and nothing else.

- [ ] **Step 2: Record the pre-reformat test counts**

```bash
npm test 2>&1 | grep -E "Tests +[0-9]+ passed"
```

Expected: `655 passed` then `750 passed`.

- [ ] **Step 3: Run the formatter**

```bash
npm run format
```

- [ ] **Step 4: Confirm the scale matches the measurement**

```bash
git diff --shortstat
```

Expected: roughly 181 files changed and on the order of 10,000 insertions plus deletions. A wildly different number means `.prettierignore` is wrong — investigate before committing.

- [ ] **Step 5: Verify nothing behavioural changed**

```bash
npx eslint . ; echo "LINT=$?"
npm test 2>&1 | grep -E "Tests +[0-9]+ passed"
npm run build ; echo "BUILD=$?"
```

Expected: `LINT=0`, `655 passed`, `750 passed`, `BUILD=0`. Formatting must not change a single test outcome.

- [ ] **Step 6: Commit the reformat alone**

```bash
git add -A
git commit -m "style: format the repository with Prettier

Formatting only -- no behavioural change. Verified by running the full
suite before and after: 655 client and 750 server tests pass either way,
and eslint and the build stay green.

This commit is recorded in .git-blame-ignore-revs so it does not obscure
authorship.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

- [ ] **Step 7: Verify the formatter is now satisfied**

```bash
npx prettier --check . ; echo "EXIT=$?"
```

Expected: `EXIT=0`.

---

### Task 5: Quarantine the reformat from blame

**Files:**

- Create: `.git-blame-ignore-revs`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Capture the reformat SHA**

```bash
git rev-parse HEAD
```

- [ ] **Step 2: Create `.git-blame-ignore-revs`**

Substitute the real SHA from Step 1 for `<SHA>`:

```text
# Revisions listed here are skipped by `git blame`.
#
# This file is NOT automatically honoured by local git. Enable it once per
# clone with:
#     git config blame.ignoreRevsFile .git-blame-ignore-revs
# GitHub applies it automatically with no configuration.

# style: format the repository with Prettier (2026-09-06)
<SHA>
```

- [ ] **Step 3: Enable it locally and verify it works**

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
git blame -L 1,5 server/src/shutdown.js | head -5
```

Expected: the listed commits are the original authoring commits, **not** the reformat SHA from Step 1.

- [ ] **Step 4: Document the gotcha in `CLAUDE.md`**

In the "Fresh Clone Setup" section, alongside the existing `core.hooksPath` line, add:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs   # skip the Prettier reformat in blame
```

And add this note beneath that block:

> Like `core.hooksPath`, this lives in `.git/config` and is therefore not part of the
> repository — a clone will silently attribute ~10k lines to the reformat commit until it is
> set. GitHub honours the file automatically; local git does not.

- [ ] **Step 5: Commit**

```bash
git add .git-blame-ignore-revs CLAUDE.md
git commit -m "chore: ignore the Prettier reformat in git blame

Local git does not read this file without
blame.ignoreRevsFile being set, so the requirement is documented in
CLAUDE.md next to the existing core.hooksPath note -- both are .git/config
settings that fail silently on a fresh clone.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## PR 3 — CI, Node alignment, and the security gate

Must land after PR 2, or `prettier --check` fails on arrival.

### Task 6: Fix the `qs` advisory with an override

`npm audit fix` is the wrong tool here: it *downgrades* `body-parser` 1.20.6 → 1.20.4, whose `qs` range (`~6.14.0`) is still inside the vulnerable `2.2.5 – 6.15.3` window. No Express 4 release reaches a patched `qs`. The fix is 6.16.0, reachable only by override.

**Files:**

- Modify: `package.json` (root)

- [ ] **Step 1: Record the current finding**

```bash
npm audit 2>&1 | grep -c "qs"
```

Expected: a non-zero count.

- [ ] **Step 2: Add the override to root `package.json`**

```json
"overrides": {
  "qs": "^6.16.0"
}
```

- [ ] **Step 3: Reinstall and confirm resolution**

```bash
npm install
npm ls qs --all
```

Expected: every `qs` in the tree resolves to `6.16.0`.

- [ ] **Step 4: Confirm the advisory is gone**

```bash
npm audit 2>&1 | tail -5
```

Expected: 4 high remaining (the Prisma CLI chain), **zero** moderate, and no `qs` or `body-parser` entries.

- [ ] **Step 5: Prove the override did not break `supertest`**

The override also lifts `supertest → superagent → qs@6.14.2` to 6.16.0. This is the risk flagged in the design spec, and the server suite is the only thing that exercises it.

```bash
npm test
```

Expected: 655 client and 750 server tests passing. **If the server suite fails, stop** — report the failure rather than pinning `qs` only for Express.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix(deps): force qs to ^6.16.0 to clear the DoS advisories

npm audit fix does not fix this. It downgrades body-parser 1.20.6 ->
1.20.4, whose qs range (~6.14.0) is still inside the vulnerable
2.2.5-6.15.3 window, and the post-fix audit still reports all six
findings. No Express 4 release reaches a patched qs: 4.22.2 pins
qs ~6.15.1. 6.16.0 is the fixed version, reachable only by override.

Verified against the full suite because the override also lifts
supertest -> superagent -> qs from 6.14.2.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 7: Align the Node version across `engines`, `.nvmrc`, and CI

`engines: ">=20"` is wrong: it permits Node 20.0–20.18, which both Vite 7 (`^20.19.0 || >=22.12.0`) and Prisma 7 (`^20.19 || ^22.12 || >=24.0`) reject. Vitest additionally excludes odd-numbered Node 23.

**Files:**

- Modify: `package.json` (root, `client`, `server`)
- Create: `.nvmrc`
- Create: `.npmrc`

- [ ] **Step 1: Correct `engines` in all three `package.json` files**

```json
"engines": {
  "node": "^20.19 || ^22.12 || >=24"
}
```

- [ ] **Step 2: Create `.nvmrc`**

This is the version actually developed on (verified `v24.14.1`), not the CI floor.

```text
24
```

- [ ] **Step 3: Create `.npmrc` and attempt strict enforcement**

```text
# Turns the engines field from advisory metadata into an install-time gate.
engine-strict=true
```

- [ ] **Step 4: Verify `engine-strict` does not break installs**

npm applies `engine-strict` to **every package in the tree**, so one transitive dependency with a careless `engines` field breaks `npm ci`.

```bash
rm -rf node_modules
npm ci ; echo "EXIT=$?"
```

Expected: `EXIT=0`. **If it fails**, delete `.npmrc`, record the offending package in the commit message, and continue — `engines` plus the CI matrix remain the enforcement. Do not weaken `engines` to satisfy a transitive dependency.

- [ ] **Step 5: Verify the suite still passes after the clean install**

```bash
npm test
```

Expected: 655 client and 750 server tests passing.

- [ ] **Step 6: Commit**

```bash
git add package.json client/package.json server/package.json .nvmrc .npmrc
git commit -m "build: correct the Node engines range and pin the dev version

engines said >=20, which permits 20.0-20.18 -- versions Vite 7
(^20.19.0 || >=22.12.0) and Prisma 7 (^20.19 || ^22.12 || >=24.0) both
reject. Vitest also excludes odd-numbered 23, so the honest range is
^20.19 || ^22.12 || >=24.

.nvmrc pins 24, the version actually developed on, while engines
describes the supported floor and CI exercises both ends.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 8: Declare the audit gate and the advisory reviews

The four high advisories reach the tree only through `prisma@7.10.0`, a **devDependency**. Two roots, not one: `mysql2` and `deepmerge-ts` via `@prisma/config`. npm's remedy is `prisma@6.19.3` — a downgrade — so they are allowlisted with an enforced expiry instead.

**Files:**

- Create: `.audit-ci.json`
- Create: `security/advisory-reviews.json`

- [ ] **Step 1: Create `.audit-ci.json`**

Only keys `audit-ci` understands go here, so its schema validation cannot reject the file.

**Two entries, not three.** `audit-ci` was run against this tree to check: with `"high": true`, only
`GHSA-3f6p-5ww8-9rcr` and `GHSA-ggr8-5vv4-36mx` actually trigger the gate. Adding the third mysql2
advisory (`GHSA-rgwj-5xj2-c3m3`, which sits below the high threshold) makes audit-ci emit
`Consider not allowlisting advisory` — suppressing something that was never blocking. The allowlist
should name exactly what is being suppressed and nothing more.

```json
{
  "high": true,
  "allowlist": [
    "GHSA-3f6p-5ww8-9rcr",
    "GHSA-ggr8-5vv4-36mx"
  ]
}
```

- [ ] **Step 2: Create `security/advisory-reviews.json`**

The justification and expiry live in a separate file so `.audit-ci.json` stays schema-valid. Set `reviewBy` to three months out.

```json
{
  "reviews": [
    {
      "advisory": "GHSA-3f6p-5ww8-9rcr",
      "package": "mysql2",
      "reason": "Reached only through the prisma CLI devDependency. This app never connects to MySQL and the CLI does not ship to production runtime. npm's remedy is prisma@6.19.3, a downgrade from 7.10.",
      "reviewBy": "2026-12-06"
    },
    {
      "advisory": "GHSA-ggr8-5vv4-36mx",
      "package": "deepmerge-ts",
      "reason": "Reached through @prisma/config, itself a prisma CLI devDependency. Not present in the production runtime tree.",
      "reviewBy": "2026-12-06"
    }
  ]
}
```

- [ ] **Step 3: Verify `audit-ci` passes with this config**

```bash
npx --yes audit-ci@7 --config .audit-ci.json ; echo "EXIT=$?"
```

Expected: `EXIT=0`.

- [ ] **Step 4: Commit**

```bash
git add .audit-ci.json security/advisory-reviews.json
git commit -m "ci: declare the audit gate and allowlist the prisma CLI advisories

The four high advisories are two roots, not one -- mysql2 and
deepmerge-ts via @prisma/config -- and both reach the tree only through
the prisma CLI devDependency. npm's remedy is a prisma 7 -> 6 downgrade,
so they are allowlisted rather than 'fixed'.

Justification and expiry live in security/advisory-reviews.json so
.audit-ci.json holds only keys audit-ci's schema accepts. Task 9 makes
the expiry enforceable.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 9: Build the allowlist expiry checker (TDD)

`audit-ci` has no native expiry support. A date in a comment is exactly the suppression that rots, so this script makes it self-invalidating.

**Files:**

- Create: `vitest.config.js` (root)
- Create: `scripts/check-audit-allowlist.test.mjs`
- Create: `scripts/check-audit-allowlist.mjs`
- Modify: `package.json` (root)

- [ ] **Step 1: Create the root Vitest config**

`scripts/` has no test coverage today. `include` is narrow so this run never picks up workspace tests.

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.mjs"],
    environment: "node"
  }
});
```

- [ ] **Step 2: Add the script to root `package.json`**

Replace the existing `test` entry and add `test:scripts`:

```json
"test": "npm run test -w client && npm run test -w server && npm run test:scripts",
"test:scripts": "vitest run"
```

- [ ] **Step 3: Write the failing tests**

Create `scripts/check-audit-allowlist.test.mjs`:

```js
import { describe, expect, test } from "vitest";
import { checkAdvisoryReviews } from "./check-audit-allowlist.mjs";

const review = (overrides = {}) => ({
  advisory: "GHSA-aaaa-bbbb-cccc",
  package: "example",
  reason: "Dev-only dependency.",
  reviewBy: "2099-01-01",
  ...overrides
});

describe("checkAdvisoryReviews", () => {
  test("passes when every allowlisted advisory has a future-dated review", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [review()],
      today: "2026-09-06"
    });
    expect(errors).toEqual([]);
  });

  test("fails when an allowlisted advisory has no review entry", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [],
      today: "2026-09-06"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("no entry in security/advisory-reviews.json");
  });

  test("fails when the review date has passed", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [review({ reviewBy: "2026-09-05" })],
      today: "2026-09-06"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("due for re-review");
  });

  test("passes on the review date itself, failing only after it", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [review({ reviewBy: "2026-09-06" })],
      today: "2026-09-06"
    });
    expect(errors).toEqual([]);
  });

  test("fails closed on a malformed date", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [review({ reviewBy: "December 2026" })],
      today: "2026-09-06"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("expected YYYY-MM-DD");
  });

  test("fails closed on a missing date", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [review({ reviewBy: undefined })],
      today: "2026-09-06"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("expected YYYY-MM-DD");
  });

  test("fails when a review has no reason", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [review({ reason: "   " })],
      today: "2026-09-06"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('has no "reason"');
  });

  test("fails on a stale review for an advisory no longer allowlisted", () => {
    const errors = checkAdvisoryReviews({
      allowlist: [],
      reviews: [review()],
      today: "2026-09-06"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("not allowlisted");
  });

  test("reports every problem at once rather than stopping at the first", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc", "GHSA-dddd-eeee-ffff"],
      reviews: [review({ reviewBy: "2026-01-01" })],
      today: "2026-09-06"
    });
    expect(errors).toHaveLength(2);
  });
});
```

- [ ] **Step 4: Run the tests and confirm they fail**

```bash
npm run test:scripts
```

Expected: FAIL — `Failed to resolve import "./check-audit-allowlist.mjs"`.

- [ ] **Step 5: Write the implementation**

Create `scripts/check-audit-allowlist.mjs`:

```js
#!/usr/bin/env node
/**
 * Enforces the expiry dates on the audit-ci allowlist.
 *
 * audit-ci has no native expiry support, so a suppression added once would
 * otherwise stay forever. This cross-checks .audit-ci.json against
 * security/advisory-reviews.json and fails the build when an entry is past its
 * reviewBy date, has no justification, or has gone stale.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toUtcDate = (isoDate) => Date.parse(`${isoDate}T00:00:00Z`);

export const checkAdvisoryReviews = ({ allowlist = [], reviews = [], today }) => {
  const errors = [];
  const byAdvisory = new Map();

  for (const entry of reviews) {
    const advisory = typeof entry?.advisory === "string" ? entry.advisory.trim() : "";
    if (!advisory) {
      errors.push('Every review entry needs a non-empty "advisory" id.');
      continue;
    }
    if (byAdvisory.has(advisory)) {
      errors.push(`Duplicate review entry for ${advisory}.`);
      continue;
    }
    byAdvisory.set(advisory, entry);
  }

  for (const advisory of allowlist) {
    const entry = byAdvisory.get(advisory);
    if (!entry) {
      errors.push(
        `${advisory} is allowlisted in .audit-ci.json but has no entry in security/advisory-reviews.json.`
      );
      continue;
    }
    if (!String(entry.reason || "").trim()) {
      errors.push(`${advisory} has no "reason" explaining why it is suppressed.`);
    }
    const reviewBy = String(entry.reviewBy ?? "");
    if (!DATE_PATTERN.test(reviewBy)) {
      errors.push(
        `${advisory} has an invalid "reviewBy" (${JSON.stringify(entry.reviewBy)}); expected YYYY-MM-DD.`
      );
      continue;
    }
    if (toUtcDate(reviewBy) < toUtcDate(today)) {
      errors.push(
        `${advisory} was due for re-review on ${reviewBy}. Re-check the advisory, then either fix it or move the date with a fresh justification.`
      );
    }
  }

  for (const advisory of byAdvisory.keys()) {
    if (!allowlist.includes(advisory)) {
      errors.push(`${advisory} has a review entry but is not allowlisted — remove the stale entry.`);
    }
  }

  return errors;
};

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));

const main = () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const auditConfig = readJson(path.join(repoRoot, ".audit-ci.json"));
  const reviewFile = readJson(path.join(repoRoot, "security", "advisory-reviews.json"));
  const today = new Date().toISOString().slice(0, 10);

  const errors = checkAdvisoryReviews({
    allowlist: auditConfig.allowlist || [],
    reviews: reviewFile.reviews || [],
    today
  });

  if (errors.length > 0) {
    process.stderr.write(
      `Audit allowlist check failed:\n${errors.map((line) => `  - ${line}`).join("\n")}\n`
    );
    process.exit(1);
  }
  process.stdout.write(`Audit allowlist OK (${auditConfig.allowlist?.length || 0} entries).\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
npm run test:scripts
```

Expected: 9 tests passing.

- [ ] **Step 7: Run the CLI against the real files**

```bash
node scripts/check-audit-allowlist.mjs ; echo "EXIT=$?"
```

Expected: `Audit allowlist OK (2 entries).` and `EXIT=0`.

- [ ] **Step 8: Prove the gate actually fails**

A checker that cannot fail is worthless. Temporarily backdate one entry:

```bash
cp security/advisory-reviews.json /tmp/reviews.bak
node -e "const f='security/advisory-reviews.json';const j=JSON.parse(require('fs').readFileSync(f));j.reviews[0].reviewBy='2020-01-01';require('fs').writeFileSync(f,JSON.stringify(j,null,2))"
node scripts/check-audit-allowlist.mjs ; echo "EXIT=$?"
cp /tmp/reviews.bak security/advisory-reviews.json
```

Expected: `EXIT=1` with a "due for re-review on 2020-01-01" message, then the file is restored. Confirm with `git status --porcelain`.

- [ ] **Step 9: Verify lint still passes on the new files**

```bash
npx eslint . ; echo "EXIT=$?"
```

Expected: `EXIT=0`. `scripts/**` is linted (it is not in the ignore list), and `no-console` is switched off there by Task 3 Step 6.

- [ ] **Step 10: Commit**

```bash
git add vitest.config.js package.json scripts/check-audit-allowlist.mjs scripts/check-audit-allowlist.test.mjs
git commit -m "ci: enforce expiry on the audit allowlist

audit-ci has no native expiry support, so an allowlisted advisory would
otherwise be suppressed permanently by inattention. This cross-checks
.audit-ci.json against security/advisory-reviews.json and fails once a
reviewBy date passes, a justification is missing, or a review goes stale.

Fails closed on malformed and missing dates, and reports every problem at
once rather than stopping at the first.

Also adds root-level Vitest so scripts/ is testable at all -- it had no
coverage despite being linted as first-class code.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 10: Restructure the CI workflow

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace the file entirely**

```yaml
name: CI

on:
  push:
    branches:
      - main
      - master
  pull_request:

# Supersede in-flight runs on the same ref rather than paying for both.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

# Least privilege: nothing here writes to the repository.
permissions:
  contents: read

jobs:
  quality:
    name: Lint, format, audit
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install Dependencies
        run: npm ci

      - name: ESLint
        run: npx eslint .

      - name: Prettier
        run: npx prettier --check .

      - name: Script Tests
        run: npm run test:scripts

      - name: Audit Allowlist Expiry
        run: node scripts/check-audit-allowlist.mjs

      - name: Dependency Audit
        run: npx --yes audit-ci@7 --config .audit-ci.json

  test:
    name: Tests (Node ${{ matrix.node }})
    runs-on: ubuntu-latest
    timeout-minutes: 25

    strategy:
      fail-fast: false
      matrix:
        node: ["20.19", "24"]

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: ai_workout_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/ai_workout_test

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: ${{ matrix.node }}
          cache: "npm"

      - name: Install Dependencies
        run: npm ci

      - name: Generate Prisma Client
        run: npm -w server run prisma:generate

      - name: Apply Postgres Migrations
        run: npm -w server run migrate:postgres

      - name: Client Tests
        run: npm -w client run test

      - name: Server Tests
        run: npm -w server run test

  build:
    name: Build client
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install Dependencies
        run: npm ci

      - name: Client Build
        run: npm -w client run build
```

- [ ] **Step 2: Validate the YAML parses**

```bash
node -e "const{readFileSync}=require('node:fs');const t=readFileSync('.github/workflows/ci.yml','utf8');if(!t.includes('fail-fast'))throw new Error('matrix missing');console.log('lines:',t.split('\n').length)"
```

Expected: a line count, no throw.

- [ ] **Step 3: Run every CI step locally**

```bash
npx eslint . ; echo "LINT=$?"
npx prettier --check . ; echo "FMT=$?"
npm run test:scripts ; echo "SCRIPTS=$?"
node scripts/check-audit-allowlist.mjs ; echo "EXPIRY=$?"
npx --yes audit-ci@7 --config .audit-ci.json ; echo "AUDIT=$?"
npm test ; echo "TESTS=$?"
npm run build ; echo "BUILD=$?"
```

Expected: every variable `=0`. Capture each exit code without a pipe — a piped command reports the last stage's status, not the command's.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: split into quality, test, and build jobs

The single serial job meant a 30-second lint error waited behind a
Postgres spin-up, and lint was never actually run in CI at all despite
the linter existing. quality now needs no database and fails fast.

test gains a Node 20.19 + 24 matrix, closing the drift between the CI pin
and the version actually developed on. Adds a concurrency group so
superseded runs are cancelled, and a least-privilege permissions block.

Cost is four npm ci runs versus one, and Postgres spun twice.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## PR 4 — Docker Compose for dev parity

### Task 11: Add the compose stack

`start-local-postgres.ps1` runs Postgres on port **55432** with database `ai_workout`. Compose matches that so `server/.env` needs only its password line changed. The two cannot run simultaneously.

**Files:**

- Create: `docker-compose.yml`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create `docker-compose.yml`**

The volume is named rather than bind-mounted to `.postgres-data`, which belongs to the PowerShell script.

```yaml
# Development dependencies only. The app itself is deliberately NOT
# containerised -- Vite and `node --watch` keep running natively so hot reload
# and the Windows workflow are preserved.
#
# Postgres publishes on 55432 to match server/scripts/start-local-postgres.ps1.
# The two are alternatives, not complements: same port, so they collide.
services:
  postgres:
    image: postgres:16
    container_name: ai-workout-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-ai_workout_dev}
      POSTGRES_DB: ai_workout
    ports:
      - "55432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d ai_workout"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: ai-workout-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  postgres-data:
```

- [ ] **Step 2: Confirm no native Postgres is holding the port**

```bash
powershell -Command "Test-NetConnection -ComputerName 127.0.0.1 -Port 55432 -InformationLevel Quiet -WarningAction SilentlyContinue"
```

If this prints `True`, a native Postgres already holds the port and compose will fail to bind. Stop
it first — the PowerShell helper starts `postgres.exe` against the repo-local data directory:

```bash
powershell -Command "& \"$env:POSTGRES_BIN_DIR\pg_ctl.exe\" stop -D .postgres-data"
```

If `POSTGRES_BIN_DIR` is unset, find the running process with
`powershell -Command "Get-Process postgres | Select-Object Id,Path"` and stop it from there. Do not
delete `.postgres-data` — it holds the native instance's data and is unrelated to the compose volume.

- [ ] **Step 3: Bring the stack up and wait for health**

```bash
docker compose up -d
docker compose ps
```

Expected: both services listed as `healthy`.

- [ ] **Step 4: Point the server at the container and migrate**

Update the `DATABASE_URL` line in `server/.env` to:

```text
DATABASE_URL=postgresql://postgres:ai_workout_dev@127.0.0.1:55432/ai_workout
```

Then apply migrations — the container starts empty:

```bash
npm -w server run migrate:postgres ; echo "EXIT=$?"
```

Expected: `EXIT=0`.

- [ ] **Step 5: Prove the app works against the container**

```bash
npm -w server run test
```

Expected: 750 tests passing.

- [ ] **Step 6: Document it in `README.md`**

Add above the existing local-Postgres instructions:

````markdown
### Local dependencies with Docker

```bash
docker compose up -d              # Postgres on 55432, Redis on 6379
npm -w server run migrate:postgres # the container starts empty
```

Then set in `server/.env`:

```text
DATABASE_URL=postgresql://postgres:ai_workout_dev@127.0.0.1:55432/ai_workout
```

Compose and `npm run postgres:local:start` both bind **55432** and are therefore
mutually exclusive — use one or the other, not both.

Redis is opt-in: the server falls back to in-memory sessions unless `REDIS_URL` is
set, so starting the container alone changes nothing. To use it, set
`REDIS_URL=redis://127.0.0.1:6379`.
````

- [ ] **Step 7: Note the collision in `CLAUDE.md`**

Under "Build & Test", after the server-only helpers block:

> `docker compose up -d` and `npm run postgres:local:start` both bind port 55432. They are
> alternatives, not complements. Compose starts an empty database, so
> `npm -w server run migrate:postgres` is required before the server will work.

- [ ] **Step 8: Verify formatting and commit**

```bash
npx prettier --check . ; echo "EXIT=$?"
```

Expected: `EXIT=0`.

```bash
git add docker-compose.yml README.md CLAUDE.md
git commit -m "build: add Docker Compose for Postgres and Redis

Dev-environment parity only -- the app is deliberately not containerised,
so Vite and node --watch keep running natively with hot reload intact.
This removes the dependency on a Windows-only PowerShell script for
bringing up a database.

Postgres publishes on 55432 to match start-local-postgres.ps1's
convention, which means the two collide and are documented as mutually
exclusive. The container starts empty, so migrations are a required step.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## PR 5 — Environment preflight validation

### Task 12: Build the environment validator (TDD)

This is a **preflight check, not a refactor of how env is read**. Every existing live `process.env` read stays exactly as it is, because `server/src/index.test.js` mutates `GEMINI_API_KEY` at runtime and `generateRoutes.js:150` reads it per request.

**Files:**

- Create: `server/src/services/envValidationService.test.js`
- Create: `server/src/services/envValidationService.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, test } from "vitest";
import { validateEnv } from "./envValidationService.js";

const validEnv = { DATABASE_URL: "postgresql://user:pw@127.0.0.1:55432/ai_workout" };

describe("validateEnv", () => {
  test("accepts a minimal valid environment", () => {
    expect(validateEnv(validEnv)).toEqual([]);
  });

  test("requires a database connection string", () => {
    const errors = validateEnv({});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("DATABASE_URL");
  });

  test("accepts POSTGRES_URL as the alternative", () => {
    expect(validateEnv({ POSTGRES_URL: "postgresql://user:pw@127.0.0.1:5432/db" })).toEqual([]);
  });

  test("does not require CLIENT_ORIGIN outside production", () => {
    expect(validateEnv({ ...validEnv, NODE_ENV: "development" })).toEqual([]);
  });

  test("requires CLIENT_ORIGIN in production", () => {
    const errors = validateEnv({ ...validEnv, NODE_ENV: "production" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("CLIENT_ORIGIN");
  });

  test("accepts CLIENT_ORIGINS in production", () => {
    const env = { ...validEnv, NODE_ENV: "production", CLIENT_ORIGINS: "https://example.com" };
    expect(validateEnv(env)).toEqual([]);
  });

  test("rejects a non-numeric PORT", () => {
    const errors = validateEnv({ ...validEnv, PORT: "not-a-number" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("PORT must be a number");
  });

  test("rejects an out-of-range PORT", () => {
    const errors = validateEnv({ ...validEnv, PORT: "70000" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("PORT must be <= 65535");
  });

  test("ignores optional numeric settings that are unset or blank", () => {
    expect(validateEnv({ ...validEnv, ARGON2_TIME_COST: "", EXTERNAL_API_RETRIES: undefined })).toEqual([]);
  });

  test("rejects a malformed upstream base URL", () => {
    const errors = validateEnv({ ...validEnv, WGER_BASE_URL: "not a url" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("WGER_BASE_URL");
  });

  test("rejects a Sentry sample rate outside 0..1", () => {
    const errors = validateEnv({ ...validEnv, SENTRY_TRACES_SAMPLE_RATE: "1.5" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("SENTRY_TRACES_SAMPLE_RATE");
  });

  test("reports every problem at once rather than stopping at the first", () => {
    const errors = validateEnv({ PORT: "abc", ARGON2_TIME_COST: "-1" });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  test("does not treat GEMINI_API_KEY as required", () => {
    expect(validateEnv({ ...validEnv, NODE_ENV: "production", CLIENT_ORIGIN: "https://x.com" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm -w server run test -- envValidationService
```

Expected: FAIL — cannot resolve `./envValidationService.js`.

- [ ] **Step 3: Write the implementation**

Connection strings are checked for presence only, never parsed as URLs — passwords routinely contain characters that break `new URL`. Only the HTTP base URLs are parsed.

```js
/**
 * Startup preflight for the process environment.
 *
 * This validates and reports; it does NOT capture or freeze values. Callers keep
 * reading process.env live, because index.test.js mutates GEMINI_API_KEY at
 * runtime and generateRoutes.js reads it per request.
 */

const NUMERIC_VARS = [
  { name: "PORT", min: 1, max: 65535 },
  { name: "SHUTDOWN_TIMEOUT_MS", min: 0 },
  { name: "REDIS_CONNECT_TIMEOUT_MS", min: 0 },
  { name: "API_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "API_RATE_LIMIT_MAX", min: 1 },
  { name: "AUTH_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "AUTH_RATE_LIMIT_MAX", min: 1 },
  { name: "GENERATE_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "GENERATE_RATE_LIMIT_MAX", min: 1 },
  { name: "ANON_GENERATE_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "ANON_GENERATE_RATE_LIMIT_MAX", min: 1 },
  { name: "ARGON2_TIME_COST", min: 1 },
  { name: "ARGON2_MEMORY_COST", min: 8 },
  { name: "ARGON2_PARALLELISM", min: 1 },
  { name: "ARGON2_HASH_LENGTH", min: 4 },
  { name: "DASHBOARD_COLLECTION_DEFAULT_LIMIT", min: 1 },
  { name: "DASHBOARD_COLLECTION_MAX_LIMIT", min: 1 },
  { name: "EXTERNAL_API_RETRIES", min: 0 },
  { name: "EXTERNAL_API_RETRY_BASE_DELAY_MS", min: 0 },
  { name: "EXTERNAL_CACHE_MAX_ENTRIES", min: 1 },
  { name: "EXTERNAL_CACHE_STALE_TTL_SEC", min: 0 },
  { name: "OPEN_METEO_CACHE_TTL_SEC", min: 0 },
  { name: "OPENAQ_CACHE_TTL_SEC", min: 0 },
  { name: "WGER_CACHE_TTL_SEC", min: 0 },
  { name: "MEALDB_CACHE_TTL_SEC", min: 0 },
  { name: "WGER_DEFAULT_LANGUAGE", min: 1 },
  { name: "SENTRY_SHUTDOWN_TIMEOUT_MS", min: 0 }
];

// Only HTTP endpoints are parsed. Postgres and Redis connection strings are
// checked for presence alone -- passwords routinely contain characters that
// make new URL() throw on a perfectly valid DSN.
const URL_VARS = [
  "OPEN_METEO_BASE_URL",
  "OPENAQ_BASE_URL",
  "WGER_BASE_URL",
  "MEALDB_BASE_URL"
];

const isBlank = (value) => value === undefined || value === null || String(value).trim() === "";

export const validateEnv = (env = {}) => {
  const errors = [];

  if (isBlank(env.DATABASE_URL) && isBlank(env.POSTGRES_URL)) {
    errors.push("DATABASE_URL (or POSTGRES_URL) is required.");
  }

  if (env.NODE_ENV === "production" && isBlank(env.CLIENT_ORIGIN) && isBlank(env.CLIENT_ORIGINS)) {
    errors.push("CLIENT_ORIGIN (or CLIENT_ORIGINS) is required when NODE_ENV=production.");
  }

  for (const { name, min, max } of NUMERIC_VARS) {
    if (isBlank(env[name])) continue;
    const value = Number(env[name]);
    if (!Number.isFinite(value)) {
      errors.push(`${name} must be a number (received "${env[name]}").`);
      continue;
    }
    if (min !== undefined && value < min) {
      errors.push(`${name} must be >= ${min} (received ${value}).`);
    }
    if (max !== undefined && value > max) {
      errors.push(`${name} must be <= ${max} (received ${value}).`);
    }
  }

  for (const name of URL_VARS) {
    if (isBlank(env[name])) continue;
    try {
      new URL(String(env[name]).trim());
    } catch {
      errors.push(`${name} must be a valid URL (received "${env[name]}").`);
    }
  }

  if (!isBlank(env.SENTRY_TRACES_SAMPLE_RATE)) {
    const rate = Number(env.SENTRY_TRACES_SAMPLE_RATE);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      errors.push(
        `SENTRY_TRACES_SAMPLE_RATE must be between 0 and 1 (received "${env.SENTRY_TRACES_SAMPLE_RATE}").`
      );
    }
  }

  return errors;
};
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm -w server run test -- envValidationService
```

Expected: 13 tests passing.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/envValidationService.js server/src/services/envValidationService.test.js
git commit -m "feat(server): add an environment preflight validator

Validates and reports; deliberately does not capture or freeze any value.
index.test.js imports app at module load and mutates GEMINI_API_KEY at
runtime, and generateRoutes.js reads it live per request, so a
validate-and-freeze design would break the suite and change documented
behaviour.

GEMINI_API_KEY stays optional -- the route already returns a per-request
500 when it is missing, and the README documents it that way.

Connection strings are checked for presence only. Passwords routinely
contain characters that make new URL() throw on a valid DSN, so only the
HTTP base URLs are parsed.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 13: Wire the preflight into startup

**Files:**

- Modify: `server/src/index.js`

- [ ] **Step 1: Add the import**

Alongside the other service imports near the top of `server/src/index.js`:

```js
import { validateEnv } from "./services/envValidationService.js";
```

- [ ] **Step 2: Replace the bootstrap guard at the end of the file**

The existing block is:

```js
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  startServer();
}
```

Replace it with:

```js
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  // Inside the existing test guard on purpose: the suite imports `app` from
  // this module and must never trip a fatal env check.
  const envErrors = validateEnv(process.env);
  if (envErrors.length > 0) {
    // process.stderr rather than the pino logger: LOG_LEVEL is itself
    // environment-derived, so the logger may not be trustworthy here.
    process.stderr.write(
      `Environment validation failed:\n${envErrors.map((line) => `  - ${line}`).join("\n")}\n`
    );
    process.exit(1);
  }
  startServer();
}
```

- [ ] **Step 3: Verify the full server suite is unaffected**

This is the critical check — the whole design rests on the guard keeping validation out of tests.

```bash
npm -w server run test
```

Expected: 750 tests passing, unchanged.

- [ ] **Step 4: Verify the preflight actually fires on a real boot**

```bash
node -e "process.env.DATABASE_URL='';process.env.POSTGRES_URL='';import('./server/src/index.js')" ; echo "EXIT=$?"
```

Expected: `EXIT=1` and a message listing `DATABASE_URL (or POSTGRES_URL) is required.`

- [ ] **Step 5: Verify a normal boot still works**

```bash
npm -w server run start &
sleep 3
curl -s http://localhost:5000/api/health
kill %1
```

Expected: JSON with `"status":"ok"`.

- [ ] **Step 6: Lint and commit**

```bash
npx eslint . ; echo "EXIT=$?"
```

Expected: `EXIT=0` — the `process.stderr.write` avoids the `no-console` rule.

```bash
git add server/src/index.js
git commit -m "feat(server): run the env preflight before starting

Placed inside the existing NODE_ENV/VITEST guard so it never runs under
the test runner. Verified: the 750-test server suite is unchanged, and a
real boot with DATABASE_URL unset now exits 1 with a readable message
instead of surfacing a Postgres driver error deep in startup.

Writes to process.stderr rather than the pino logger because LOG_LEVEL is
itself environment-derived.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

### Task 14: Add the tracked `.env.example`

**Files:**

- Create: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Create `.env.example`**

Defaults are copied from the README tables. No real secret appears here.

```text
# Copy to server/.env and fill in. Never commit the filled-in file.

# ---- Required ----------------------------------------------------------
DATABASE_URL=postgresql://postgres:ai_workout_dev@127.0.0.1:55432/ai_workout

# ---- Core --------------------------------------------------------------
PORT=5000
NODE_ENV=development
# Required when NODE_ENV=production. Comma-separated.
CLIENT_ORIGIN=http://localhost:5173

# ---- Postgres ----------------------------------------------------------
POSTGRES_STARTUP_REQUIRED=false
POSTGRES_SSL=false
POSTGRES_SSL_REJECT_UNAUTHORIZED=true

# ---- AI generation (optional; /api/generate 500s without it) -----------
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash

# ---- Sessions / Redis (optional; in-memory fallback when unset) --------
REDIS_URL=
REDIS_CONNECT_TIMEOUT_MS=10000
REDIS_STARTUP_REQUIRED=false

# ---- Lifecycle ---------------------------------------------------------
SHUTDOWN_TIMEOUT_MS=10000

# ---- Logging -----------------------------------------------------------
LOG_LEVEL=info
LOG_REDACT_PATHS=

# ---- Error tracking (optional) -----------------------------------------
SENTRY_DSN=
SENTRY_ENVIRONMENT=
SENTRY_RELEASE=
SENTRY_TRACES_SAMPLE_RATE=0
SENTRY_SHUTDOWN_TIMEOUT_MS=2000

# ---- Rate limiting -----------------------------------------------------
API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_WINDOW_MS=600000
AUTH_RATE_LIMIT_MAX=25
GENERATE_RATE_LIMIT_WINDOW_MS=600000
GENERATE_RATE_LIMIT_MAX=20
ANON_GENERATE_RATE_LIMIT_WINDOW_MS=86400000
ANON_GENERATE_RATE_LIMIT_MAX=3

# ---- Password hashing (Argon2id) ---------------------------------------
ARGON2_TIME_COST=3
ARGON2_MEMORY_COST=19456
ARGON2_PARALLELISM=1
ARGON2_HASH_LENGTH=32

# ---- Dashboard pagination ----------------------------------------------
DASHBOARD_COLLECTION_DEFAULT_LIMIT=50
DASHBOARD_COLLECTION_MAX_LIMIT=200

# ---- Upstream APIs -----------------------------------------------------
EXTERNAL_API_RETRIES=2
EXTERNAL_API_RETRY_BASE_DELAY_MS=250
EXTERNAL_CACHE_MAX_ENTRIES=500
EXTERNAL_CACHE_STALE_TTL_SEC=21600
OPEN_METEO_CACHE_TTL_SEC=300
OPENAQ_CACHE_TTL_SEC=180
OPENAQ_API_KEY=
WGER_CACHE_TTL_SEC=900
WGER_API_TOKEN=
WGER_DEFAULT_LANGUAGE=2
MEALDB_CACHE_TTL_SEC=900
```

- [ ] **Step 2: Confirm it is not ignored**

`.gitignore` contains `.env`, which could swallow this file.

```bash
git check-ignore -v .env.example ; echo "EXIT=$?"
```

Expected: `EXIT=1` (not ignored). **If it is ignored**, add `!.env.example` to `.gitignore` immediately after the `.env` line and re-check.

- [ ] **Step 3: Verify every example key is one the server reads**

Two read patterns exist and both must be covered. Most modules use `process.env.X` directly, but
`postgres.js:40` and `sessionService.js:126` take an injected `env` object and read `env.X` — a
`process.env`-only grep would falsely flag `POSTGRES_SSL`, `POSTGRES_SSL_REJECT_UNAUTHORIZED`, and
every `REDIS_*` key as unused.

```bash
grep -oE '^[A-Z_0-9]+' .env.example | sort -u > /tmp/example-keys.txt
grep -rhoE '(process\.)?env\.[A-Z_0-9]+' server/src | sed -E 's/.*env\.//' | sort -u > /tmp/code-keys.txt
echo "--- in example but never read by the server ---"
comm -23 /tmp/example-keys.txt /tmp/code-keys.txt
```

Expected: no output. Anything listed is a typo or a stale variable — remove it or fix the spelling.

- [ ] **Step 3b: Check the reverse direction too**

A variable the server reads but the template omits is the more dangerous gap, since that is the one
an operator will not know to set.

```bash
echo "--- read by the server but missing from .env.example ---"
comm -13 /tmp/example-keys.txt /tmp/code-keys.txt
```

Expected: only `NODE_ENV` and `VITEST` (both set by the runtime, not by an operator). Anything else
must be added to `.env.example`.

- [ ] **Step 4: Reference it from `README.md`**

In the Environment Variables section, above the first table:

> A complete template lives in [`.env.example`](.env.example). Copy it to `server/.env` and
> fill in the values. The server validates this environment at startup and reports every
> problem at once.

- [ ] **Step 5: Lint, format, and commit**

```bash
npx prettier --check . ; echo "EXIT=$?"
```

Expected: `EXIT=0`.

```bash
git add .env.example README.md .gitignore
git commit -m "docs: add a tracked .env.example

The only specification for the ~55 environment variables was a README
table that could drift from the code silently. Every key here is verified
against an actual process.env read in server/src.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## PR 6 — Repository hygiene

### Task 15: Add Dependabot, a PR template, and CODEOWNERS

**Files:**

- Create: `.github/dependabot.yml`
- Create: `.github/pull_request_template.md`
- Create: `CODEOWNERS`

- [ ] **Step 1: Create `.github/dependabot.yml`**

Updates are grouped so a weekly run produces two PRs rather than twenty.

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 5
    groups:
      minor-and-patch:
        update-types:
          - "minor"
          - "patch"
    ignore:
      # Majors change APIs; take them deliberately, not on a schedule.
      - dependency-name: "*"
        update-types: ["version-update:semver-major"]

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    groups:
      actions:
        patterns:
          - "*"
```

- [ ] **Step 2: Create `.github/pull_request_template.md`**

```markdown
## What changed

<!-- One or two sentences. What does this do, and why now? -->

## Verification

Paste the actual output, not a claim that it passed.

- [ ] `npm run lint` — exit 0
- [ ] `npm run format:check` — exit 0
- [ ] `npm test` — 655 client, 750 server, scripts green
- [ ] `npm run build` — exit 0

## Risk

<!-- What could this break, and how would you notice? Write "none" only if you checked. -->

## Notes for the reviewer

<!-- Anything non-obvious: a rejected alternative, a deliberate omission, a follow-up. -->
```

- [ ] **Step 3: Create `CODEOWNERS`**

```text
# Default owner for everything in the repository.
* @KevinN0004

# Tooling and CI changes are easy to get subtly wrong.
/.github/       @KevinN0004
/scripts/       @KevinN0004
/security/      @KevinN0004
```

- [ ] **Step 4: Validate the Dependabot YAML shape**

```bash
node -e "const t=require('node:fs').readFileSync('.github/dependabot.yml','utf8');if(!t.startsWith('version: 2'))throw new Error('bad version');console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 5: Format check and commit**

```bash
npx prettier --check . ; echo "EXIT=$?"
```

Expected: `EXIT=0`.

```bash
git add .github/dependabot.yml .github/pull_request_template.md CODEOWNERS
git commit -m "chore: add Dependabot, a PR template, and CODEOWNERS

Dependabot groups minor and patch updates so a weekly run produces two
PRs rather than twenty, and ignores majors -- those get taken
deliberately.

The PR template asks for pasted output rather than a checked box,
matching the repo's existing rule that evidence precedes assertions.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Final verification

Run after all six PRs have landed.

- [ ] `npx eslint .` — exit 0
- [ ] `npx prettier --check .` — exit 0
- [ ] `npm test` — 655 client, 750 server, 9 script tests passing
- [ ] `npm run build` — exit 0
- [ ] `npm audit` — no `qs` or `body-parser` findings; only the Prisma-chain advisories remain
- [ ] `npx audit-ci@7 --config .audit-ci.json` — exit 0, with no "Consider not allowlisting" notice
- [ ] `node scripts/check-audit-allowlist.mjs` — exit 0
- [ ] `docker compose up -d && npm -w server run migrate:postgres` — working dev database
- [ ] Booting with `DATABASE_URL` unset exits 1 with a readable message
- [ ] CI shows `quality`, `test (20.19)`, `test (24)`, and `build` all green
- [ ] `git blame` on a reformatted file attributes lines to their original commits
