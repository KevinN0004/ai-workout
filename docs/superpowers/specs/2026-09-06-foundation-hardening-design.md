# Foundation Hardening Design

**Date:** 2026-09-06
**Status:** Approved design, pending implementation plan.

**Goal:** Raise the project's tooling floor — dev-environment parity via Docker Compose, Prettier, an
expanded (still defect-scoped) ESLint, a restructured CI with a real dependency-security gate, and
boot-time environment validation.

---

## Baseline

Measured on this machine before any change. These are the numbers the plan must not regress.

| Check | Result |
| --- | --- |
| `npx eslint .` | exit 0 |
| Client suite | 33 files, **655 tests** passing |
| Server suite | 32 files, **750 tests** passing (against local Postgres on 55432) |
| Dev Node | **v24.14.1** |
| `npm audit` | 6 vulnerabilities — 2 moderate, 4 high |

The linter passes today, so CI adopting it is a pure gate addition with no cleanup backlog.

---

## Research Findings

Verified by running the commands, not inferred. Each drives a decision below.

### 1. `npm audit fix` does not fix the `qs` advisory — it downgrades and achieves nothing

The vulnerable `qs` range is `2.2.5 – 6.15.3`; the fix landed in **6.16.0**. Dependency ranges:

| Package | `qs` range | Vulnerable? |
| --- | --- | --- |
| `body-parser@1.20.6` (current) | `~6.15.1` → 6.15.3 | yes |
| `body-parser@1.20.4` (what `audit fix` installs) | `~6.14.0` | **yes** |
| `express@4.22.1` (current) | `~6.14.0` | yes |
| `express@4.22.2` (latest v4) | `~6.15.1` | yes |

`npm audit fix --dry-run` reports `change body-parser 1.20.6 => 1.20.4`, a **downgrade**, and the
post-fix audit still reports all 6 vulnerabilities. **No Express 4 release reaches a patched `qs`**,
because every `~6.14` / `~6.15` range excludes 6.16.0.

The fix is an npm `overrides` entry. Verified in an isolated sandbox (`express` plus
`overrides: {"qs":"^6.16.0"}`):

```text
`-- express@4.22.2
  +-- body-parser@1.20.6
  | `-- qs@6.16.0 deduped
  `-- qs@6.16.0
