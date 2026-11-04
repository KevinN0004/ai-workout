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

| Prompt contains                                                                          | Invoke this skill first                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| bug, error, fail, broken, not working, exception, crash                                  | `superpowers:systematic-debugging`                      |
| build, create, add feature, implement (no existing spec)                                 | `superpowers:brainstorming`                             |
| plan, spec, design, how should we, architecture                                          | `superpowers:brainstorming`                             |
| review, PR, pull request, code review                                                    | `superpowers:requesting-code-review`                    |
| done, finished, complete, ready to merge, ship                                           | `superpowers:verification-before-completion`            |
| library, docs, how do I use, API syntax, framework                                       | `context7-mcp`                                          |
| find where, search codebase, where is, which files                                       | `codebase-memory-mcp`                                   |
| frontend, UI, component, CSS, React, page, layout                                        | `frontend-design`                                       |
| test, TDD, unit test, write tests                                                        | `superpowers:test-driven-development`                   |
| audit design, polish UI, critique layout, design anti-pattern, impeccable, /impeccable   | `impeccable`                                            |
| design system, UI style, ui-ux-pro-max, professional UI, reasoning rules                 | `ui-ux-pro-max`                                         |
| premium frontend, anti-slop, taste skill, boilerplate UI, generic design, design quality | `taste`                                                 |
| font, typeface, Google Fonts, font pairing, typography selection, variable font          | `fonts`                                                 |
| mockup, wireframe, prototype, Stitch, generate UI design, design with AI                 | `stitch`                                                |
| component registry, 21st.dev, pre-built component, AI component, copy component          | `21st-dev`                                              |
| E2E test, end-to-end test, browser automation, Playwright, playwright test               | `playwright`                                            |
| install skill, add skill, skill manager, npx skills add, skillui                         | `skillui`                                               |
| find skill, discover skill, skill collection, awesome skills, browse skills              | `awesome-design`                                        |
| review PR, code review, check diff, pre-merge, before merging, review branch             | `github:code-review`                                    |
| build page, new component, landing page, dashboard page, UI for                          | `frontend-design`                                       |
| button, modal, form, card component, navbar, sidebar, table component                    | `ui-ux-pro-max`                                         |
| /frontend, run frontend workflow, design and implement, polish and verify                | `/frontend` command — runs full 9-skill design workflow |

## File Organization

- NEVER save to root folder
- `client/src` — React 19 + Vite frontend source. The only files at this level are
  `main.jsx` and `App.jsx` (their tests are in `client/src/__tests__/`); global CSS is in
  `client/src/styles/`
- `client/src/pages/<page>` — one folder per page: the page component
  (`<Name>Page.jsx` and its `.css`) plus its own parts, usually `views/`, `components/`,
  `hooks/` and `styles/`. The larger pages also hold feature folders
  (`dashboard/meal/`, `dashboard/settings/`, `dashboard/tips/`) and page-level helpers
  (`dashboard/planUtils.js`). A folder here is a **route**: something only one page
  renders lives inside that page, which is why the preview walkthrough (a stage of
  `HomePage`, not a route) is `home/preview/` and the physique silhouette (drawn only
  by `HomeVisualizerStage`) is `home/components/PhysiqueSilhouette2D.jsx`, with its
  geometry in `home/components/physique/`. `client/src/components/`
  and `client/src/hooks/` hold only shared code: used from more than one page, or by
  another shared module (`useBodyScrollLock` serves `ModalPortal`). Images follow the
  same rule, in an `assets/` folder inside the area that owns them
  (`client/src/app/assets/planner-thumbs/`,
  `client/src/pages/home/components/physique/assets/`); there is no top-level
  `client/src/assets/`.
  Folder names are lowercase, kebab-case where needed (`workout-result/`)
- `server/src` — Express 5 API, services, routes. Only the app bootstrap
  (`index.js`, `corsPolicy.js`, `shutdown.js`, `staticClient.js`) stays at this level
