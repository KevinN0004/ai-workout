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
- `client/src` — React 18 + Vite frontend source
- `client/src/pages/<page>` — a page's own parts, in `views/`, `components/`, `hooks/`
  and `styles/`. The page component itself still sits at `pages/<Page>Page.jsx`
- `server/src` — Express 4 API, services, routes. Only the app bootstrap
  (`index.js`, `corsPolicy.js`, `shutdown.js`) stays at this level
- `server/src/db` — the Postgres pool, the Prisma client and the migration runner
- `server/src/repositories` — **all Prisma data access lives here.** Routes and services
  call these; nothing else should touch `prisma.*` directly
- `server/prisma` — Prisma schema and migrations
- `server/scripts` — server operational scripts (local Postgres, migrations)
- `docs/plans` — implementation plans, one file per effort, named `YYYY-MM-DD-name.md`
- `docs/specs` — design specs, named to match the plan they belong to
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
  _partial_ unique indexes (`where legacy_id is not null`), which `schema.prisma` cannot
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

**Guard absent input before `Number()`, never after.** `toFiniteNumber` and
`weatherCodeToText` in `externalDataService.js`, and `toNumberOrNull` in
`repositories/rowValues.js`, all do this; copy that shape rather than writing a fresh
coercion.

**Guarding the converter does not protect a caller that bypasses it.** This class has
recurred three times, and the third was in code I had already declared fixed:
`weatherCodeToText` kept its own `Number(code)`, and the weather routes called it with
the raw upstream value while building the neighbouring numeric field through
`toFiniteNumber`. One response carried `weatherCode: null` beside
`weatherText: "Clear sky"`. When you fix one of these, grep for every caller of the
helper and check what each passes in.

This is not hypothetical. Three shipped bugs came from it, all in health advice:

- a pm2.5 sensor reporting `null` was published as `0 ug/m3`, which scores **AQI 0** and
  told the user the air was clean
- a `null` weather code is code `0`, **"Clear sky"**, and a `null` temperature is `0 °C`,
  so a payload carrying no weather at all was reported as clear _and_ too cold to train
  outdoors
- the same `null` weather code went on reporting **"Clear sky"** from both weather routes
  and every day of the forecast after that fix, because those build `weatherText` from
  the raw value rather than from the guarded number

The whole external-data path has since been swept for it. `pm25ToUsAqi`, `aqiBand`,
`toFiniteNumber`, `weatherCodeToText` and `toNumberOrNull` all guard; `isSevereWeatherCode`
is safe because `0` is not a severe code; the wger and mealdb routes only use `cleanText`,
which tests `typeof value === "string"`.

`undefined` already behaved correctly, so an omitted key and an explicit `null` gave
opposite answers for the same missing data — which is what made it hard to see.

**Do not "fix" this with `!value`.** That swallows a genuine zero, and a measured zero is
a measurement: 0 °C really is below the cold gate. Range checks used to mask the bug too:
`toPositiveInt` and `parseRedisPort` were safe only because `> 0` and a port range reject
the accidental `0`, and `toRate` was safe only because its one caller passes `0` as the
fallback, so the accidental zero and the intended default happened to coincide. All three
now guard before they coerce, so the safety is intrinsic rather than a side effect of the
range. `toRate` was the one that mattered: `0` is a valid sample rate, so nothing else was
going to catch it if the default ever changed.

**The invariant is now asserted, not just described here.**
`server/src/numericCoercion.contract.test.js` and its client counterpart enumerate every
numeric helper and pin three things: that `null`, `""` and `undefined` all agree, that a
non-numeric string is absent, and that a measured `0` survives. **Add a row when you add a
helper** — that is the whole mechanism, and it is why `toNumberOrNull`, the shape this
section tells you to copy, is now tested directly rather than only incidentally through
the dashboard integration suites.

Two things the contract deliberately does not flatten:

- **`toPositiveInt` and `parseRedisPort` exclude `0` from their domain**, so for them a
  measured `0` correctly reads as absent. Asserting otherwise would be wrong, so each row
  declares whether zero is meaningful for that helper.
- **`toNumberInput` does not make the three absent forms agree**, and must not. It feeds
  `z.preprocess`, where `undefined` has to stay `undefined` for `.optional()` to fire and
  `null` has to stay `null` for `z.null()` to match — collapsing them would lose the
  difference between a field omitted and a field explicitly cleared. It still honours the
  part that matters: an empty field becomes `null`, never `0`.

Mutation-tested rather than trusted, since a contract test over correct code passes on the
first run either way. Removing the guard from `toNumberOrNull`, `toNullableNumber`,
`toFiniteNumber` (both copies) or `toRate` is caught; so is switching any of them to
`!value`. Removing it from `toPositiveInt` or `parseRedisPort` **survives, as predicted** —
those two are equivalent mutants, which is the mechanical proof that reshaping them changed
no answer.

**The class was not confined to the server, and the fourth instance is fixed.**
`useBodyModel.js` carried its own `toFiniteNumber` written the wrong way round —
`Number()` first, `Number.isFinite` after — while `defaultPersonalForm.bodyFat`
is `""`. So an unentered body fat resolved to `0`, `clamp(0, 3, 60)` lifted it
to `3`, and `explicitBodyFat ?? estimatedBodyFat` accepted that 3 as a real
answer. Anyone who filled in height and weight but not body fat was modelled at
**3% body fat**, leaner than an elite athlete, and the BMI-derived
`estimatedBodyFat` sitting beside it was unreachable from the app. It also
floored the silhouette's whole adiposity channel: `fatScore` clamped to `0` for
an ordinary BMI-25.8 profile.