found 0 vulnerabilities
```

### 2. The 4 high advisories are two roots, both in the Prisma CLI chain

Not one root, as an early reading suggested. `prisma@7.10.0` (a **devDependency**) pulls both:

- `mysql2` — `GHSA-3f6p-5ww8-9rcr`, `GHSA-rgwj-5xj2-c3m3`
- `deepmerge-ts` via `@prisma/config` — `GHSA-ggr8-5vv4-36mx`

This app never talks to MySQL, and the CLI does not ship to production runtime. npm's remedy is
`prisma@6.19.3` — a **downgrade** from 7.10 and a breaking change. Rejected. Both roots go in an
`audit-ci` allowlist instead.

Note: `npm audit --omit=dev` returns the identical 6 findings here, so a prod-only flag does **not**
filter the CLI chain. The exclusion has to be explicit.

### 3. Boot-time env validation must live inside the existing test seam

`server/src/index.js:757` already guards bootstrap:

```js
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
```

This matters because `server/src/index.test.js:2` imports `app` from `index.js` at module load, and
lines 249 and 509 mutate `process.env.GEMINI_API_KEY` **at runtime**, relying on
`server/src/routes/generateRoutes.js:150` reading `process.env` live per request.

A "validate once at boot, freeze into a config object" refactor would break both tests and change
documented behavior. Validation therefore goes **inside the line-757 guard** and is a **preflight
check, not a refactor of how env is read**.

### 4. `GEMINI_API_KEY` is optional by design

`generateRoutes.js:150-151` returns a per-request `500 {"error":"Missing GEMINI_API_KEY."}`, and the
README documents the key as merely "Enables `/api/generate`". Making it boot-fatal in production
would be an unrequested behavior change that could break a running deploy. It stays optional.

### 5. Prettier's footprint is repo-wide, but printWidth 100 is still correct

Line-length distribution across `client/src` + `server/src` (36,898 lines):

| p50 | p90 | p95 | p99 | max | >100 chars | >80 chars |
| --- | --- | --- | --- | --- | --- | --- |
| 29 | 73 | 81 | 96 | 774 | 201 | 1,906 |

printWidth 100 rewraps only 201 lines; printWidth 80 would touch 1,906. But Prettier's other
normalizations reach much further — measured by formatting a copy of the tree and diffing:

- **174 of 188 files** changed (93%)
- **10,447 lines** changed (8,204 client + 2,243 server), roughly 28% of the codebase

The small rewrap count does **not** imply a small diff. This is what `.git-blame-ignore-revs` is for.

### 6. Zero circular dependencies

`madge --circular` across 251 files: **no circular dependency found**. `import/no-cycle` can
therefore ship as `error` immediately — it costs zero findings today and is a pure regression guard.

### 7. `no-console` is nearly free

`console.*` outside tests: **1** occurrence in `server/src`, **0** in `client/src`. The rule locks in
a property the codebase already has (pino is the server logger).

### 8. `engines: ">=20"` is wrong

| Package | Required Node |
| --- | --- |
| `vite@7` | `^20.19.0 \|\| >=22.12.0` |
| `prisma@7` | `^20.19 \|\| ^22.12 \|\| >=24.0` |
| `vitest@4` | `^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0` |

The current `>=20` permits Node 20.0–20.18, which Vite and Prisma both reject. Correct floor:
`^20.19 || ^22.12 || >=24`. Note Vitest excludes odd-numbered Node 23.

### 9. Local Postgres uses a non-standard port and injects its own `DATABASE_URL`

`server/scripts/start-local-postgres.ps1` runs on port **55432** (not 5432), database `ai_workout`,
user `postgres`, with a random password written to `.postgres-pw` — and it **rewrites `DATABASE_URL`
into `server/.env`**. Compose must match the port to be a drop-in swap, and the two cannot run
simultaneously.

---

## Scope

**In:** Docker Compose for dev parity · Prettier (big-bang) · ESLint expansion · CI restructure with
audit gate · env preflight validation and `.env.example` · Dependabot, PR template, CODEOWNERS.

**Out** (decided, recorded so it is not silently reintroduced):

- Production Dockerfile / containerizing the app
- lint-staged pre-commit hook
- Coverage thresholds and ratchet
- Prisma↔SQL unique-index drift (7 missing `@@unique`) — still open from the 2026-08-05 plan
- Express 4 → 5 migration
- `.dockerignore` — meaningless with no image build

---

## Design

### 1. Docker Compose — dev parity only

`docker-compose.yml` at repo root with **two services**: `postgres:16` and `redis:7-alpine`. The
application is **deliberately not containerized** — Vite and `node --watch` keep running natively,
preserving hot reload and the existing Windows workflow.

- Postgres publishes on **55432**, database `ai_workout`, user `postgres`, matching the PowerShell
  script's convention so `server/.env` needs only its password line updated.
- Compose and `start-local-postgres.ps1` are **alternatives, not complements** — same port, so they
  collide if both run.
- Bringing up a fresh container requires `npm -w server run migrate:postgres`; the container starts
  empty.
- Redis is opt-in at the app layer: the server falls back to in-memory sessions unless `REDIS_URL` is
  set, so starting the container alone changes nothing.
- CI keeps its existing `services:` block and is untouched by this.

### 2. Prettier — big-bang with blame quarantine

Config matched to observed house style: double quotes, semicolons, 2-space indent, `printWidth: 100`.

Scope: `js`, `jsx`, `json`, `yml`. **`.md` is excluded** — formatting it would inflate the diff with
the two tracked plan docs and the README for no defect-class benefit.

Three commits, deliberately separated:

1. Add `.prettierrc`, `.prettierignore`, and `eslint-config-prettier`. No reformat.
2. The reformat. Nothing else in the commit.
3. Record commit 2's SHA in `.git-blame-ignore-revs`.

`.prettierignore` covers `node_modules`, `client/dist`, `.claude/**`, `.postgres-data`, and
`package-lock.json`.

**`.git-blame-ignore-revs` is inert locally** until
`git config blame.ignoreRevsFile .git-blame-ignore-revs` is run. GitHub honors it automatically;
local git does not. This goes in CLAUDE.md's "Fresh Clone Setup" alongside the existing
`core.hooksPath` note — it is the same class of silent-failure gotcha.

`eslint-config-prettier` is close to a no-op today (the config carries no stylistic rules beyond what
`js.configs.recommended` implies), but it prevents a future rule from fighting the formatter.

### 3. ESLint expansion — still defect-scoped

No style rules; Prettier owns formatting. Added:

| Rule | Current violations | Rationale |
| --- | --- | --- |
| `import/no-cycle` (**error**) | 0 | Pure regression guard; madge confirms zero cycles |
| `import/no-unresolved` (**error**) | confirm on first run | Catches broken ESM specifiers |
| `no-console` (**error**) | 1 (server) | pino is the logger; locks in existing property |
| `react/jsx-key` (**error**) | confirm on first run | Real defect class, currently unchecked |
| `react/no-unstable-nested-components` (**error**) | confirm on first run | Remount/perf defect class |

Also add `"type": "module"` to the root `package.json` — the lint run currently emits
`MODULE_TYPELESS_PACKAGE_JSON` for `eslint.config.js`.

Any rule whose first run produces violations is triaged in that PR: fix if small, downgrade to `warn`
with a recorded count if not. No rule lands silently disabled.

### 4. CI restructure

Three jobs replacing today's single serial `test-and-build`:

| Job | Postgres | Contents |
| --- | --- | --- |
| `quality` | no | `eslint .` · `prettier --check` · `audit-ci` |
| `test` | yes | Matrix Node **20.19** and **24**; prisma generate → migrate → client tests → server tests |
| `build` | no | Client build |

- `quality` needs no database and fails in well under a minute, so a lint typo no longer waits behind
  a Postgres spin-up.
- `concurrency` group cancels superseded runs on force-push.
- Least-privilege `permissions:` block for `GITHUB_TOKEN`.
- `.nvmrc` = **24** (the version actually developed on), `engines` = `^20.19 || ^22.12 || >=24` (the
  supported floor), CI matrix covers both ends.

**Cost, stated plainly:** 4 `npm ci` runs versus 1 today, and Postgres spun up twice. Accepted in
exchange for fast-failing quality checks and real Node-version coverage.

**Audit gate.** `audit-ci` fails on high/critical, with `.audit-ci.jsonc` allowlisting the three
Prisma-chain advisories (`GHSA-3f6p-5ww8-9rcr`, `GHSA-rgwj-5xj2-c3m3`, `GHSA-ggr8-5vv4-36mx`), each
with a reason. The review date in that file is **convention only — `audit-ci` does not enforce
expiry.** The implementation plan must pick one of: accept it as a comment, or add a CI step that
actually fails once the date passes. It must not imply enforcement that does not exist.

The `qs` advisory is **fixed, not allowlisted**, via root `overrides: { "qs": "^6.16.0" }`.

### 5. Env preflight validation and `.env.example`

The server reads roughly **55 distinct environment variables** (49 via literal `process.env.X`, plus
6 Redis keys read through `sessionService.initSessionStore(env = process.env)`).

**Design:** a `validateEnv(env)` module invoked from inside the `index.js:757` guard. It is a
**startup preflight check** — it reports and exits; it does **not** change how any value is read.
Every existing live `process.env` read stays exactly as-is.

Consequences of that choice:

- It never runs under Vitest, so the 750 server tests are untouched.
- `GEMINI_API_KEY` stays optional with its per-request 500.
- Tests that mutate `process.env` at runtime keep working.

Tiering:

| Tier | Vars | Behavior |
| --- | --- | --- |
| Hard-required | `DATABASE_URL` | Fatal when absent outside test |
| Production-required | `CLIENT_ORIGIN` / `CLIENT_ORIGINS` | Fatal only when `NODE_ENV=production` |
| Typed with defaults | Ports, timeouts, rate-limit windows, Argon2 costs | Coerced and range-checked; bad values fatal |
| Optional passthrough | Sentry, external API base URLs, `GEMINI_API_KEY` | Unvalidated |

Failure mode: one readable message listing **every** problem at once, then exit — replacing today's
missing-`DATABASE_URL`-as-a-deep-driver-error.

`.env.example` is tracked and lists every variable with a safe placeholder. `server/.env` stays
gitignored.

### 6. Repo hygiene

Dependabot (`npm` and `github-actions`, weekly, minor/patch grouped to limit PR noise),
`.github/pull_request_template.md`, `CODEOWNERS`.

---

## Sequencing

| PR | Contents | Why here |
| --- | --- | --- |
| 1 | Prettier + ESLint config, `type: module` | No reformat; keeps config reviewable |
| 2 | The reformat + `.git-blame-ignore-revs` | Isolated so the SHA can be quarantined |
| 3 | CI restructure, `.nvmrc`, `engines` fix, audit gate, `qs` override | Must follow 2, or `prettier --check` fails on arrival. All Node-version work lands together so `engines`, `.nvmrc`, and the CI matrix never disagree |
| 4 | Docker Compose | Independent |
| 5 | Env preflight + `.env.example` | Independent |
| 6 | Dependabot, PR template, CODEOWNERS | Independent |

PR 2 conflicts with any in-flight branch. Land it when nothing else is open.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| `qs` override also forces `supertest → superagent → qs 6.14.2` up to 6.16.0 | Semver-minor, but unproven — gate PR 3 on the full 1,405-test suite |
| Compose and the PowerShell script collide on port 55432 | Documented as mutually exclusive |
| The 10,447-line reformat conflicts with open branches | Land PR 2 against a quiet tree |
| `quality` job runs without `prisma generate` | `import/no-unresolved` should resolve `@prisma/client` from the package, not the generated client — confirm on first run |
| `.git-blame-ignore-revs` silently inert locally | Documented in CLAUDE.md Fresh Clone Setup |

---

## Verification Summary

On completion, all of the following must hold:

- `npx eslint .` exits 0
- `npx prettier --check` exits 0
- Client suite: 655 tests passing (no regression)
- Server suite: 750 tests passing (no regression)
- `npm run build` exits 0 (the "chunks larger than 500 kB" warning is pre-existing, not a failure)
- `npm audit` reports **no** `qs` or `body-parser` findings; only the three allowlisted Prisma-chain
  advisories remain
- `docker compose up -d` followed by `npm -w server run migrate:postgres` yields a working dev
  database
- Starting the server with `DATABASE_URL` unset produces a single readable error listing all problems
- CI: `quality`, `test` (Node 20.19 and 24), and `build` all green
