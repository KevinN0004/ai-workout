# Development Roadmap — Design

Status: **Phases 0 and 1 shipped** on `feat/account-management`, via
`docs/plans/2026-09-18-baseline-and-account-management.md`. Phases 2 through 6
are approved but not started, and each still needs its own spec before any code.
Two findings from Phase 1 have already been folded into Phase 2's section below
— the migration-ordering hazard and the two fail-open edges in the session rule.

This is a **roadmap**, not an implementation plan. It decomposes work that spans several independent efforts, and each phase
below gets its own `docs/specs/` design and `docs/plans/` plan before any code
is written. Approving this document approves the decomposition and the order,
nothing more.

## What this covers

Three strands the recent work left open, sequenced into one order:

- the user-facing gaps the editable-profile effort explicitly deferred
- a new feature direction — closing the plan → do → review loop
- hardening, now with deploy as a real goal rather than a hypothetical

## Verification standing

Read this before trusting any quality claim below.

**This section has itself been superseded, and says so rather than being
quietly rewritten.** As first written it read: "Nothing was executed: no test
suite, no lint, no build, no database query," and every quality figure was
`CLAUDE.md`'s claim as of 2026-09-17 rather than a measurement.

That is no longer true. Phase 0 ran every gate and corrected the figures.
Phase 1 shipped, and its findings were measured: the cascade was verified
against live Postgres rather than read off `schema.prisma`, the credential rate
limit was measured by counting responses, and the timezone section under Phase 2
comes from probes run against the live database on one pinned connection.

What is still only a reading rather than a measurement is called out inline.
Treat a claim here as measured only where it says so.

That is not a formality. `CLAUDE.md` twice warns about itself — _"Re-measure
before trusting a ranking here; it goes stale every time anything lands"_ — and
records one instance where it stated the opposite of the truth about which file
was the largest client coverage gap. Phase 0 exists to settle this before any
later phase is planned against the numbers.

Two claims in this document are inferences, flagged again where they appear:

- ~~that `findUserById` returns a falsy value for a deleted row, which is what
  makes an orphaned session token degrade to a 401 rather than something worse.~~
  **Settled in Phase 1.** It does, and `authRoutes.test.js` now pins it by
  opening two sessions, deleting the account through one, and asserting the
  other no longer authenticates. `getSessionUser` also deletes that token now
  rather than leaving it to expire.
- that the weekday-prefix parse in `plans.js` is the only thing giving a plan
  day its identity. Grepped for `planId`, `generatedPlanId` and `fromPlan`
  across `client/src` and `server/src` with zero hits, but absence by grep is
  weaker than a trace.

## Problem

The repository is in good order — `main` is clean, all 20 remote branches are
merged, and there is not one `TODO` or `FIXME` in `client/src` or `server/src`.
The problems are not defects in what shipped. They are three things that shipped
work deliberately left for later, and one structural absence nobody has named.

### 1. The generated plan and the logged workout never meet

This is the significant one. `GeneratedPlan` stores `planText` and
`planPayload`; `WorkoutSession` stores a free-text `focus`. No column, route or
client path connects them. So the app generates a week, saves it, and logging a
workout is an unrelated act. There is no "day 3 done", no adherence, no
"you planned four and did two".

For an app whose purpose is fitness _planning_, that is the core loop left open.

Worse, a plan day has no identity to link to even if you wanted one.
`planPayload` is written as a literal `{}` on every save
(`generatedPlanRepository.js:60`) and `mapGeneratedPlan` never reads it back —
a dead `Json` column. The plan exists only as prose in `planText`, and the
**client** re-derives days from it by string-matching lines that begin with a
weekday name (`plans.js:33`). Two separate parsers do this: `parsePlanSections`
and `extractLatestPlanByWeekday`. Nothing recomputed from prose on every render
can be a foreign key.

### 2. There is no account management, and deploy makes that blocking

No change-password endpoint and no delete-account endpoint exist. `authRoutes.js`
exposes signup, login, logout, `/auth/me` and the two profile routes, and that
is all.

While the app ran locally this was a deferred nicety. It stores age, height,
weight and body fat, so as soon as it is public it is not: a person needs to be
able to rotate their password and remove their data.

It is also why each E2E run leaks an account. `CLAUDE.md` records that
`e2e-<timestamp>@example.test` accounts accumulate forever "because there is no
delete-account endpoint".

### 3. Nothing prunes any table

Every collection cap in this codebase is a read-side `take:` in
`userReadRepository`. No table is pruned, ever.
`generatedPlanRepository.js:20` already recorded the finding and deferred the
decision:

> The table growing without bound is pre-existing behaviour, not something
> introduced here — worth a separate decision if it ever matters.