- `server/src/services/<domain>` — `auth/`, `dashboard/`, `external/`, `http/`
  (request validation, API schemas, error responses), `planning/` (the rule-based plan
  generator) and `platform/` (metrics, error tracking, health, env validation)
- `server/src/db` — the Postgres pool, the Prisma client and the migration runner
- `server/src/repositories` — **all Prisma data access lives here.** Routes and services
  call these; nothing else should touch `prisma.*` directly
- `server/prisma` — the Prisma schema
- `server/db/postgres` — the SQL migrations, applied in order by `migrate:postgres`
- `server/scripts` — server operational scripts (local Postgres, migrations)
- **Tests live in a `__tests__/` folder beside the code they cover** —
  `views/__tests__/MealView.test.jsx` tests `views/MealView.jsx`. Every test config
  (Vitest, ESLint, coverage, knip) finds tests by the `*.test.*` name, not the folder,
  so a new `__tests__/` needs no config change. `e2e/` is the exception: it is already
  a test-only folder
- `docs/plans` — implementation plans, one file per effort, named `YYYY-MM-DD-name.md`
- `docs/specs` — design specs, named to match the plan they belong to
- `docs/adr` — decision records, one file per decision, named `NNNN-name.md` and listed in
  `docs/adr/README.md`. A record holds why a rule in this file exists: the rule stays here
  in a few lines and points at its record, and the story, the measurements and the history
  go in the record. `scripts/__tests__/repo-invariants.test.mjs` checks that every record
  path named in the repository exists, and holds this file under `CLAUDE_MD_MAX_BYTES`
- `scripts/` — repo-level tooling (Claude Code hook targets live here)
- `security/` — the audit-ci allowlist (`audit-ci.json`), the advisory reviews it is
  checked against, and the gitleaks config (`gitleaks.toml`), whose allowlist names
  fixture values, never paths
- The root holds only what a tool requires there. `CODEOWNERS` is in `.github/`, and
  `.vscode/settings.json` hides generated output from the file tree

## Project Architecture

AI Workout is a full-stack fitness planning app using **npm workspaces** (`client`, `server`).

- **Client**: React 19 + Vite, dev server on `http://localhost:5173`, proxies `/api` to the server
- **Server**: Express 5 on `http://localhost:5000`, Postgres via Prisma Client
- **Sessions**: in Redis when `REDIS_URL` (or `REDIS_HOST` and `REDIS_PORT`) is set and Redis connects at startup, otherwise in memory. The store is chosen once: while Redis is the store, a failed session command answers 503 and never falls back to memory; a command Redis accepts and never answers fails at a 2 s deadline, the same 503 (`services/auth/sessionService.js`)
- **Plans**: built by rules (`services/planning/`); Gemini (`GEMINI_API_KEY`, optional) writes the coach notes
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

Three things to know before adding a write:

- **`upsert` usually is not available.** The uniqueness on these tables comes from
  _partial_ unique indexes (`where legacy_id is not null`), which `schema.prisma` cannot
  express, so Prisma has no constraint to target. The repositories do an explicit
  read-then-write instead. This is deliberate, not an oversight.
- **Collection caps are applied on read, and only plans are pruned.** `userReadRepository`
  limits each collection with `take:`. After each save, the generate route deletes the
  user's plans past the same 200 (`pruneGeneratedPlans`, in the read's own order), which no
  route can read. Nothing prunes the rest: the paginated routes reach sessions, meals and
  metrics past their caps, so pruning those would delete visible history. A foreign key to
  a plan must be `ON DELETE SET NULL`.
- **A write derived from other rows takes a lock.** `syncDerivedCalorieEntry` sums the
  day's meals, and two saves in their own transactions each miss the other's uncommitted
  meal, so it first takes `pg_advisory_xact_lock` keyed on the user. Not `FOR UPDATE` on
  `app_users`: each meal insert already holds a key-share lock on that row through its
  foreign key, and two saves asking for `FOR UPDATE` deadlock (measured). The manual
  calorie save, `saveCalorieEntry`, takes the same lock (`lockUserCalorieWrites` in
  `mealLogRepository.js`, the one place the key is written), because it removes the
  day's derived entry: unlocked, a meal and a manual entry saved at once each miss the
  other's uncommitted row, and both land.

