# Claude Code Configuration - AI Workout

## Behavioral Rules (Always Enforced)

- Do what has been asked; nothing more, nothing less
- NEVER create files unless they're absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (*.md) or README files unless explicitly requested
- NEVER save working files, text/mds, or tests to the root folder
- Never continuously check status after spawning a swarm — wait for results
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files

### Verify before you assert

- **NEVER call code dead, unused, inert, or safe-to-delete from a single trace.** Grep
  every caller AND read its tests first. A clean run proves nothing about which inputs a
  function actually receives in the paths you didn't trace.
- **Run the test suite before reporting that a removal is safe**, not after. The gate is
  the evidence; a reasoned argument is only a hypothesis.
- **When presenting a decision, verify every premise you state in it.** Say "I checked X,
  I did not check Y" rather than a summary that implies both.
- **A finding repeated across commits and PRs is not thereby confirmed.** Re-verify before
  acting on your own earlier claim; repetition is not evidence.
- **Before blaming the codebase for a "structural" blocker, check your own recent commits.**
- **A piped command reports the LAST stage's exit code**, so `cmd | tail; echo $?` hides a
  failure. Redirect instead, or read `PIPESTATUS`, when gating on a result.

## Skill Auto-Trigger Rules

Before responding, check if the prompt matches any of these patterns and invoke the listed skill FIRST:

| Prompt contains                                                                           | Invoke this skill first                                 |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| bug, error, fail, broken, not working, exception, crash                                   | `superpowers:systematic-debugging`                      |
| build, create, add feature, implement (no existing spec)                                  | `superpowers:brainstorming`                             |
| plan, spec, design, how should we, architecture                                           | `superpowers:brainstorming`                             |
| review, PR, pull request, code review                                                     | `superpowers:requesting-code-review`                    |
| done, finished, complete, ready to merge, ship                                            | `superpowers:verification-before-completion`            |
| library, docs, how do I use, API syntax, framework                                        | `context7-mcp`                                          |
| find where, search codebase, where is, which files                                        | `codebase-memory-mcp`                                   |
| frontend, UI, component, CSS, React, page, layout                                         | `frontend-design`                                       |
| test, TDD, unit test, write tests                                                         | `superpowers:test-driven-development`                   |
| audit design, polish UI, critique layout, design anti-pattern, impeccable, /impeccable    | `impeccable`                                            |
| design system, UI style, ui-ux-pro-max, professional UI, reasoning rules                  | `ui-ux-pro-max`                                         |
| premium frontend, anti-slop, taste skill, boilerplate UI, generic design, design quality  | `taste`                                                 |
| font, typeface, Google Fonts, font pairing, typography selection, variable font           | `fonts`                                                 |
| mockup, wireframe, prototype, Stitch, generate UI design, design with AI                  | `stitch`                                                |
| component registry, 21st.dev, pre-built component, AI component, copy component           | `21st-dev`                                              |
| E2E test, end-to-end test, browser automation, Playwright, playwright test                | `playwright`                                            |
| install skill, add skill, skill manager, npx skills add, skillui                          | `skillui`                                               |
| find skill, discover skill, skill collection, awesome skills, browse skills               | `awesome-design`                                        |
| review PR, code review, check diff, pre-merge, before merging, review branch              | `github:code-review`                                    |
| build page, new component, landing page, dashboard page, UI for                           | `frontend-design`                                       |
| button, modal, form, card component, navbar, sidebar, table component                     | `ui-ux-pro-max`                                         |
| /frontend, run frontend workflow, design and implement, polish and verify                 | `/frontend` command — runs full 9-skill design workflow |

## File Organization

- NEVER save to root folder
- `client/src` — React 18 + Vite frontend source
- `server/src` — Express 4 API, services, routes
- `server/src/repositories` — **all Prisma data access lives here.** Routes and services
  call these; nothing else should touch `prisma.*` directly
- `server/prisma` — Prisma schema and migrations
- `server/scripts` — server operational scripts (local Postgres, migrations)
- `docs/` — documentation and plans
- `scripts/` — repo-level tooling (Claude Code hook targets live here)

## Project Architecture

AI Workout is a full-stack fitness planning app using **npm workspaces** (`client`, `server`).

- **Client**: React 18 + Vite, dev server on `http://localhost:5173`, proxies `/api` to the server
- **Server**: Express 4 on `http://localhost:5000`, Postgres via Prisma Client
- **Sessions**: Redis-backed when `REDIS_URL` is set, with in-memory fallback
- **AI**: Google Gemini (`GEMINI_API_KEY`) for weekly workout plan generation
- **Integrations**: cached fitness, meal, weather, and air-quality APIs
- **Tests**: Vitest on both sides

