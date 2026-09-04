# Retiring the Mongo Compatibility Shim

> **STATUS: IN PROGRESS.** Tasks 1, 2, 3, 3b and 4a are done. The shim is down
> to `User` alone, 240 lines from 544; Tasks 4b, 5 and 6 remain.
> Two of this plan's assumptions were wrong and are corrected inline under
> Task 1 — `upsert` cannot be used, and the read side cannot be migrated one
> model at a time.

**Goal:** Replace `server/src/services/prismaDataModels.js` — a MongoDB-shaped
API implemented on top of Prisma — with direct Prisma calls, and delete the shim.

**Recommendation before you start:** this is worth doing, but it is not urgent,
and it should not be done in one pass. The shim is correct, covered by tests, and
serving production traffic. What it costs is comprehension: every write path in
the app is expressed in the vocabulary of a database this project does not use.
Treat this as debt to retire deliberately, not a defect to fix.

---

## How this came about

Commit `4ce9da8` ("replace Mongo model layer with Prisma-backed data models")
swapped the storage engine underneath the application without touching the call
sites. That was the right call at the time — it kept the migration's blast radius
inside one file. The shim is the residue of that decision, and the `legacyUserId`
/ `legacyId` columns throughout `schema.prisma` exist to serve it.

---

## Research findings

Measured against the tree at `7ccbec0`, not assumed.

**Size.** 544 lines of shim, 214 lines of its tests.

**Surface actually used.** The shim exposes four models. Not every model
implements every method:

| Model | Methods used by callers |
| --- | --- |
| `User` | `findOne`, `create`, `updateOne`, `findOneAndUpdate` |
| `WorkoutSession` | `findOneAndUpdate`, `find` |
| `MealLog` | `findOneAndUpdate`, `find`, **`aggregate`** |
| `ProgressMetric` | `findOneAndUpdate`, `find` |

**Call sites.** 18 outside the shim, across 6 files:

| File | Calls |
| --- | --- |
| `services/authUserService.js` | 2 × `findOne`, `create`, `updateOne` |
| `routes/dashboard/write/registerWorkoutAndGoalRoutes.js` | 5 |
| `routes/dashboard/write/registerMealAndMetricRoutes.js` | 5 (incl. the aggregate) |
| `routes/dashboard/write/registerSavedExerciseRoutes.js` | 2 |
| `routes/authRoutes.js` | 1 |
| `routes/generateRoutes.js` | 1 |
| `services/dashboardCollectionService.js` | the `find().sort().limit()` chain, × 3 models |

**Mongo operators leaking into route code.** These are the actual migration
units — each needs a Prisma equivalent chosen deliberately:

| Operator | Uses outside the shim |
| --- | --- |
| `$set` | 9 |
| `$slice` | 6 |
| `$push` | 2 |
| `$each` | 2 |
| `$position` | 2 |
| `$pull` | 1 |

**The two hard parts.** Most of the above is mechanical. Two are not:

1. **`MealLog.aggregate`** (`registerMealAndMetricRoutes.js:52`) is a real
   pipeline — `$match` → `$group` → `$sum` with `$ifNull`. It computes a day's
   calorie total. In Prisma this is an `aggregate({ _sum })` with a `where`, but
   the null handling has to be preserved explicitly.
2. **`$push` with `$position: 0` and `$slice: 200`** (`generateRoutes.js:203`)
   is "prepend to a capped list". There is no Prisma equivalent — the list lives
   in a related table, so this becomes an insert plus a bounded delete, or an
   insert plus an ordered/limited read. Which one you choose changes behaviour
   under concurrency, so decide it explicitly rather than by accident.

**Safety net available.** 81 server tests, including `integration.api.test.js`
running against real Postgres, and 12 tests directly on the shim. Every write
path this plan touches has at least one test through it. That is what makes an
incremental migration checkable.

---

## Strategy

A strangler migration, one model at a time, **keeping the shim alive until its
last consumer is gone**. Do not attempt a big-bang rewrite: the shim's
`findOneAndUpdate` returns a mapped user document that callers then re-map with
`mapDbDocToUser`, so changing one call site changes the shape flowing through the
next.

Order is chosen by blast radius, smallest first:

1. `ProgressMetric` — 1 write, 1 read chain
2. `WorkoutSession` — 1 write, 1 read chain
3. `MealLog` — includes the aggregate
4. `User` — largest, and every other model's writes touch it via the dashboard
   re-read

At each step: replace the call sites for that model, delete that model from the
shim, run the full server suite. The suite must stay at 81+ green throughout; a
step that cannot keep it green is a step that needs splitting.

---

## Task outline

Each task is one model, and each follows the same shape. Write the failing test
first where behaviour is being pinned rather than merely moved.

- [x] **Task 1 — `ProgressMetric` writes.** Done. Replaced `findOneAndUpdate`
      with `repositories/progressMetricRepository.js`, and lifted the shim's
      private `rowValues` / `userLookup` helpers so the shim depends on the
      repositories rather than the reverse.

      Two corrections to this plan came out of doing it:

      **`upsert` is not usable.** The constraint that would make it safe is
      `progress_metrics_user_legacy_idx`, a *partial* unique index. Prisma
      cannot express partial indexes, so `upsert` has no constraint to target.
      The repository keeps an explicit read-then-write.

      **Reads cannot be migrated per model.** `dashboardCollectionService`
      drives all three collection models through one generic
      `find().sort().skip().limit()` chain. The per-model ordering below only
      holds for writes; the read side needs a single task covering all three at
      once. See Task 3b.