This replaced a MongoDB-shaped compatibility shim (`services/prismaDataModels.js`),
retired in full — see `docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md`. If you
find `findOneAndUpdate`, `$set`, `$push` or `.lean()` anywhere in `server/src`, it is a
regression.

### External data: absent is not zero

Upstreams spell "no reading" three ways — an omitted key, an explicit `null`, and `""` —
and **`Number(null)` and `Number("")` are both `0`**. Any numeric coercion that converts
before testing turns missing data into a real-looking measurement.

**Guard absent input before `Number()`, never after.** `toFiniteNumber` and
`weatherCodeToText` in `externalDataService.js`, and `toNumberOrNull` in
`repositories/rowValues.js`, all do this; copy that shape rather than writing a fresh
coercion. On the client, `toNumberOrNull` in `app/units.js` is that shape: import it.

**Guarding the converter does not protect a caller that bypasses it.** When you fix one of
these, grep for every caller of the helper and check what each passes in.

**Do not "fix" this with `!value`.** That swallows a genuine zero, and a measured zero is
a measurement: 0 °C really is below the cold gate.

**The invariant is asserted, not just described.**
`server/src/__tests__/numericCoercion.contract.test.js` and its client counterpart
enumerate every numeric helper and pin three things: that `null`, `""` and `undefined` all
agree, that a non-numeric string is absent, and that a measured `0` survives. **Add a row
when you add a helper.** Each row declares whether zero is meaningful for its helper, and
`toNumberInput` keeps `undefined` and `null` apart on purpose, because it feeds
`z.preprocess`.

Three shipped bugs in health advice came from this class, among them a `null` PM2.5
reading published as AQI 0, and it has been found five times;
[0001](docs/adr/0001-absent-is-not-zero.md) records each instance and what let it survive.
Before changing the air-quality route, read [0002](docs/adr/0002-us-aqi-from-the-nowcast.md),
on scoring the US AQI as the EPA NowCast of hourly PM2.5, and
[0003](docs/adr/0003-picking-the-openaq-station.md), on picking the station and bounding
the cache.

### Conventions

- **File length is a smell, not a limit.** What matters is how many _things_ a file is,
  not how long it is. Reach for a split when a file grows a second unrelated reason to
  change, or when something worth testing can only be reached by booting the whole app,
  and leave a long file that is one exported thing plus its private helpers
  ([0004](docs/adr/0004-file-length-is-a-smell.md)).

- **Comments and in-file order follow `docs/code-readability-sop.md`**: a header first in
  every source file, a prose `/** */` summary on every export, one line on every effect,
  and present-tense reasons rather than history. `scripts/__tests__/repo-invariants.test.mjs`
  fails on a source file without a header unless `file-header-allowlist.json` lists it,
  and on any header over four lines of text. That list is empty and only shrinks, and
  `ALLOWLIST_SIZE` in the test pins its length — never add to it.
