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
```

Server-only helpers (run from `server/`):

```bash
npm run postgres:local:start   # PowerShell helper for a workspace-owned local Postgres
npm run migrate:postgres       # apply Postgres migrations
npm run prisma:generate        # regenerate Prisma Client
npm run prisma:validate        # validate the schema
```

- ALWAYS run `npm test` after making code changes
- ALWAYS verify `npm run build` succeeds before committing
- **Lint/format tooling is not wired up yet** — ESLint and Prettier are planned but not
  installed, and neither workspace has a `lint` script. Do not invoke `npm run lint` until
  one exists; update this section when it lands.
- `npm run build` emits a "chunks larger than 500 kB" warning. That is pre-existing and
  not a failure — the build exits 0. Don't treat it as a regression.
- Server needs `server/.env` (`PORT`, `DATABASE_URL`, `CLIENT_ORIGIN`, `GEMINI_API_KEY`)

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