Deploy is what makes it matter.

### 4. The app is written for production and has nowhere to go

There is no `Dockerfile`, no `fly.toml`, no `vercel.json`, no `render.yaml`, and
CI is a single `ci.yml` with `quality`, `test` and `build` jobs. Meanwhile the
server has a CORS allowlist, TLS options, four rate limiters, graceful
shutdown draining, Sentry wiring, and a `POSTGRES_STARTUP_REQUIRED` that
defaults true in production. The operational hardening is done. The deployment
does not exist.

## Decisions taken

- **Plan-day identity is structured server-side at write time.** Not asked of
  Gemini as JSON, and not kept client-side. Reasoning under Phase 4.
- **Deploy comes early, before the feature loop.** Infrastructure problems are
  found against a small surface rather than stacked underneath a new feature.
- **Account management gates deploy.** It is not sequenced first because it is
  urgent on its own merits; it is first because the app cannot responsibly be
  public without it.
- **Off-plan workouts stay first-class.** The link from session to plan day is
  nullable, which is what keeps Phase 5 additive rather than a rewrite of
  logging.
- **Each phase gets its own spec and plan.** This document is deliberately not
  detailed enough to implement from.

## Phases

### Phase 0 — Confirm the baseline

No code changes. Run `npm test`, `npm run lint`, `npm run build`,
`npm run knip` and `npm run format:check`, and record what they actually say.
Start Postgres first — `CLAUDE.md` measured that 96 server tests fail without it,
which is environmental and not a regression.

Then reconcile `CLAUDE.md` with the measurement, including the coverage figures
and the client uncovered-branch ranking, and correct whatever has drifted.

This phase exists because every later phase's "did I regress anything" depends
on knowing what green looked like, and because this document cannot honestly
claim the baseline is green.

### Phase 1 — Account management

Two endpoints, both behind `requireAuth` and both requiring the CSRF header
that `/api/csrf-token` already issues.

`POST /api/auth/password` takes the current and new password, verifies with the
existing `verifyPassword`, rehashes through `hashPassword`, and persists with
the existing `updatePasswordHash`. None of those three is new:
`updatePasswordHash` is already wired, for silently upgrading a pbkdf2 hash to
argon2id on login (`authUserService.js:115`). This route is composition of
covered pieces.

`DELETE /api/auth/me` takes the current password as confirmation and deletes the
`AppUser` row. All six relations carry `onDelete: Cascade`, so the children go
with it without a hand-written cascade.

**The one real design problem in this phase: sessions cannot be invalidated per
user.** `createSession` stores `{ userId, createdAt }` under a random token
(`sessionService.js:234`), and `deleteSession` removes exactly one token. There
is no user → token index in the Redis path or in the in-memory `Map`. So
"changing your password signs out your other devices" is not implementable as
the store stands. Three ways out, for the phase spec to choose between:

- maintain a user → token set alongside each session
- add `passwordChangedAt` to `AppUser` and reject sessions created before it —
  cheap, needs no index, and works identically for both session stores
- decide explicitly that other sessions survive a password change, and say so

The second is the recommendation. The third is acceptable if recorded; what is
not acceptable is leaving it unexamined.

On delete, a session token belonging to a removed user is expected to degrade to
a 401, because `getSessionUser` returns `findUserById(session.userId)` and
`requireAuth` rejects a falsy user. **That is an inference, not a measurement** —
pin it with a test rather than trusting this paragraph.

Finally, the E2E teardown. Both `e2e/smoke.spec.js` and `e2e/a11y.spec.js`
already have `test.afterAll` hooks, so removing the account each run is a call
inside a hook that exists.

### Phase 2 — Deploy

Two artifacts, because nothing serves `client/dist` from Express: a static
client bundle and a Node server process.

- a deploy workflow beside the existing `quality`, `test` and `build` jobs, and
  gated on them
- migrations as a deploy step, through the raw-SQL runner that applies every
  unapplied `.sql` in `server/db/postgres/` in filename order
- real values for `CLIENT_ORIGIN`, `POSTGRES_STARTUP_REQUIRED=true`,
  `REDIS_URL`, `SENTRY_DSN` and `GEMINI_API_KEY`
- a post-deploy smoke check against `/api/health` and `/api/ready`, which exist

**Redis stops being optional here.** In-memory sessions sign every user out on
each restart and cannot work across more than one instance. The env plumbing is
already built and tested; only the decision is missing.