- [x] **Task 2 — `WorkoutSession` writes.** Done. Same shape as Task 1.

      Also removed a 35-line aggregation-pipeline update from the route that
      was **inert**: the shim only matches object updates carrying
      `$set`/`$push`/`$pull`, so an array pipeline fell through to a plain
      re-read. Its three claimed effects — prepend, dedupe, cap at 500 — are
      all provided elsewhere now that workouts live in their own table.

      Expect more of these. This plan counted `$`-operators as the units of
      migration work, assuming each does something. Some do not, so the real
      remaining effort is smaller than the counts suggest — and every pipeline
      should be checked against the shim's actual branches before being
      treated as behaviour to preserve.
- [x] **Task 3 — `MealLog`, including the aggregate.** Done.

      The null-handling trap this plan warned about was **already handled**:
      the shim's `aggregate` coalesced with `result._sum.calories || 0`. The
      repository keeps that, and it now has a test for the all-NULL case
      rather than relying on it being noticed again.

      The real finding was larger and is written up under *Defect found
      during Task 3* above: the ~110-line pipeline consuming that total never
      ran, so meal logs contribute nothing to the calories view. The dead
      pipeline was removed; `sumCaloriesForDate` — the half that works — was
      kept in the repository for whoever fixes the feature.
- [x] **Task 3b — the shared read chain, all three models at once.** Done.
      Moved to `repositories/dashboardCollectionRepository.js`, keyed by
      collection name rather than by a passed-in model object.

      The secondary sort is now honoured. Callers always asked for
      `{ [sortField]: -1, _id: -1 }`; the shim's `sort()` read one entry and
      discarded the rest. To be precise about severity: probing a live database
      showed paging still returning all six distinct rows across three pages,
      so this was **not a demonstrated defect** — stability among tied
      timestamps was unspecified rather than broken. It is now guaranteed.

      With the reads moved, `WorkoutSession`, `MealLog` and `ProgressMetric`
      have no consumers left and are gone from the shim, along with
      `createFindChain`. **The shim now exposes `User` alone.**

**Task 4 is too large for one change and is split.** As written it covers six
write call sites across four files — profile `$set`, goals `$set`, calories
`$push`, both saved-exercise routes, and the password-upgrade `updateOne`.

- [x] **Task 4a — saved exercises.** Done. Both call sites live in one route
      file and share `repositories/savedExerciseRepository.js`.

      Unlike Tasks 2 and 3, **nothing here was dead.** The shim's
      `extractFirstConcatEntry` matched this pipeline's exact shape, so the
      two-way deduplication — by external exercise id *or* case-insensitive
      name — is live behaviour that had to be preserved, not intent that was
      never running.

- [ ] **Task 4b — profile, goals, calories and the password upgrade.** The
      remaining `User` writes. `$set` becomes `update({ data })`. Keep the
      `userIdWhere` UUID-or-legacy resolution — it is load-bearing, and commit
      `19cc8ac` exists because it was got wrong once.
- [ ] **Task 5 — the capped plan list.** Decide and document the concurrency
      semantics, then implement. This is the only task with a genuine design
      question in it.
- [ ] **Task 6 — delete the shim** and its tests, and remove the now-unused
      `mapDbDocToUser` indirection if nothing else reads it. Verify no
      `$`-operator remains outside `node_modules`.

---

## Defect found during Task 3: meal logs never reach the calories view

**Not fixed. Needs a product decision, and it is not a refactor's business.**

The meal-log route computed a day's calorie total and built a large pipeline
to write it into `dashboard.calories` as a `meal_logs`-sourced entry, unless a
manual entry already existed for that day. That pipeline never executed — the
shim only matches object updates carrying `$set`/`$push`/`$pull`, and an array
pipeline falls through to a plain re-read.

Confirmed by probing a running server, not by reading:

```text
POST /api/dashboard/meal-logs  { date, name, calories: 700 }  -> 200
dashboard.calories                                            []
calorie_entries rows                                          []
```

So logging meals contributes nothing to the calories view, and has not for as
long as the shim has been in place. The meal itself saves correctly; only the
derived calorie entry is missing.

Task 3 removed the dead pipeline and **preserved the working half** as
`sumCaloriesForDate` in `repositories/mealLogRepository.js`, tested including
the all-NULL case. Wiring it up is a small change whenever the behaviour is
wanted. The decision to make is what *should* happen:

- should a meal log create or update a `meal_logs`-sourced calorie entry?
- should a manual entry for that day suppress it, as the dead code intended?
- should removing a meal log recompute or remove that entry? The dead code
  never handled deletion at all, so this was unspecified even in intent.

Current behaviour is pinned by a test named *"does not currently create a
calorie entry from a meal log"*, so changing it is deliberate and visible.

## Risks

- **The `legacy_id` columns are load-bearing until Task 6.** They are how the
  shim resolves records. Do not drop them in the same change that removes the
  shim; that is a separate migration, after this lands and is stable.
- **`userIdWhere` accepts either a UUID primary key or a legacy id.** Callers
  pass whichever they have. Preserve that, or sessions issued before the change
  stop resolving.
- **Partial unique indexes cannot be expressed in `schema.prisma`** (they carry
  `where ... is not null`). `upsert` against them works at the database level but
  Prisma will not know about the constraint, so conflict behaviour must be
  covered by a test rather than assumed from the schema.

---

## Out of scope

- Dropping `legacy_id` / `legacy_user_id` columns — a follow-up migration.
- Changing the `deps` service-locator object that carries these models into the
  routes. It is a separate piece of debt and folding it in would double the diff.
- Any change to the HTTP contract. This migration must be invisible to the client.