### Data access

All Postgres access goes through `server/src/repositories/`. There is one module per
concern — workout sessions, meal logs, progress metrics, saved exercises, generated
plans, the user row, and the paginated dashboard collections — plus two shared helpers:

- `userLookup.js` — `userIdWhere` / `getUserPk`. **Load-bearing.** Callers hold either
  the UUID primary key or the legacy string id depending on when the account and session
  were created, and both must resolve. Commit `19cc8ac` exists because a path assumed
  only the legacy id.
- `rowValues.js` — date and Decimal conversions shared by every mapper.

Two things to know before adding a write:

- **`upsert` usually is not available.** The uniqueness on these tables comes from
  *partial* unique indexes (`where legacy_id is not null`), which `schema.prisma` cannot
  express, so Prisma has no constraint to target. The repositories do an explicit
  read-then-write instead. This is deliberate, not an oversight.
- **Collection caps are applied on read, not in storage.** `userReadRepository` limits
  each collection with `take:`; nothing prunes the tables. A "capped list" is a read
  concern here.

This replaced a MongoDB-shaped compatibility shim (`services/prismaDataModels.js`),
retired in full — see `docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md`. If you
find `findOneAndUpdate`, `$set`, `$push` or `.lean()` anywhere in `server/src`, it is a
regression.

### External data: absent is not zero

Upstreams spell "no reading" three ways — an omitted key, an explicit `null`, and `""` —
and **`Number(null)` and `Number("")` are both `0`**. Any numeric coercion that converts
before testing turns missing data into a real-looking measurement.

**Guard absent input before `Number()`, never after.** `toFiniteNumber` in
`externalDataService.js` and `toNumberOrNull` in `repositories/rowValues.js` both do
this; copy that shape rather than writing a fresh coercion.

This is not hypothetical. Two shipped bugs came from it, both in health advice:

- a pm2.5 sensor reporting `null` was published as `0 ug/m3`, which scores **AQI 0** and
  told the user the air was clean
- a `null` weather code is code `0`, **"Clear sky"**, and a `null` temperature is `0 °C`,
  so a payload carrying no weather at all was reported as clear *and* too cold to train
  outdoors

`undefined` already behaved correctly, so an omitted key and an explicit `null` gave
opposite answers for the same missing data — which is what made it hard to see.

**Do not "fix" this with `!value`.** That swallows a genuine zero, and a measured zero is
a measurement: 0 °C really is below the cold gate. Range checks can mask the bug too —
`toPositiveInt` and `parseRedisPort` are safe only because `> 0` and a port range reject
the accidental `0`. Don't rely on that in new code.

Conventions:

- Keep files under 500 lines
- Validate user input at system boundaries
- Sanitize file paths to prevent directory traversal
- Server config is env-driven — see the Environment Variables table in `README.md`

## Build & Test

```bash
npm install              # from the repo root — workspaces install together

npm run dev              # client + server concurrently
npm run dev:client       # Vite client only
npm run dev:server       # Express server only (node --watch)

npm run build            # builds the CLIENT only
npm run start            # starts the server
npm test                 # client tests, then server tests (Vitest)
npm run test:coverage    # the same suites with a v8 coverage report
npm run lint             # eslint . across both workspaces
npm run lint:fix         # eslint . --fix
```

Server-only helpers (run from `server/`):

```bash
npm run postgres:local:start   # PowerShell helper for a workspace-owned local Postgres
npm run migrate:postgres       # apply Postgres migrations
npm run prisma:generate        # regenerate Prisma Client
npm run prisma:validate        # validate the schema
```

- ALWAYS run `npm test` and `npm run lint` after making code changes
- ALWAYS verify `npm run build` succeeds before committing
- **Coverage is measured, not estimated.** `npm run test:coverage`. Baseline on
  2026-09-05: server **70.8%** statements / 59.2% branches, client **53.9%** / 32.5%.
  Both configs measure all of `src/**` and exclude only the tests themselves, because a
  narrower `include` reports a better number rather than a truer one.
  - Do not infer coverage from whether a file has a neighbouring `*.test.js`. The
    repositories have almost none and sit near 95%, because the dashboard integration
    suites drive them; several 500-line view components have no test and sit at 0%.
  - Thin areas as of that baseline, worst first: `registerWgerRoutes.js` (13%),
    `mealDbRoutes.js` (15%), `middleware/errorHandler.js` (15%, and 0% branch — it is
    what masks 5xx detail, so it is worth more than its size), `registerWeatherRoutes.js`
    (44%), `authUserService.js` (56% / 32% branch). On the client, most of
    `pages/dashboard/*View.jsx` and `pages/home/components/*` are at 0%.