**Migrations must land before the new code starts, and nothing currently
enforces that.** CI runs `migrate:postgres`, but there is no production deploy
path at all, so the ordering has never had to be decided. From Phase 1 onwards
this stops being academic: `002_password_changed_at.sql` adds a column that
`userReadRepository` selects on **every** user read. Start a server carrying
that code against a database that has not run `002` and every authenticated
request fails, not just the new routes. Whatever platform is chosen, the
migration step has to be ordered before the cutover, and a rollback has to be
thought about in the same breath — the old code tolerates the new column, so
migrate-then-deploy is safe in this direction, but that will not be true of
every future migration.

**Two fail-open edges in the session rule, both inherited from Phase 1.** The
`passwordChangedAt` comparison decides whether a session survives, and it fails
open in the direction of keeping sessions alive:

- **Clock skew across instances.** `createSession` stamps `Date.now()` on the
  app server. With more than one instance, a session created just after a
  password change elsewhere can carry a later wall-clock time and survive. This
  is a direct consequence of the Redis decision above — it cannot happen on one
  instance, and appears the moment there are two.
- **Precision truncation.** `timestamptz(6)` stores microseconds; the value
  crosses a string boundary through `toIso`, which emits milliseconds and
  truncates downward. The compared value is therefore never later than the true
  change, so a session created within the same millisecond survives. Sub-
  millisecond, and it exists only because of the string round trip.

Neither is worth fixing before there is a deployment to measure them against.
Both are worth naming here rather than discovering.

**Pin the Postgres session to UTC — and do it before the first deploy, not
after.** This is the one item here with a deadline, because its cost is
currently zero and becomes a data migration the moment real rows exist.

The database holds **two mutually inconsistent timestamp conventions**, and
which one a value gets depends on who wrote it. All figures below were measured
against the live database on a UTC-7 host:

| Written by                                          | Stored instant | Reads back     |
| --------------------------------------------------- | -------------- | -------------- |
| Prisma client (`created_at`, `password_changed_at`) | **+7h wrong**  | correct (0 ms) |
| Postgres (`set_updated_at` trigger's `now()`)       | correct        | **−7h wrong**  |

The driver sends UTC wall-clock digits with no offset and Postgres labels them
with the session zone, which is where the +7h comes from. The driver then
_ignores_ the offset again on read, symmetrically — which is exactly why
client-written values round-trip to the millisecond and nothing has ever caught
this. Database-written values do not round-trip: `updated_at` after an update
came back **−25,200,027 ms**.

Note that `created_at` is client-written despite the DDL declaring
`default now()`: Prisma's `@default(now())` supplies the value rather than
letting the column default fire. Measured, not assumed.

**User-visible impact today is nil**, which is why this is not a Phase 1 bug
fix. `updated_at` is exposed on exactly one mapper — calorie entries — and
nothing in the client renders it. What is broken is any comparison that crosses
the two conventions, which today means SQL-side readers: an admin query, a
`now() > password_changed_at` check, or the prune Phase 3 contemplates. All are
off by the host's offset.

**The fix is verified.** `SET TIME ZONE 'UTC'` on the session makes a fresh
write store `...+00` and round-trip with **0 ms** skew. Pinning the Node process
is not required; the session zone is what labels the digits.

**But it cannot simply be switched on, and that is the part the deadline turns
on.** The same row that reads back 0 ms under a UTC-7 session reads back
**+7h under a UTC session** — measured on one pinned connection. Flipping the
session zone re-interprets every previously client-written timestamp. So this
needs one of:

- do it **before any production data exists**, where it costs a connection
  parameter and nothing else, or
- do it afterwards and migrate, which means reconstructing each row's
  _write-time_ DST offset from the row itself — recoverable but fiddly, and
  wrong in the hour either side of a transition.

There is no production database yet, so the first option is available and free.
It stops being available on the day of the first deploy.

Phase 1 is also why it stops being cosmetic: before it, no timestamp comparison
gated authentication. Now one does, and across a DST transition the write-time
and read-time offsets differ by an hour — a window of sessions wrongly
surviving a password change, or wrongly signed out. Twice a year, only on a
non-UTC server, invisible to every test because CI runs in UTC.

The platform itself is deliberately unchosen in this document. It changes the
artifacts enough to be worth deciding with the phase spec in front of you rather
than guessing now.

### Phase 3 — Production data growth

Choose between prune-on-write, a scheduled prune, and index-and-accept, and
record the reasoning where `generatedPlanRepository.js:20` left the question.
Sequenced immediately after deploy because it is cheap while volumes are small
and awkward once they are not.

Note the existing constraint before designing a write-side prune: uniqueness on
these tables comes from _partial_ unique indexes that `schema.prisma` cannot
express, which is why the repositories read-then-write instead of using `upsert`.
That is deliberate and a prune must not assume otherwise.

### Phase 4 — Structure the plan at write

`/api/generate` parses the model response once, at write time, into
`planPayload`:

```text
{ version, days: [{ index, weekday, title, lines }], notes }
```

`planText` is left exactly as it is, so display and PDF export keep working
off it unchanged. `mapGeneratedPlan` starts returning the payload. The
weekday-matching logic moves server-side, where it can be tested against
captured fixtures instead of running in a browser on every render, and the
client's two parsers collapse into one structured read.

Plans saved before this phase have an empty payload, so the client keeps the
existing text parse as a fallback. That fallback _is_ the backfill — which is
why this phase needs no migration and no data rewrite. `planPayload` is already
a `Json` column.

Why this over the alternatives. Asking Gemini for JSON directly gives a cleaner
shape, but it changes the prompt, and prompt changes alter output quality in
ways this repository cannot verify — `CLAUDE.md` keeps plan generation out of the
E2E suite precisely because it needs a live key. It would also still need a
prose fallback for malformed JSON, which is this phase anyway. It is a good
follow-up once the structure is proven, not a starting point. Keeping adherence
in browser storage was rejected outright: `CLAUDE.md` is explicit that such
state never reaches another device and can come back empty, and adherence data
that vanishes on a phone is worse than no adherence feature.

### Phase 5 — Close the loop

`003_*.sql` adds nullable `generated_plan_id` and `plan_day_index` to
`workout_sessions`, with an index on the pair. (`002_password_changed_at.sql`
was taken by Phase 1 — this document originally assigned `002_` to both, and the
runner applies by sorted filename, so two files sharing the prefix would order
alphabetically on the suffix rather than by intent.) Nullable is the point: a workout
logged off-plan stays valid, so this is additive rather than a rewrite of
logging.

The write route and its schema accept the two fields. `WorkoutsView` gains a way
to log against a specific day of the current plan, and the plan display marks
the days that have a session attached.

Any new read joining sessions to plans goes through `userIdWhere` / `getUserPk`.
Those helpers are load-bearing — callers hold either the UUID primary key or the
legacy string id depending on when the account was created, and commit `19cc8ac`
exists because one path assumed only the legacy id.

### Phase 6 — Adherence against goals

`goals.weeklyWorkouts`, `goals.targetWeight` and `goals.targetCalories` are
already written by the client through `/api/dashboard/goals` (`events.js:382`)
and never read back as a measurement. Phase 5 makes planned-versus-completed
computable; `SummaryView` is where it belongs.

## Continuous track

Not a phase and not ordered against one:

- the coverage tails — `index.js` at 76% and `httpCacheService.js` at 77% per
  `CLAUDE.md`, to be re-measured in Phase 0. Most of what is uncovered in
  `index.js` is bootstrap the suite deliberately does not run.
- E2E breadth beyond the current four-step smoke path.

Before writing a test to reach an uncovered branch, check the branch is
reachable. `CLAUDE.md` documents several cases where it was not, and where the
right fix was deleting a dead guard rather than covering it.

## Testing

Each phase's spec owns its own test plan. Three repository conventions apply
throughout and are worth stating once:

- **Mutation-test anything whose test was written against existing behaviour.**
  A characterization assertion passes on its first run either way, so the
  mutation pass is the only thing that proves it discriminates. Confirm the
  mutation actually applied — an unapplied mutation and an uncaught one both
  read as "tests passed".
- **Guard absent input before `Number()`, never after.** Any numeric field added
  in Phase 5 or 6 gets a row in `numericCoercion.contract.test.js`. `null`, `""`
  and absent must agree, and a measured `0` must survive.
- **Accessibility is checked by axe against rendered pages**, not by the linter.
  New UI in Phases 1 and 5 gets scanned in `e2e/a11y.spec.js`, and any new modal
  gets exactly one open guard, not two.

## Open decisions deferred to phase specs

- Phase 1: how a password change affects other sessions — user → token index,
  `passwordChangedAt`, or an explicit decision that they survive
- Phase 2: the deployment platform, and therefore the artifact shape
- Phase 3: prune-on-write, scheduled prune, or index-and-accept
- Phase 5: whether logging against a plan day pre-fills the form from that day's
  prescription, or only records the link

## Out of scope

- Connected Apps, Privacy and Notifications — still hardcoded placeholders, and
  still out of scope. They need a product decision before they need an
  implementation.
- Changing email. There is no endpoint and no second factor to verify a new
  address with.
- Asking Gemini for structured JSON, per Phase 4's reasoning. Revisit once the
  payload shape has been in production.
- A per-plan `goal` override in `PlannerSetupModal`. The profile seeds it now;
  an override remains a separate question.