The guard now runs before the coercion, copying `toNumberOrNull` in
`repositories/rowValues.js`. Two things follow from that, and both are worth
knowing:

- **An unentered body fat now reaches the BMI estimate**, and `""`, `null` and
  an absent key all agree. An entered `"0"` is still a measurement and still
  clamps to the 3% floor — blank and zero are different answers.
- **The cross-unit height fallback came back to life.** Both `??` in that pick
  were dead for the same reason: the left operand was `0`, never `null`. A
  profile carrying a height in only one of the two fields used to resolve to no
  height at all; it now falls back to the other unit, which is what the
  expression was written to do.

Only `""` and `null` changed behaviour — `undefined` already returned null, and
weight was unaffected because `toKg` returns `""` for a falsy value and the
`> 0` check downstream rejected the `0` either way.

**A fifth instance sat in `components/physique/math.js`, and it is fixed too.**
That file carried a _third_ `toFiniteNumber`, the only one taking an explicit
`fallback` argument, written the wrong way round like the others. It is the copy
the silhouette runs on: about sixty calls across `geometry.js`,
`templateOutline.js`, `outlineUtils.js` and `palette.js`.

It was never reachable from the app — `useBodyModel`'s `silhouetteShape` puts
every field through `clamp()` of a numeric expression, so the model it hands
`PhysiqueSilhouette2D` carries only finite numbers. It was a trap for the next
caller rather than a shipped bug. Two things let it survive the earlier sweep,
and both are worth recognising elsewhere:

- **Its test pinned the wrong behaviour with a comment that only explained the
  mechanism.** `expect(toFiniteNumber(null, 7)).toBe(0)` was annotated
  `// Number(null) is 0, which is finite` — true, and not a reason. Compare the
  `is_day` test in `weatherRoutes.test.js`, which argues that anything other
  than the flag "must not read as daytime". A comment that restates what the
  code does cannot tell you whether it should.
- **`geometry.test.js` already passed a `null` in and could not see it.** Its
  non-numeric case includes `waistHalf: null`, but asserts only that the path
  holds no `NaN` — true whichever way the null resolves. Exercising a value is
  not the same as discriminating on it.

The regression test now pins absent and zero apart at both levels. Note what the
geometry-level one had to assert: a zeroed dimension does **not** simply clamp to
its minimum bound, because `buildTemplateSizing` in `templateOutline.js` derives
its width scale from the **raw** model value rather than from geometry's clamped
local. Those unclamped scales are worth remembering before assuming the clamps in
`buildPhysiqueSilhouetteGeometry` bound everything downstream of them.

Conventions:

- **File length is a smell, not a limit.** This file used to say "keep files under
  500 lines". That rule arrived with the initial Claude config in `eb165c7`, whose
  message says the setup was ported from another repo — it was never a decision
  about this codebase. Nine files broke it, nothing enforced it, and adding
  `max-lines` would contradict the ESLint policy below, which is deliberately
  scoped to defect classes rather than style.

  What matters is how many _things_ a file is, not how long it is. Eight of those
  nine are one exported thing plus its private helpers: `templateOutline.js` has a
  single export at line 472, and `externalDataService.js` and `events.js` are
  closure factories. Splitting those means exporting internals to satisfy a line
  count, which trades real encapsulation for a number. **Leave them.**

  `index.js` was the exception — genuinely several things — and it was split for
  that reason rather than for its length, which is why the pieces that came out
  (`services/metricsService.js`, `corsPolicy.js`) are cohesive rather than
  arbitrary. It is still the largest server file and still over 500 lines. That is
  fine; it is the app bootstrap, and the remainder is wiring that belongs together.

  Reach for a split when a file grows a second unrelated reason to change, or when
  something worth testing can only be reached by booting the whole app. Both were
  true of the metrics helpers: they were the last uncovered statements in
  `index.js` precisely because they were module-scope privates, and the identical
  `recordLatency` in `middleware/requestContext.js` was a second copy of one of
  them. Extracting fixed the coverage and the duplication together.

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
npm run test:e2e         # Playwright smoke suite (NOT part of `npm test`)
npm run test:e2e:ui      # the same suite in Playwright's UI mode
npm run knip             # unused files, exports and dependencies (exit 0 = clean)
npm run lint             # eslint . across both workspaces
npm run lint:fix         # eslint . --fix
```

**A client test can import server modules directly, and two do.** The running
app cannot reach across the wire, but Vitest can resolve
`../../../server/src/...` from `client/src`, so a contract between the two sides
can be asserted without a browser or a database. `app/constants.test.js` pins the
option lists against the server's `allowed*Values`, and
`app/profileContract.test.js` walks a form draft through
`personalToProfile` → `profileBodySchema` → `buildProfile` → `profileToPersonal`
and back. Both were verified to catch divergence the owning side's own suite
misses: narrowing the server's height range to 100-170 makes a 178cm profile
store `null`, and the server's tests never try 178. Keep such imports to test
files — confirmed they do not reach the bundle.

**Otherwise the E2E suite is the only thing that runs both halves together.**
Everything else tests one side of the wire — the client suite mocks `fetch`, the
server suite drives express with supertest — so a defect in the wiring between
them passes both. It is deliberately tiny: sign up, log a workout, reload, confirm it
survived. Four things are worth knowing before touching it:

- **It runs against the built bundle** via `vite preview` on 4173, not the dev
  server, so `npm -w client run build` has to happen first. `vite preview` does
  not inherit `server.proxy`, which is why `client/vite.config.js` carries a
  separate `preview.proxy`.
- **Do not set `NODE_ENV=test` for the server it starts.** `index.js` guards its
  `startServer()` call with `NODE_ENV !== "test" && !VITEST` so the unit suite
  can import `app` without binding a port. Set it and the process loads, exports,
  and exits 0 with no output at all — which reads exactly like a crash.
- **Geolocation is left denied**, so the dashboard takes its own "location
  unavailable" path instead of reaching the live weather and air-quality
  upstreams. Plan generation is out of scope for the same reason: it needs a
  real Gemini key.
- **Each run creates an account** (`e2e-<timestamp>@example.test`) and never
  deletes it; there is no delete-account endpoint. Harmless in CI, but it
  accumulates rows in a local database.

It has its own CI job rather than living in `test`, so a flaky browser run
cannot muddy the unit signal. It was verified by mutation rather than trusted:
removing the client's CSRF header, and making the workout route answer 200
without writing, are both caught — and both pass every other suite in the repo.

**Accessibility is checked by axe against rendered pages, not by the linter, and
that order is deliberate.** `e2e/a11y.spec.js` scans the login form, the signup
form, the dashboard and an open modal, and asserts zero violations. It rides the
same Playwright job, so it is already in CI.

The linter is the junior authority here, and the numbers say why. jsx-a11y's
recommended set reported **153 findings; 128 were false positives** from
`label-has-for` and `control-has-associated-label`, both firing on
`<label>Name <input /></label>` — the shape every form in this app uses. Nesting
alone is a valid association, which is why `label-has-for` is deprecated
upstream. axe reports zero violations on those same forms. **When a linter and
the accessibility engine disagree about rendered output, the engine wins.**

What axe actually found, and what was fixed:

- **`aria-dialog-name` (serious).** Four of six modals had `role="dialog"` with
  no accessible name, so a screen reader announced "dialog" and nothing else.
  `MealDetailsModal` and `PlansView` already set `aria-label`; the rest did not.
  All six are now named by `aria-labelledby` pointing at their own visible
  heading, so the name cannot drift from what is on screen.
- **`region` (moderate).** The header note and the at-a-glance cards sat between
  `<header>` and `<main>` as bare children of the page. Wrapped in a named
  `<section>`. Safe because `.dashboard-page` is plain block flow and the only
  direct-child selector is `.dashboard-page > .title`, which still matches —
  verified with a full-page screenshot before and after, **byte-identical**.

**Three jsx-a11y interaction rules are off, and the reason is a real trade.**
`click-events-have-key-events`, `no-static-element-interactions` and
`no-noninteractive-element-interactions` produced 20 findings, all one pattern:
an overlay backdrop whose `onClick` dismisses it. Keyboard dismissal is now
handled by `useCloseOnEscape` — `ModalPortal` calls it for all six modals,
`DashboardDrawer` calls it directly because it is the one overlay not portalled
— so the backdrop click is a redundant mouse affordance. The rules cannot see
that, because it lives in a hook rather than on the element. They are off as one
recorded decision rather than twenty inline disables, and **the axe scan is the
thing that should catch a real keyboard trap instead.**

Before that hook existed, **no overlay in the app closed on Escape at all**: a
mouse user could click the backdrop, a keyboard user had to find the Close
button. Three role bugs were fixed alongside it — two `<aside role="tablist">`
(a landmark given an interactive role) and a `<button role="listitem">` (which
strips the button semantics a screen reader needs).

Mutation-tested rather than trusted, because an axe assertion that passes may be
asserting nothing: removing a modal's `aria-labelledby`, removing the landmark
wrapper, and disabling the Escape handler are all caught, and all three pass
every unit suite.

**`npm run knip` is clean, and `knip.json` is what keeps it that way.** Two things
about it are load-bearing:

- **It must declare the hook scripts as entry points.** `codex-handoff.mjs`,
  `scrub-junk-files.cjs` and `skill-router.mjs` are invoked from
  `.claude/settings.json`, which knip cannot see — so without the config it
  reports all three as unused files, then cascades and reports
  `codex-handoff/*.mjs` too, because their only importer looks dead. **That is
  six false positives inviting you to delete the whole hook wiring.** They are
  live; see the Fresh Clone Setup checklist that runs them.
- **"Unused export" usually means the export, not the value.** Of the 17 knip
  originally reported, 12 were constants used inside their own module to derive
  others that _are_ consumed — `PREVIEW_WEEK_LINE_DRAW_MS` feeds
  `PREVIEW_WEEK_OUTLINE_DRAW_MS`, and so on. Those were narrowed to
  module-private rather than deleted. Only `goalOptions` and the two meal
  libraries were genuinely dead.

**Deleting dead source does not necessarily shrink the bundle**, and assuming it
does is how you overstate a cleanup. `MEAL_LIBRARY` and `EXTRA_MEAL_LIBRARY` were
736 lines reachable only through a re-export nothing imported; removing them
changed the built bundle by **zero bytes and not even the content hash**, because
rollup was already tree-shaking them. Verified by grepping `client/dist` for a
string from the file before and after. They were worth removing for the reading,
not for the shipping. Measure the bundle rather than claiming it.

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

**Both published ports bind `127.0.0.1` on purpose, and the prefix is load-bearing.**
Docker's default is `0.0.0.0`, and `start-local-postgres.ps1` binds `127.0.0.1` — and on
Windows those two do **not** collide. Before this was fixed, `docker compose up -d`
succeeded while every `localhost` connection kept reaching the native instance: compose
looked healthy, `migrate:postgres` printed `skipped 001_foundation.sql` because the
_native_ database already had it, and the container sat at zero tables with no error
anywhere. Measured both ways on 2026-09-12, holding `127.0.0.1:55432` with a dummy
listener:

- publishing `0.0.0.0:55432` — container starts, shadowing the native instance
- publishing `127.0.0.1:55432` — `Error response from daemon: ports are not available`

So the collision the comment in `docker-compose.yml` always claimed is now real, and
picking the wrong one fails immediately instead of silently. Do not drop the prefix. It
also stops publishing a development database on every interface; nothing needs that,
because the app runs natively and connects over loopback.

**The two instances do not share a password.** Compose uses `POSTGRES_PASSWORD`
(default `ai_workout_dev`), which is what `env.example` already spells out:
`postgresql://postgres:ai_workout_dev@127.0.0.1:55432/ai_workout`. The PowerShell helper
generates its own instead, so a `server/.env` written for one will fail against the other
with `password authentication failed for user "postgres"` (SQLSTATE 28P01). That is the
expected symptom of switching sides, not a broken container — and it was invisible until
the port binding was fixed, because the shadowed connection was authenticating against
the native instance all along.

- ALWAYS run `npm test` and `npm run lint` after making code changes
- ALWAYS verify `npm run build` succeeds before committing
- **Coverage is measured, not estimated.** `npm run test:coverage`. As of 2026-09-17:
  server **93.65%** statements / 85.35% branches, client **98.33%** / 93.21%.
  Both configs measure all of `src/**` and exclude only the tests themselves, because a
  narrower `include` reports a better number rather than a truer one.
  **The client thresholds in `client/vite.config.js` are a ratchet**, floored one decimal
  below the measured value. Raise them when coverage rises; never lower them to make a
  build pass. Whole-percent floors were tried first and let a sub-point gain evaporate
  without tripping anything.
  - Do not infer coverage from whether a file has a neighbouring `*.test.js`. The
    repositories have almost none and sit near 95%, because the dashboard integration
    suites drive them; several 500-line view components have no test and sit at 0%.
  - **A function being stubbed is not a function being tested.** `openAqRequest`
    was 79 lines that never executed once — 53 uncovered branches, the largest
    single gap on the server — because `airQualityRoutes.test.js` stubs it as its
    network boundary. Stubbing it at every call site is what made it invisible:
    the routes above it were at 100%, so nothing in the coverage table pointed
    here. It is the request layer for the surface where the null-pm2.5-as-AQI-0
    bug shipped. Now at 96.7% statements / 94.6% branches, covered in
    `externalRequests.test.js` alongside the wger and MealDB wrappers.
    When a test stubs a named function of this repo's own, check whether anything
    else exercises it.
  - Thin areas, worst first: `index.js` (76% — app bootstrap and wiring) and
    `httpCacheService.js` (77%). `index.js` is ~697 lines, and nearly all of
    what is still uncovered in it is the bootstrap the suite deliberately does
    not run: the env preflight sits behind `NODE_ENV !== "test" && !VITEST`, so
    it is verified by booting the server rather than by the unit suite, and
    `startServer` is verified the same way.
    **Its percentage went down when it got better**, which is worth knowing
    before reading it as a regression: extracting `metricsService.js` and
    `corsPolicy.js` removed covered statements, so the untestable bootstrap is
    now a larger share of a smaller file. The same denominator effect took
    `requestContext.js` from 84% to 79% branches while its statements went to
    100%. Server totals rose across both moves. Judge this file by what is left
    uncovered, not by its percentage.
    Its CORS layer is now covered end to end, and so are all four rate limiters
    — see `index.rateLimit.test.js`, which sets the limit under test to 1 and
    the other three far out of the way, because the limiters are layered and the
    global `/api` one would otherwise answer first. `postgres.js` was the worst
    at 53% and is now at 100% on every metric; its redaction of the database
    password is the part that mattered, and the fallback for a URL too malformed
    to parse had never been exercised.
    **Every route file is at or above 81%, every route the user's data passes
    through is at 100%, and every service is at or above 82%.** What is left on
    the server is infrastructure rather than request handling.
  - **Re-importing a server module does not give you a clean environment.**
    `index.js` and `prisma.js` both call `dotenv.config()` at module scope, and
    dotenv fills in any key that is _absent_ from `process.env`. So
    `delete process.env.CLIENT_ORIGIN` followed by `vi.resetModules()` and a
    re-import hands the app whatever the environment file says, not the empty
    value the test asked for. This is silent: the CORS suite's "no allowlist
    configured" cases were really testing the file's allowlist, and only looked
    wrong because `http://localhost:5173` happened to be in it while
    `http://127.0.0.1:4173` was not. **Set the variable to an empty string
    instead of deleting it** — a present-but-empty key is one dotenv leaves
    alone. Restoring afterwards has the mirror-image trap: assigning `undefined`
    back to `process.env` stores the string `"undefined"`, so a key that was
    absent has to be deleted rather than assigned.
    Re-importing is otherwise safe here: `index.js` exports `startServer` rather
    than calling it, and `prisma.js` caches its client on `globalThis` outside
    production, so no second database client is created.
    On the client, ranked by **uncovered branches** rather than by percentage —
    that is what says where the untested behaviour actually is:
    Current ranking, re-measured 2026-09-13: `usePreviewDerivedData.js` (34),
    `outlineGeometry.js` (28), `templateOutline.js` (22), `SettingsView.jsx` (11),
    `useDashboardMetrics.js` (11) and `useDashboardData.js` (10).
    **The two geometry files at the top are the same dead-defensive pattern**:
    `outlineGeometry.js`'s uncovered arms are the `top || bottom || null`
    fallbacks in `chooseYUpper`/`chooseXOuter` and friends, reachable only with
    asymmetric anchor data that `geometry.js` never produces. They are
    closure-scoped, so reaching them means driving the outer function with
    hand-built anchor sets. Left alone deliberately: unlike the duplicated
    profile guards, these are cheap insurance in rendering code where the worst
    case is a slightly wrong silhouette, and deleting them would make the file
    more fragile to change rather than less.
    **This entry previously claimed "nothing is left above ten uncovered
    branches" and listed `usePreviewDerivedData.js` among the files that were
    done. Both were wrong** — it was the largest client gap at the time, and the
    claim would have stopped the next reader looking. Re-measure before trusting
    a ranking here; it goes stale every time anything lands.
    `PreviewPage.jsx` (31), `PreviewDashboardChapter.jsx` (28),
    `HomePage.jsx` (25), `DashboardPage.jsx` (23), `App.jsx` (20),
    `CaloriesView.jsx` (16), `AuthPage.jsx` (15) and `GeneratedPlanModal.jsx`
    (14, and the last client file at 0% on every metric) all used to head this
    list and are done.
    **Much of what is left is not a missing test.** `usePreviewDerivedData.js`
    went 46 → 34 by deleting branches rather than covering them: seven guards
    re-applied `activePreviewProfile.X || JOHN_DOE_PREVIEW_PROFILE.X` to a value
    that had already been through that exact guard 100 lines earlier, where the
    profile is built. The else arms could not fire. Check whether an uncovered
    arm is reachable at all before writing a test to reach it — and see the
    `GeneratedPlanModal` note below for how to tell.
    **`CaloriesView.jsx`'s two guards on `progressMetrics` used to disagree, and
    the fix is worth copying.** The rows were guarded with `Array.isArray`, the
    empty state beneath them with `?.length` — which a string satisfies — so a
    non-array produced no rows _and_ suppressed the "No progress metrics logged
    yet." line, leaving a blank panel with nothing to explain it. A third list
    in the same file, `calories`, had no guard at all. Each list is now narrowed
    once at the top of the component and both uses read that, so the two cannot
    drift apart again; four mutation cases exist specifically to catch them
    drifting back.
    **A correction to how that was first reported.** PR #111 called the blank
    panel "reachable only from a malformed cached dashboard". It is not
    reachable at all: `useDashboardMetrics` narrows both lists with
    `Array.isArray` before handing them over, and `buildDedupedList` narrows
    again and returns an array it builds by pushing — so the props are
    guaranteed arrays three times over, and `CaloriesView` has exactly one
    caller. The inconsistency was real and worth removing; the user-visible
    failure it implied was not. **Trace the producer before calling a guard's
    disagreement reachable** — the guard may be the fourth in a chain.
    `PreviewDashboardChapter.jsx` and `HomePage.jsx` reached 100% on every metric.
    `DashboardPage.jsx`'s one remaining uncovered branch is unreachable, and so
    is the `return null` under it: `activeDashView` is constrained to the eight
    names in `dashViewOrder` by the line that computes it, and the router below
    handles all eight, so it never falls past the last `if`.
    **`App.jsx` carries a redundant pair worth knowing about.** The `useState`
    initializers for `heightUnit` and `weightUnit` derive the visitor's units
    from their locale, and `resetPersonalFlow` derives exactly the same thing
    again from the same source. An effect calls `resetPersonalFlow()` whenever
    the route is `/`, and `/` is the only route where those units are read at
    all — they are passed to `HomePage` and nowhere else. So the initializers
    are overwritten before anything observable, and inverting them changes no
    test and no pixel. Verified by inverting the ternary by hand: the suite
    stays green. If the two copies ever disagree, the effect's copy silently
    wins. **Deliberately left alone.** Removing the initializers would leave
    `heightUnit` and `weightUnit` undefined on the first render, before the
    effect runs, and `HomePage` receives them on that render. The redundancy is
    harmless; the alternative is a regression.
    **Three files are off this list for good, and none of them is worth
    revisiting.** Each was ranked high by uncovered branches and each turned out
    to be unreachable rather than untested:
    - `usePreviewDerivedData.js` (46) — double-guarded fallbacks, below.
    - `outlineGeometry.js` (28) — its uncovered branches are null-guards inside
      module-private helpers (`toPoint`, `appendPoint`, and the four
      `chooseY`/`chooseX` pickers). Nothing exports them, and the anchor sets the
      one caller builds always supply the points they guard against.
    - `templateOutline.js` (26) — one export, `buildTemplateOutline`, and
      everything else private. The remaining branches are
      `!Array.isArray(points) || points.length < 3` guards on private helpers,
      and the template is a **fixed SVG asset** with hundreds of points, so the
      single entry point cannot drive any of them.
      It used to contain genuinely dead code, now removed: `pointsToPath` was
      called from exactly one place, `buildCurvedPath`, whose guard was
      `if (!Array.isArray(points) || points.length < 3) return pointsToPath(points)`
      — character for character the same condition `pointsToPath` itself returned
      `""` for on its first line. It could only ever return `""`, so its
      path-building body and the `round3` helper that served it went with it; the
      guard now returns `""` directly.
      **`usePreviewDerivedData.js` should not be picked up again.** It is at 99.5%
      statements and 100% functions, and its 40 remaining uncovered branches are
      **double-guarded fallbacks that cannot fire**. `activePreviewProfile` spreads
      `JOHN_DOE_PREVIEW_PROFILE` and then overrides every field with
      `personal.x || JOHN_DOE_PREVIEW_PROFILE.x`, so every field is non-empty for
      any input — including all-null. Roughly thirty branches further down the file
      then re-apply the _identical_ `|| JOHN_DOE_PREVIEW_PROFILE.x` to those same
      fields (`focuses`, `equipment`, `environment`, `goal`, `trainingDays`), and
      the block of `String(x ?? "")` at lines 406-420 does it a third time. None of
      the second or third guards can ever take their fallback side. The invariant
      that makes them dead is now pinned by a test, so if someone removes a guard
      from `activePreviewProfile` the suite says so.
      The locale block at lines 30-50 was the one genuinely reachable part, and it
      is now covered: `navigator.languages`, `navigator.language` and
      `Intl.DateTimeFormat` are all boundaries, stubbed exactly as
      `SettingsView.test.jsx` stubs them. It decides whether the whole walkthrough
      is shown in pounds and feet or kilograms and centimetres. Two notes from
      doing it, both of which cost a run:
    - **`new Intl.DateTimeFormat()` needs a constructible stub.** An arrow
      function in `mockImplementation` throws when called with `new`, which
      lands silently in the surrounding `catch` — so every test passes, but via
      the error path rather than the branch it names. Use `function stubbed() {}`.
    - **Every fallback in that chain ends at `"US"`.** A test whose locale
      resolves to US therefore cannot tell one fallback from the next, and six
      mutants survived because of it. Pin `navigator.languages[0]` and
      `navigator.language` to _different_ regions, and stub the ambient format
      to a metric one, so each step is distinguishable from the step after it.
      Done, and worth copying from: `SettingsView.jsx` (89%),
      `WorkoutResultPage.jsx` (100%), `MealView.jsx` (100%, which took the five
      `meal/*` panels with it), `useHomeStageFlow.js` (99% / 94% branches),
      `usePreviewChapterFlow.js` (100% / 100%),
      `usePreviewWeekParticleAnimation.js` (100% / 96%) and
      `usePreviewDerivedData.js` (99% / 84%) and
      `WorkoutsView.jsx` (100% / 99%), `TipsView.jsx` (97% / 95%),
      `SummaryView.jsx` (100% / 96%), `PlansView.jsx` (93% / 91%) and
      `useDashboardMetrics.js` (99% / 89%) both preview chapter components
      (100% / 100%) `App.jsx` (99% / 99%) `DashboardPage.jsx` (99% / 99%) `usePreviewWeekOutline.js` (98% / 94%) `PlannerSetupModal.jsx` (100% / 95%) `HomePersonalStage.jsx` (100% / 100%) `useDashboardData.js` (99% / 94%) `events.js` (100% / 99%) `useBodyModel.js` (100% / 100%) `DashboardAtAGlance.jsx` (100% / 100%) `PreviewPage.jsx` (97% / 87%) `PreviewDashboardChapter.jsx` (100% / 100%) `HomePage.jsx` (100% / 100%) `CaloriesView.jsx` (100% / 100%) and `AuthPage.jsx` (95% / 100%).
      `PreviewPage.jsx` had a chapter-body router whose final `else` arm no
      chapter id could reach: `usePreviewDerivedData` builds exactly
      `personal-info`, `generate`, `workout-week` and `dashboard-preview`, and
      the four arms above it handle all of them. That arm rendered a generic grid
      of textareas from `chapter.fields`, which is the only reason those arrays
      existed — every chapter built one and nothing read it. The arm, the arrays
      and the `getPreviewFieldRows` helper that sized their rows are all gone,
      which took the file from 94% / 65% to 97% / 87% by deletion rather than by
      testing. Its remaining uncovered branches are the `: null` the router now
      ends in, and two defensive guards that cannot fire
      (`!previewStageRef.current`, `!document.documentElement`).
      Removing them turned up something worth remembering. A test had been written
      asserting that the visitor's locale "reaches the fields the visitor actually
      reads", against `previewChapters[0].fields` — data nothing rendered.
      **Dead data invites tests that assert on it**, and such a test looks exactly
      like coverage of a real behaviour. That assertion now reads
      `previewFillOrder`, which is the sequence the typing animation walks.
      **There are no animation write-offs left.** All three hooks that were listed
      as untestable are now at or above 94% branches.
  - **Check before calling something untestable.** This entry said for months
    that the animation hooks were limited because they measure real element
    rects, which jsdom does not provide. Every part of that turned out wrong,
    and it cost four files their coverage:
    - `useMealDbSearch.js` sat at 0% described that way on nothing but proximity
      to them. It is a data-fetching hook and went to 97% with no layout at all.
    - `usePreviewChapterFlow.js` sat at 0% on the same list and **measures
      nothing** — it is a timed state machine over `setTimeout`, `setInterval`
      and `Date.now`, and fake timers drive all of it. 0% → 100%/100%.
    - `useHomeStageFlow.js` and `usePreviewWeekParticleAnimation.js` really do
      measure rects, and went to 94% and 96% branches anyway.

    The technique, in order of what to reach for:
    - **Layout is a boundary.** `getBoundingClientRect` is a function on the
      element you hand the hook, so a test stubs it exactly as it stubs `fetch`.
      The arithmetic on top of the fake numbers is the arithmetic that ships.
    - **Randomness is a boundary.** `vi.spyOn(Math, "random").mockReturnValue(0.5)`
      makes `randomBetween` land on its midpoint, so a cell's area maps to an
      exact particle count. Vary the draw to reach both sides of a coin flip.
    - **Where the output is a library call rather than DOM, record the call.**
      Wrapping `createTimeline` from animejs turns "it did not throw" into an
      assertion that a 600×320 panel morphs to 900×600 and translates by
      (-30, -60), and gives you the `onComplete` to invoke directly.

    Reach for those before writing anything off.

  - **`TZ` does not reach Node on this machine, so timezone claims cannot be
    verified locally.** `TZ=Asia/Tokyo node -e 'process.env.TZ'` prints
    `undefined` here, inline or exported, and the process keeps the system
    zone. A suite re-run under several `TZ` values therefore proves nothing —
    it is the same zone every time, and the passes are not independent. This
    has already produced a false claim in a merged PR description.
    What is actually available: the system zone (UTC-7) locally and **UTC in
    CI**, which sit on opposite sides of the boundary that matters, so a test
    that passes in both is genuinely exercised either side of midnight.
    Beyond that, reason arithmetically rather than by running: `new Date("Y-M-D")`
    is UTC midnight and `new Date(y, m, d)` is local midnight, and the signed
    difference between them **is** the offset — which settles which side of a
    comparison every zone falls on without needing to be in one.

  - **jsdom's CSSOM is not a faithful mirror, and guessing at it wastes a run.**
    `rgba(14, 14, 14, 1)` reads back as `rgb(14, 14, 14)`; `border: none` reads
    back as `""`, not `"none"`; and an unstyled element's computed `color` is
    `canvastext` rather than empty, so a `style.color || fallback` branch can
    never take its fallback here. Check what it stores before asserting on it.
  - **Prefer logic to markup — but a `*View.jsx` is not automatically markup.**
    `units.js`, `app/plans.js`, `tips/recommendationUtils.js`, `useOptimisticLogs.js`,
    `useApiClient.js` and `app/events.js` are all at or above 95% — pure functions,
    state machines, the request layer and every user action. That part holds.
    What did **not** hold is the corollary this file used to draw, that a view
    component is therefore more lines for less risk. Five of them were tested in
    2026-09 and each carried real derivation the rest of the tree does not:
    `SettingsView` infers the measurement system from the visitor's locale (0% → 89%),
    `WorkoutResultPage` transposes the plan table and derives every row label from the
    line text (0% → 100% statements, 97% branches), `MealView` picks the recommendation
    track from the goal text and the portion note from the calorie band, and took its
    five `meal/*` panels with it (0% → 100%), `TipsView` owns two fetches and a
    debounced search (0% → 44% branches), `PlansView` owns the saved-exercise paging
    (0% → 42%). Judge a component by whether it _computes_ anything, not by its suffix.
    A genuinely presentational view really is low value; these five were not.
  - **The auth path and the external routes are now covered**, and are the worked
    examples to copy. `authUserService.js`, `authRoutes.js` and `errorHandler.js` are
    at 100% statements; the weather and air-quality routes are covered end to end.
    Both suites stub only the boundary — the database, session store and cookie
    writers for auth; `fetchOpenMeteo` and `openAqRequest` for the external routes —
    and use the real injected function everywhere else, so password hashing is real
    argon2 and the AQI maths under test are the ones that ship.
  - **Pick by risk, not by size.** `middleware/errorHandler.js` was 33 lines at 15% with
    0% branch, and it is what masks 5xx detail before it reaches a client.
    `registerWgerRoutes.js` is five times the size and a read-only proxy of public
    exercise data — it is bottom of this list for a reason.
  - **When mutation-testing, confirm the mutation applied.** An unapplied mutation and an
    uncaught one both read as "tests passed". Check the file changed, not just the exit
    code. Five things have silently prevented a match so far: shell escaping eating a
    backslash, indentation not matching, an apostrophe in the pattern, **CRLF line
    endings** (some files here use them — match on `\r?\n`), and a **heredoc collapsing
    `\\n` to `\n`** even with a quoted delimiter. Three of those five are the shell, so
    **write mutation scripts with the Write tool rather than a heredoc**, and use
    `String.raw` for any pattern containing a backslash. The prompt in
    `generateRoutes.js` is the awkward case: its newlines are the two characters
    backslash-n inside a template literal. Not every survivor is a weak test either: removing the `!user?.hash` guard in
    `verifyPassword` is an equivalent mutant, because `argon2.verify` then throws and the
    existing catch returns the same `false`.
    Dropping the `ageValue !== null` guard on `useBodyModel`'s age adjustment is another,
    and the arithmetic is the proof rather than a run: the guard's else-branch is `0`, and
    `clamp((null - 40) / 45, 0, 0.22)` is `clamp(-0.889, 0, 0.22)`, which is also `0`.
    A mutant whose two sides you can evaluate on paper does not need a test written for it.
  - **A score that survives every mutation may be scoring the wrong string.** Five fields in
    `useBodyModel` are looked up in lower-case maps, and every value `HomePersonalStage`
    stores is the option label verbatim — `"Moderate"`, `"HIIT"`, `"High-protein"`. A single
    `toLowerText` joins them, so deleting it would drop all five to their defaults at once,
    invisibly. The test suite missed it because the fixtures were written in lower case;
    **build fixtures from what the form actually stores**, not from what the lookup expects.
  - **An unexpected survivor can mean two guards are testing the same thing, not
    that the test is weak.** `GeneratedPlanModal.jsx` opened with
    `if (!planModalOpen || !result) return null` and then passed
    `open={Boolean(planModalOpen && result)}` to `ModalPortal`. Mutating the
    early return survived, because with no result the portal rendered nothing
    anyway — the two guards are the same condition, so **no test could tell them
    apart, which is a proof of duplication rather than a gap**. The fix was to
    collapse it: the early return is now the only guard and the portal just gets
    `open`. The same mutation is caught now. When a survivor looks like a test
    gap, check first whether something else is already enforcing the condition.
    `ExerciseDetailsModal.jsx` carried the identical pair and got the identical
    fix, so **if you add a modal, give it one guard, not two** — the second one
    does nothing except make the first untestable.
  - **Guard a value once, where it is summed.** `useDashboardMetrics.js` had the
    same reading coerced two ways: the accumulation loops guarded with
    `Number.isNaN` before adding to `caloriesByDate`, while `avgCalories` folded
    `Number(item?.calories || 0)` with no guard at all. One unparseable row is
    enough — `sum + NaN` stays NaN for the rest of the fold — and `avgCalories`
    is rendered directly and drives a progress-bar width, so the card would read
    "NaN" and the bar would get `width: NaN%`. Latent rather than shipped: the
    calorie input is `type="number"` and the column is an Int, so nothing
    currently feeds it a non-number. Both sites now share `toMetricNumber`,
    which is the structural fix — two call sites that must agree will eventually
    stop agreeing.
  - **A deliberate survivor is how you prove a branch is dead.** `DashboardAtAGlance.jsx`
    had two conditions whose arms were the same string — `weatherError ? "Unavailable" :
"Unavailable"`, and the identical thing again for air quality. Deleting each condition
    outright was added to the mutation list _expecting_ it to survive, and it did: nothing
    observable depends on either test. That is a mechanical proof rather than a reading of
    the code, and it costs one run. Reach for it whenever two arms look alike.
    Both conditions have since been collapsed to the single string they always
    produced, so the mutations that proved them dead no longer have anything to
    target; they were replaced with ones that protect the wording itself. The
    wording is unchanged and the note under each card still carries the error
    text, so a visitor sees exactly what they saw before. **Whether a failed
    lookup should read differently from one that has not happened is a copy
    decision, and it is still open** — collapsing the condition removed a
    branch that could not make that distinction, not the question of whether to
    make it.
  - **A regex for "both arms are the same" needs care.** Sweeping the tree for
    this pattern turned up a third hit in
    `server/src/services/dashboardDataBuildersService.js`, which was a false
    positive: the code is
    `typeof item === "string" ? item : item?.name`, and a naive arm pattern
    stops at the `?.` and reads both arms as `item`. Those two were the only
    real instances in the repository.
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
  - `docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md` is excluded from Prettier.
    Version 3.9.6 **never converges** on it: every `--write` pass indents the continuation
    paragraphs under its nested `- [x]` task-list items four spaces deeper, growing the
    file 280 bytes per run with no fixed point. Re-test after a Prettier upgrade by
    checking byte-stability across ~3 consecutive passes, not by a single clean `--check`.
    Not every slow-converging file is that file. `docs/plans/2026-09-06-foundation-hardening.md`
    needed **two** `--write` passes to settle (70,068 then 70,066 bytes, stable after) and
    is not excluded, because it has a fixed point. The pathological case grows without
    bound; a file that stops changing is merely awkward. Measure before excluding one.
- `eslint.config.js` ignores `.claude/**` and `.githooks/**`, but **does** lint `scripts/**`
- **Lint is clean: 0 errors and 0 warnings.** It used to carry 12
  `react-hooks/exhaustive-deps` warnings; those are resolved, and the three that were
  deliberate now carry an inline disable explaining why. A new warning means you
  introduced it.
- **`npm run build` is clean.** It used to emit a "chunks larger than 500 kB" warning;
  that went away when `jspdf` moved to a dynamic import. The main chunk is ~407 kB.
  If the warning reappears, something got pulled back onto the eager path.
- Server needs `server/.env` (`PORT`, `DATABASE_URL`, `CLIENT_ORIGIN`, `GEMINI_API_KEY`)
- Server tests need Postgres: `npm run postgres:local:start -w server` first, or **96** of
  them fail with `Can't reach database server`, which is environmental, not a regression
  (measured 2026-09-12; this entry said ~40 before). The compose database works just as
  well — `docker compose up -d` and then the `DATABASE_URL` from `env.example` runs all
  **966** server tests green.

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

If `npx ruflo@latest init` overwrites `.claude/settings.json`, its permission allowlist is
hand-trimmed and worth keeping: restore with `git checkout -- .claude/settings.json`.

Re-run the verification checklist above after **any** `ruflo init`, not just a fresh clone.
A regenerated `settings.json` silently reverts the `scrub-junk-files.cjs` hook path to the
stale `.js` name, and a broken hook does not announce itself — the exit-code checks are the
only thing that will catch it.

## Security Rules

- NEVER hardcode API keys, secrets, or credentials in source files
- NEVER commit `.env` files or any file containing secrets — `server/.env` holds the
  Gemini key and the Postgres connection string
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