- **ESLint is scoped to defect classes, not style** — unused/undeclared identifiers,
  unreachable code, and React Hook contract violations. **There is deliberately no
  Prettier**, and no formatting rules: reflowing 27k lines would bury real findings. Do
  not add formatting rules or reformat files wholesale without asking.
- `eslint.config.js` ignores `.claude/**` and `.githooks/**`, but **does** lint `scripts/**`
- **Lint is clean: 0 errors and 0 warnings.** It used to carry 12
  `react-hooks/exhaustive-deps` warnings; those are resolved, and the three that were
  deliberate now carry an inline disable explaining why. A new warning means you
  introduced it.
- **`npm run build` is clean.** It used to emit a "chunks larger than 500 kB" warning;
  that went away when `jspdf` moved to a dynamic import. The main chunk is ~402 kB.
  If the warning reappears, something got pulled back onto the eager path.
- Server needs `server/.env` (`PORT`, `DATABASE_URL`, `CLIENT_ORIGIN`, `GEMINI_API_KEY`)
- Server tests need Postgres: `npm run postgres:local:start -w server` first, or ~40 of
  them fail with a connection error that is environmental, not a regression.

## Fresh Clone Setup

Tracked: `CLAUDE.md`, `.mcp.json`, `scripts/`, `.githooks/pre-commit`, and
`.claude/settings.json` (the hook wiring).
Not tracked: `.claude/agents/`, `commands/`, `helpers/`, `skills/` — claude-flow scaffolding.

The pre-commit hook is in the repo; only its activation is not, which is what the
`core.hooksPath` line below sets.

**15 of the 19 configured hooks, plus the status line, invoke `.claude/helpers/*`, which is
not in the repo.** Regenerate the scaffolding after cloning:

```bash
npx ruflo@latest init                 # regenerate .claude/agents|commands|helpers|skills
git config core.hooksPath .githooks   # activate the repo's pre-commit guard
```

The second line is required: `core.hooksPath` lives in `.git/config`, which is not part of
the repository, so a clone does not run `.githooks/pre-commit` until it is set.

Then confirm the wiring actually fires. A missing or broken hook here fails **silently** —
it will not announce itself, so check exit codes directly rather than assuming:

```bash
node .claude/helpers/hook-handler.cjs status   # expect exit 0
node scripts/codex-handoff.mjs --hook          # expect exit 0
node scripts/scrub-junk-files.js --dry-run     # expect exit 0
echo '{"prompt":"fix a bug"}' | node scripts/skill-router.mjs
```

Capture exit codes without a pipe (`cmd >/dev/null 2>&1; echo $?`) — a piped command
reports the last stage's status, not the command's.

If `npx ruflo@latest init` overwrites `.claude/settings.json`, its permission allowlist is
hand-trimmed and worth keeping: restore with `git checkout -- .claude/settings.json`.

## Security Rules

- NEVER hardcode API keys, secrets, or credentials in source files
- NEVER commit `.env` files or any file containing secrets — `server/.env` holds the
  Gemini key and the Postgres connection string
- Always validate user input at system boundaries
- Always sanitize file paths to prevent directory traversal

## Concurrency: 1 MESSAGE = ALL RELATED OPERATIONS

- All operations MUST be concurrent/parallel in a single message
- Use Claude Code's Agent tool for spawning agents, not just MCP
- ALWAYS spawn ALL agents in ONE message with full instructions via Agent tool
- ALWAYS batch ALL file reads/writes/edits in ONE message
- ALWAYS batch ALL Bash commands in ONE message

## Swarm Orchestration

- MUST initialize the swarm using CLI tools when starting complex tasks
- MUST spawn concurrent agents using Claude Code's Agent tool
- Never use CLI tools alone for execution — Agent tool agents do the actual work
- ALWAYS use `run_in_background: true` for all Agent tool calls
- After spawning, STOP — do NOT add more tool calls or check status

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

### Project Config

- **Topology**: hierarchical-mesh
- **Max Agents**: 15
- **Memory**: hybrid

### 3-Tier Model Routing

| Tier  | Handler              | Use Cases                                           |
| ----- | -------------------- | --------------------------------------------------- |
| **1** | Agent Booster (WASM) | Simple transforms — use the Edit tool, skip the LLM |
| **2** | Haiku                | Simple tasks, low complexity (<30%)                 |
| **3** | Sonnet/Opus          | Complex reasoning, architecture, security (>30%)    |

## MCP Tools

Discover with `ToolSearch("keyword")`. Configured servers are in `.mcp.json`:
`context7` (library docs), `codebase-memory-mcp` (structural code search), `ruflo`
(swarm, memory, hooks).