- **Type checking is per file, through JSDoc**
  ([0017](docs/adr/0017-type-checking-through-jsdoc.md)). A file is checked when
  `// @ts-check` is on its own line below its header, before the first statement:
  TypeScript ignores it anywhere else, silently. Checking a file raises
  `TYPE_CHECKED_FILES` in `repo-invariants.test.mjs`, and in a checked file every parameter
  the checker cannot infer gets a `@param {Type}` (`docs/code-readability-sop.md`, rule 2).
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
npm test                 # scripts/ tests, then client, then server (Vitest)
npm run test:scripts     # the scripts/ tests only: repo invariants, the header ratchet
npm run test:coverage    # the same suites with a v8 coverage report
npm run test:e2e         # Playwright smoke suite (NOT part of `npm test`)
npm run test:e2e:ui      # the same suite in Playwright's UI mode
npm run knip             # unused files, exports and dependencies (exit 0 = clean)
npm run typecheck        # tsc, strict, over each workspace's `// @ts-check` files
npm run lint             # eslint . across both workspaces
npm run lint:fix         # eslint . --fix
```

**A client test can import server modules directly, and the contract tests do.** Vitest
resolves a relative `server/src/...` path from a client test, so a contract between the two
sides is asserted without a browser or a database: `app/__tests__/constants.test.js`,
`app/__tests__/profileContract.test.js`, `app/__tests__/planPayload.contract.test.js` and
`__tests__/serverBounds.contract.test.jsx`. Keep such imports to test files.

**Otherwise the E2E suite is the only thing that runs both halves together**, and it is
deliberately tiny: sign up, log a workout, reload, confirm it survived. Five things to know
before touching it ([0005](docs/adr/0005-testing-across-the-wire.md) has the history):

- **It runs against the built bundle** via `vite preview` on 4173, so
  `npm -w client run build` comes first, and `client/vite.config.js` carries a separate
  `preview.proxy`.
- **There are two projects, and the split is load-bearing.** `deployable` points a browser
  at the express origin (5000), which is what deploys and the only origin where the headers
  express sets, the CSP among them, are visible; `chromium` runs the rest against the
  preview origin. `CLIENT_ORIGIN` names only the preview origin, so the `deployable`
  project also proves that `corsPolicy.js` allows the server's own origin unlisted. Adding
  5000 back to that list would pass every test and remove the proof.
- **Do not set `NODE_ENV=test` for the server it starts.** The process then loads,
  exports, and exits 0 with no output at all — which reads exactly like a crash.
- **Geolocation is left denied**, so the dashboard never reaches the live weather and
  air-quality upstreams. Plan generation is not covered yet, though it no longer needs a
  key: the rules build the plan and write its notes without Gemini.
- **Each run creates an account and deletes it** before the file ends. A run that fails
  before that step leaves the row behind in a local database.

**Accessibility is checked by axe against rendered pages, not by the linter.**
`e2e/a11y.spec.js` asserts zero violations on the forms, the dashboard, an open modal and
the account panel's states, and checks that a modal can be dismissed from the keyboard
alone. **When a linter and the accessibility engine disagree about rendered output, the
engine wins.** Three jsx-a11y interaction rules are off as one recorded decision: keyboard
dismissal lives in `useCloseOnEscape` (`ModalPortal` calls it for every modal,
`DashboardDrawer` directly), where the rules cannot see it, and the axe scan is what
catches a real keyboard trap ([0006](docs/adr/0006-accessibility-by-axe.md)).

**Reduced motion is handled where each motion is, not by a global reset.** Script reads
`matchMedia("(prefers-reduced-motion: reduce)")` before it animates, and each stylesheet
carries its own `@media (prefers-reduced-motion: reduce)` block beside the rules it stops
([0007](docs/adr/0007-reduced-motion-where-it-moves.md)).

**`npm run knip` is clean, and `knip.jsonc` is what keeps it that way.** It must declare
the hook scripts as entry points: `.claude/settings.json` invokes them where knip cannot
see, and without the config it reports every hook file as unused — a false positive
inviting you to delete the whole hook wiring. "Unused export" usually means the export,
not the value: narrow it to module-private before deleting anything. Deleting dead source
does not necessarily shrink the bundle, so measure the bundle rather than claiming it
([0008](docs/adr/0008-knip-and-dead-code.md)).

Server-only helpers (run from `server/`):

```bash
npm run postgres:local:start   # PowerShell helper for a workspace-owned local Postgres
npm run migrate:postgres       # apply Postgres migrations
npm run prisma:generate        # regenerate Prisma Client
npm run prisma:validate        # validate the schema
```

`docker compose up -d` is the alternative to that first helper: `docker-compose.yml` runs
Postgres and Redis in containers while the app itself stays native. Both it and
`npm run postgres:local:start` bind **55432**, so they are alternatives, not complements.
Compose starts an empty database, so `npm -w server run migrate:postgres` is required
before the server or its test suite will work against it.

**Both published ports bind `127.0.0.1` on purpose, and the prefix is load-bearing.** On
Windows, Docker's default `0.0.0.0` and the PowerShell helper's `127.0.0.1` do not collide,
so without the prefix compose starts beside the native instance while every `localhost`
connection keeps reaching the native one; with it, picking the wrong one fails at once.
Do not drop the prefix.

**The two instances do not share a password.** Compose uses `POSTGRES_PASSWORD` (default
`ai_workout_dev`, as `env.example` spells out) and the helper generates its own, so a
`server/.env` written for one fails against the other with
`password authentication failed for user "postgres"` (SQLSTATE 28P01). That is the
expected symptom of switching sides, not a broken container
([0009](docs/adr/0009-compose-on-loopback.md)).

- ALWAYS run `npm test`, `npm run lint` and `npm run typecheck` after making code changes
- ALWAYS verify `npm run build` succeeds before committing
- **Coverage is measured, not estimated.** Run `npm run test:coverage`, not `npm test`,
  before claiming a change is ready: CI runs `test:coverage`, and `npm test` runs no
  coverage at all. Each side's floors are in `client/vite.config.js` and
  `server/vitest.config.js`, beside a
  `Measured <date> (statements / branches / functions / lines)` note; each floor is its
  figure truncated to one decimal, and `scripts/__tests__/repo-invariants.test.mjs` fails
  when a floor and its note disagree. For exact counts, add `--coverage.reporter=json-summary` and read
  `<side>/coverage/coverage-summary.json`: a metric passes exactly when
  `covered >= floor / 100 × total`, and when the slack, `covered - floor / 100 × total`, is
  under one, a single new uncovered statement, branch or function fails CI.
  **Floors are raised once per phase, by one floor PR per side, and never lowered**; a fix
  PR leaves the floor lines alone (`docs/specs/2026-10-10-readability-follow-up-design.md`,
  rule 3). Server branches read higher in CI than locally, and one lower with
  `client/dist` present, so measure a server floor locally with a build on disk. Both
  configs measure all of `src/**`, because a narrower `include` reports a better number
  rather than a truer one ([0010](docs/adr/0010-coverage-floors.md)).
  - **A coverage figure that changes between runs of identical code is a test bug.** Pin
    the clock in any test whose branches follow `new Date()`; stage a race with deferred
    promises.
  - **A `TZ` set in the shell does not reach Node on this machine; one set inside the
    process does.** Assign `process.env.TZ` inside the test, and restore it by assigning
    the zone captured at load, `Intl.DateTimeFormat().resolvedOptions().timeZone`, **not
    with `delete`**, which leaves Node on UTC.
  - **Re-importing a server module does not give you a clean environment.** `index.js` and
    `prisma.js` call `dotenv.config()` at module scope, which fills in any key that is
    _absent_ from `process.env`. **Set the variable to an empty string instead of deleting
    it**, and restore a key that was absent by deleting it: assigning `undefined` stores
    the string `"undefined"`. [0011](docs/adr/0011-tests-control-their-environment.md)
    covers all three.
  - **Check whether an uncovered arm is reachable at all before writing a test to reach
    it.** On the client, rank files by uncovered branches, from
    `client/coverage/coverage-summary.json`, rather than by percentage; much of what is
    left there cannot fire. The uncovered arms left in `outlineGeometry.js`,
    `templateOutline.js` and `usePreviewDerivedData.js` stay on purpose, and so do
    `App.jsx`'s redundant unit initializers, because `HomePage` reads the units on the
    first render, before the effect that resets them runs
    ([0012](docs/adr/0012-coverage-gaps.md) maps it all).
  - **Check before calling something untestable.** Layout (`getBoundingClientRect`),
    randomness (`Math.random`) and library calls are boundaries a test stubs, and
    `new Intl.DateTimeFormat()` needs a constructible stub. jsdom's CSSOM is not a
    faithful mirror, so check what it stores before asserting on it
    ([0013](docs/adr/0013-test-boundaries.md)).
  - **A function being stubbed is not a function being tested.** When a test stubs a named
    function of this repo's own, check whether anything else exercises it. Stub only the
    boundary, judge a component by whether it _computes_ anything rather than by its
    suffix, and pick by risk, not by size ([0014](docs/adr/0014-what-to-test.md)).
  - **When mutation-testing, confirm the mutation applied.** An unapplied mutation and an
    uncaught one both read as "tests passed". Write mutation scripts with the Write tool
    rather than a heredoc, use `String.raw` for any pattern containing a backslash, match
    on `\r?\n`, and check line endings with `git ls-files --eol`, never `grep -c $'\r'`.
    Before writing a test for a survivor, check whether it is an equivalent mutant or a
    second guard on the same condition (**if you add a modal, give it one guard, not
    two**); build fixtures from what the form actually stores; and use a deliberate
    survivor to prove a branch dead ([0015](docs/adr/0015-mutation-testing.md)).
- **ESLint is scoped to defect classes, not style** — unused/undeclared identifiers,
  unreachable code, React Hook contract violations, import cycles and unresolved
  specifiers, `no-console`, `react/jsx-key`, and `react/no-unstable-nested-components`.
  Every one of those was measured against the tree before being enabled and reported zero
  violations, except `no-console`, which reported two.
  - `import-x/no-unresolved` **requires** `settings: { "import-x/resolver": { node: { extensions: [".js", ".jsx", ".json"] } } }`.
    Without it the rule emits 53 false positives, because the client imports `.jsx` files
    extensionlessly and Vite resolves those where the default node resolver does not.
  - `no-console` covers `client/**` and `server/**` — including `server/scripts/` — but
    **not** root `scripts/**`, which is tooling that legitimately prints. Test files are
    exempt.
  - `linterOptions` lives in its **own** config object. Adding any key to the
    `ignores`-only object would stop those ignores being global; measured, that takes
    `eslint .` from 9 lines of output to 990 as `.claude/helpers/**` starts being linted.
- **Formatting is Prettier's job, and CI enforces it.** `npm run format:check` gates every
  PR, `npm run format` fixes. `eslint-config-prettier` is applied last so no rule fights
  the formatter — with one deliberate exception re-enabled after it,
  `no-unexpected-multiline`, which is an ASI-hazard defect rule rather than a style rule.
  The repo-wide reformat is commit `86621a3` (173 files, ~7,200 lines), recorded in
  `.git-blame-ignore-revs`.
  - **Nothing is excluded from Prettier.** If you ever exclude a file from a formatter
    here, write the guard that retires the exclusion for you. Before excluding one, check
    byte-stability across about three consecutive `--write` passes: a file that stops
    changing is merely awkward, and only one that grows without bound earns an exclusion
    ([0016](docs/adr/0016-formatter-exclusions.md)).

  - **Prettier rewrites number literals, not comments.** In JS, `93.80` becomes `93.8`
    and `5.` becomes `5`, but `99.0` stays `99.0`; in CSS, `99.0%` becomes `99%`
    (Prettier 3.9.10, measured). So a floor in `thresholds` is never written with two
    decimals, while the measurement note above it, a comment, keeps `99.50`. The
    phase plans' "Prettier writes a whole number without `.0`" is wrong for JS: a
    floor reads `99` because it was written so.
- `eslint.config.js` ignores `.claude/**` and `.githooks/**`, but **does** lint `scripts/**`
- **Lint is clean: 0 errors and 0 warnings.** It used to carry 12
  `react-hooks/exhaustive-deps` warnings; those are resolved, and the three that were
  deliberate now carry an inline disable explaining why. A new warning means you
  introduced it.
- **`npm run build` is clean.** It used to emit a "chunks larger than 500 kB" warning;
  that went away when `jspdf` moved to a dynamic import. The main chunk sits close under
  that warning (the build prints its size, as `dist/assets/index-*.js`). It was ~407 kB
  until React 19, which alone added the difference -- measured by building with nothing
  else changed, not estimated. If the warning appears, check first whether something got
  pulled onto the eager path; if nothing did, the margin simply ran out.
- **A CSS or motion change is proved by screenshot, not by reading.** Capture `main`
  once, then compare each CSS PR against that capture, listing the visual and
  computed-style changes the PR expects (`docs/specs/2026-10-10-readability-follow-up-design.md`,
  rule 7). The capture tool is `capture.mjs`, printed in full in the Tools section of
  `docs/plans/2026-10-16-readability-follow-up-phase-4.md`: write it out with the Write
  tool, give it an absolute repo root (`D:/ai-workout`), and it captures a build's page
  states with each one's DOM and computed styles; `compare` takes an expectation file.
  **Lightning CSS rewrites every built rule, so search the build for one declaration,
  never for a rule as written.** It reorders a rule's declarations
  (`display: grid; grid-template-columns: 44px 1fr 44px; align-items: center` builds as
  `grid-template-columns:44px 1fr 44px;align-items:center;display:grid`), adds prefixes
  (`-webkit-backdrop-filter`), shortens colours (`rgba(12, 16, 30, 0.85)` becomes
  `#0c101ed9`) and rewrites selectors (`*::before` becomes ` :before`).
- **`styles/base.css` is the `base` cascade layer** (`styles/index.css` imports it with
  `layer(base)`), and nothing else is layered. So any page, planner or view rule beats it at
  any specificity: never raise a selector or add `!important` to beat it. **Never add
  `!important` to `base.css`**: a layered `!important` beats every unlayered one, which is
  the reverse of what it looks like. Moving any other sheet into a layer is a decision, not
  a cleanup (`docs/plans/2026-10-24-parked-items.md`, Task L1, says why it was not done).
  The build keeps the layer: Vite hoists the Google Fonts `@import` to the first rule, as
  `@import "…" layer(base)`, so the fonts still load.
- Server needs `server/.env` (`PORT`, `DATABASE_URL`, `CLIENT_ORIGIN`, `GEMINI_API_KEY`)
- Server tests need Postgres: `npm run postgres:local:start -w server` first, or every
  test that reaches the database fails with `Can't reach database server`, which is
  environmental, not a regression. Read the run's `Tests` line for failures before
  trusting any server count. The compose database works just as well —
  `docker compose up -d`, `npm -w server run migrate:postgres`, then the `DATABASE_URL`
  from `env.example`; CI runs the full suite on the same `postgres:18` image compose
  uses. `npx playwright test --list` lists the E2E suite's tests, across its two
  projects.
- **Run one server test file from the workspace, not with `--root server`.**
  `npm run test -w server -- <path>` (or `npm -w server exec vitest run <path>`) runs in
  `server/`. `npx vitest run <path> --root server` from the repository root does not:
  `index.js`, `db/prisma.js` and `vitest.setup.js` call `dotenv.config()` with no path,
  and dotenv reads `.env` from the working directory, so the suite never sees
  `server/.env` and a test that reaches Postgres fails with
  `SASL: client password must be a string`. No client code calls dotenv, so
  `--root client` from the root is unaffected.

## Fresh Clone Setup

Tracked: `CLAUDE.md`, `.mcp.json`, `scripts/`, `.githooks/pre-commit`, and
`.claude/settings.json` (the hook wiring).
Not tracked: `.claude/agents/`, `commands/`, `helpers/`, `skills/` — claude-flow scaffolding.

The pre-commit hook is in the repo; only its activation is not, which is what the
`core.hooksPath` line below sets.

**Most of the configured hooks, and the status line, run a `.claude/helpers/*` script,
which is not in the repo.** They reach it through `scripts/run-claude-helper.cjs`, which
exits 0 without a word when the helper is absent, so on a fresh clone those hooks fire and
do nothing. Regenerate the scaffolding after cloning:

```bash
npx ruflo@latest init                 # regenerate .claude/agents|commands|helpers|skills
# The two git config lines below are applied automatically by the `prepare` script
# on every `npm install` / `npm ci` -- run them by hand only to repair a checkout.
git config core.hooksPath .githooks   # activate the repo's pre-commit guard
git config blame.ignoreRevsFile .git-blame-ignore-revs   # skip the Prettier reformat in blame
```

The second line is required: `core.hooksPath` lives in `.git/config`, which is not part of
the repository, so a clone does not run `.githooks/pre-commit` until it is set.

The third line is the same class of gotcha. `.git-blame-ignore-revs` lists the commit that
reformatted the repository with Prettier, but `blame.ignoreRevsFile` — the setting that
tells local git to actually skip it — lives in `.git/config`, not the repository, so a
fresh clone will silently attribute ~3,500 lines to the reformat commit until this is set.
GitHub honours the file automatically on its blame views; local `git blame` does not.

Then confirm the wiring actually fires. A missing or broken hook here fails **silently** —
it will not announce itself, so check exit codes directly rather than assuming:

```bash
node .claude/helpers/hook-handler.cjs status   # expect exit 0
node scripts/codex-handoff.mjs --hook          # expect exit 0
node scripts/scrub-junk-files.cjs --dry-run    # expect exit 0
echo '{"prompt":"fix a bug"}' | node scripts/skill-router.mjs
```

Capture exit codes without a pipe (`cmd >/dev/null 2>&1; echo $?`) — a piped command
reports the last stage's status, not the command's.

Check a helper directly, as the first line does, not through the wrapper: the wrapper
exits 0 whether the helper is there or not, so it cannot tell you which.

If `npx ruflo@latest init` overwrites `.claude/settings.json`, its permission allowlist is
hand-trimmed and worth keeping: restore with `git checkout -- .claude/settings.json`.

Re-run the verification checklist above after **any** `ruflo init`, not just a fresh clone.
A regenerated `settings.json` silently reverts the `scrub-junk-files.cjs` hook path to the
stale `.js` name, and a broken hook does not announce itself. `npm run test:scripts`
catches that, and any hook that calls `.claude/` directly instead of through the wrapper
(the hook-wiring blocks in `repo-invariants.test.mjs`); the exit-code checks catch the rest.

## Security Rules

- NEVER hardcode API keys, secrets, or credentials in source files
- NEVER commit `.env` files or any file containing secrets — `server/.env` holds the
  Gemini key and the Postgres connection string
- **A secret scan runs on every PR and every push to `main`** (CI's secrets job, gitleaks,
  `security/gitleaks.toml`). A test fixture that trips it is allowlisted by its value,
  never by its path.
- Always validate user input at system boundaries
- Always sanitize file paths to prevent directory traversal
- **Never route around a permission rule.** If a deny rule blocks a path, stop and say so.
  Reaching the same file by an indirect route — a Node script instead of Read, a shell verb
  the matcher does not catch — defeats a control the user set deliberately. This has already
  tripped a security classifier here once.
- **The env template is `env.example`, with no leading dot, and that is deliberate.**
  `Read(./.env.*)` in `.claude/settings.json` would match `.env.example`, blocking a file
  whose entire purpose is to be public. Permission rules support only exact matches and
  prefix wildcards — there is no negation — so excepting one filename would mean replacing
  that wildcard with an enumeration anticipating every future secret-bearing name, and a
  miss would be silent. Catching the names nobody anticipated is the wildcard's whole job,
  so the rule stays broad and the template sits outside it instead. Do not rename the
  template back, and do not loosen the rule.

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
