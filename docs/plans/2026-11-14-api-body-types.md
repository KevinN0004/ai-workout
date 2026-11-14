# Request body types from the zod schemas (D1 phase 2), Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every request body the client sends to a route that validates it with zod is built
by a checked function typed against that route's schema, so a misspelled or mistyped field
fails `npm run typecheck`. Nothing changes on the wire or in the server's behaviour.

**Design:** `docs/specs/2026-11-14-api-body-types-design.md`. Its findings and the owner's
two decisions (body builders; bodies exactly as today) are not repeated here.

**Tech Stack:** TypeScript 7.0.2 over JSDoc, zod 4.6.7, React 19, Vite 8, Vitest 5 with v8
coverage, Playwright, gh CLI.

**Status: a plan.** Every file and line below was read on `b6b6d92`.

---

## Conventions

- One PR at a time, each on a new branch from current `origin/main`. Report after each, and
  merge only on the owner's OK, with a standalone `gh pr merge N --merge`, then watch main's
  CI and Deploy until "Live: the new instance reported ready".
- Each PR passes the floors on its own and edits no floor line. A floor PR (Task 6) follows
  only if a measured figure rose.
- Commits end with `Co-Authored-By: claude-flow <ruv@ruv.net>`. PR bodies end with
  `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.
- Every command starts with `cd "D:/ai-workout"`, uppercase drive: a lowercase `d:` makes
  Vitest load modules twice.
- Before each PR: `npm test`, `npm run lint`, `npm run typecheck`, `npm run format:check`,
  `npm run knip`, `npm run build`, and `npm run test:coverage` with
  `--coverage.reporter=json-summary`, comparing each side's covered counts with its floor.
  Client PRs also run `npm -w client run build` then `npm run test:e2e`.
- Mutations are written to a JSON file with the Write tool, applied by
  `tools/mutate-any.mjs` in the scratchpad, and each is confirmed applied (the file's text
  changed) before its result counts.
- Paths into the server from a client file are relative: from `client/src/app/`, the schema
  file is `../../../server/src/services/http/apiSchemaService.js`.

## Files

| File                                                        | Change                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `server/src/services/http/apiSchemaService.js`              | `// @ts-check`, parameter types, `DeclaredBody`, 12 typedefs |
| `server/src/routes/dashboard/validation.js`                 | `// @ts-check`, parameter types, 4 typedefs                  |
| `client/src/app/requestBodies.js`                           | new, checked: the builders and the blank forms               |
| `client/src/app/__tests__/requestBodies.test.js`            | new: each builder's output                                   |
| `client/src/app/__tests__/events.bodies.test.js`            | new: the exact JSON each handler sends, pinned before moving |
| `client/src/app/profileMapping.js`                          | `// @ts-check`, `@returns {ProfileBody}`                     |
| `client/src/app/events.js`                                  | calls the builders                                           |
| `client/src/app/planSwaps.js`                               | calls the swap and undo builders                             |
| `client/src/pages/dashboard/hooks/useProgression.js`        | calls the decision builders                                  |
| `client/src/pages/dashboard/views/TipsView.jsx`             | calls `savedExerciseBody`                                    |
| `client/src/App.jsx`                                        | blank forms from `requestBodies.js`                          |
| `client/src/app/constants.js`                               | `createDefaultPlannerForm` moves out                         |
| `scripts/__tests__/repo-invariants.test.mjs`                | guards 1 and 2, `TYPE_CHECKED_FILES`                         |
| `docs/adr/0017-type-checking-through-jsdoc.md`, `CLAUDE.md` | the type-only import rule (Task 7)                           |

---

## Task 1: Spec and plan (PR 1, `docs/d1-api-body-types`)

- [ ] Spec at `docs/specs/2026-11-14-api-body-types-design.md`, this plan, and both listed in
      `docs/README.md` under Plans and Specs.
- [ ] `npx prettier --check` on the three files, `npm run test:scripts`.
- [ ] Commit, push, open the PR, report, wait for the OK, merge, watch Deploy.

## Task 2: The server's types (PR 2, `feat/api-body-types-server`)

### 2a. Guard 1, test-first

- [ ] Add to `scripts/__tests__/repo-invariants.test.mjs`, inside `describe("type-checked files")`:

```js
// D1 phase 2: each body schema has a typedef of its declared fields, which
// the client's request builders name (docs/specs/2026-11-14-api-body-types-design.md).
const SCHEMA_FILES = [
  "server/src/services/http/apiSchemaService.js",
  "server/src/routes/dashboard/validation.js"
];
const bodyTypedefs = SCHEMA_FILES.flatMap((file) => {
  const text = readFileSync(path.join(repoRoot, file), "utf8");
  const schemas = [...text.matchAll(/^export const (\w+BodySchema)\b/gm)].map((m) => m[1]);
  const typedefs = [
    ...text.matchAll(/@typedef \{[^}]*DeclaredBody<typeof (\w+BodySchema)>\} (\w+)/g)
  ].map((m) => ({ schema: m[1], name: m[2] }));
  return schemas.map((schema) => ({
    file,
    schema,
    name: typedefs.find((t) => t.schema === schema)?.name ?? null
  }));
});

test("every body schema has a DeclaredBody typedef", () => {
  expect(bodyTypedefs.length, "the sweep found no body schemas").toBeGreaterThan(0);
  const missing = bodyTypedefs.filter(({ name }) => !name).map((t) => `${t.file} ${t.schema}`);
  expect(missing, "add `@typedef {DeclaredBody<typeof xBodySchema>} XBody` below each").toEqual([]);
});
```

- [ ] Run `npm run test:scripts`. Expected: FAIL, listing all sixteen schemas.

### 2b. Check `apiSchemaService.js`

- [ ] Insert `// @ts-check` on its own line directly below the header's `*/` (line 5).
- [ ] Annotate, changing no statement:
  - `toNumberInput`: `/** @param {unknown} value */` above it.
  - `requiredStringField`, `optionalStringField`: `/** @param {number} maxLen */`.
  - `optionalNullableNumberField`, `requiredNumberField`, `optionalNullableIntegerField`:
    `/** @param {number} min @param {number} max */`, each tag on its own line.
  - `optionalStringArrayField`: `@param {number} maxItems`, `@param {number} maxLen`.
  - `getValidationMessage`: below its summary,
    `@param {{ issues?: Array<{ path?: PropertyKey[], message?: string }> } | null | undefined} error`.
  - `validateBody`, below its summary:

```js
 * @template {import("zod").ZodType} S
 * @param {BodyRequest} req
 * @param {JsonResponse} res
 * @param {S} schema
 * @returns {import("zod").output<S> | null}
```

with these above it:

```js
/**
 * The part of an Express request validateBody reads.
 * @typedef {{ body?: unknown }} BodyRequest
 */

/**
 * The part of an Express response the validators answer a 400 with.
 * @typedef {{ status: (code: number) => { json: (body: unknown) => unknown } }} JsonResponse
 */
```

- [ ] Below the imports, the generic:

```js
/**
 * A body schema's declared fields as a client sends them, without the index
 * signature `.passthrough()` adds, so a misspelled key is an error. A field
 * zod coerces (numbers, booleans) reads as `unknown`.
 * @template {import("zod").ZodObject<any>} S
 * @typedef {import("zod").input<import("zod").ZodObject<S["shape"]>>} DeclaredBody
 */
```

- [ ] Directly below each of the twelve exported body schemas, its typedef, for example:

```js
/** @typedef {DeclaredBody<typeof signupBodySchema>} SignupBody */
```

The twelve: `SignupBody`, `LoginBody`, `PasswordChangeBody`, `AccountDeleteBody`,
`ProfileBody` (`profileBodySchema`), `WorkoutSessionBody`, `CaloriesBody`, `GoalsBody`,
`MealLogBody`, `ProgressMetricBody`, `SavedExerciseBody`, `GeneratePlanBody`.

### 2c. Check `routes/dashboard/validation.js`

- [ ] `// @ts-check` below its header.
- [ ] Above `validateQuery`, and its summary gains:

```js
 * @param {{ query?: unknown }} req
 * @param {import("../../services/http/apiSchemaService.js").JsonResponse} res
 * @param {import("zod").ZodType} schema
```

and `validateParams` the same with `{ params?: unknown }`. `fallbackPath` is inferred
from its default.

- [ ] Below each of the four body schemas:

```js
/** @typedef {import("../../services/http/apiSchemaService.js").DeclaredBody<typeof liftDecisionBodySchema>} LiftDecisionBody */
```

The four: `LiftDecisionBody`, `WeekDecisionBody`, `PlanSwapBody`, `PlanUndoBody`.

### 2d. Prove and measure

- [ ] `TYPE_CHECKED_FILES` 26 → 28. `npm run test:scripts`: PASS. `npm run typecheck`: PASS
      in both workspaces.
- [ ] **Annotation-only proof.** Parse main's and the branch's copy of each file with acorn
      (`ecmaVersion: "latest"`, `sourceType: "module"`, no `preserveParens`), drop `start`,
      `end`, `raw` and comments, compare the JSON: identical. Run one control mutant (change a
      `max` number) and see the compare report it.
- [ ] **Guard mutations**, each confirmed applied: delete `SignupBody`'s typedef (guard 1
      fails naming `signupBodySchema`); point `LoginBody` at `typeof signupBodySchema`
      (guard 1 fails naming `loginBodySchema`); restore.
- [ ] **The types bite.** In a throwaway checked file, `client/src/zz-bite.js`, assign
      `{ email: "a", password: "b", rememberMee: true }` to `LoginBody` and
      `{ decision: "nope" }` to `LiftDecisionBody`. `npm run typecheck -w client` fails on
      both (TS2561, TS2322). Delete the file and confirm `git status` is clean of it.
- [ ] Server coverage measured: statements, branches and functions unchanged; lines may move
      by a Prettier split only.
- [ ] Commit, PR, report, OK, merge, Deploy.

## Task 3: Account bodies (PR 3, `feat/api-body-types-account`)

### 3a. Pin today's bodies, before moving anything

- [ ] Create `client/src/app/__tests__/events.bodies.test.js`. It builds handlers the way the
      two existing suites do, copying their dependency builders rather than importing them:
      `events.test.js`'s for the auth handlers (it passes the real unit helpers and a
      `vi.fn()` for each setter), `events.handlers.test.js`'s for the logs. It asserts **the
      raw string** each call sends, so key order is pinned:

```js
/** The exact JSON each handler sends, pinned before its body moved to requestBodies.js. */
const sentBody = (deps, call = 0) => deps.apiFetch.mock.calls[call][1].body;

describe("account bodies", () => {
  test("sign-up, imperial units", async () => {
    const { deps, handlers } = buildDeps({
      authMode: "signup",
      authForm: { email: "a@b.co", password: "password1" },
      signupProfileForm: {
        ...defaultSignupProfileForm,
        firstName: "Sam",
        heightFeet: "5",
        heightInches: "10",
        weight: "170"
      },
      signupHeightUnit: "ft",
      signupWeightUnit: "lb"
    });
    await handlers.onAuthSubmit(submitEvent());
    expect(sentBody(deps)).toBe(EXPECTED_SIGNUP_IMPERIAL);
  });
  // ...and one each for: sign-up metric; login with authAutoSignIn true; login with it
  // false; changePassword; deleteAccount; submitProfile with cm/kg and with ft/lb.
});
```

Each `EXPECTED_*` constant is the literal JSON string. Write it by hand from the inline
code, then run the test against **unchanged** `events.js`: where it fails, the old code is
the truth, so correct the constant, never the code. All must pass before 3b.

- [ ] Run: `cd "D:/ai-workout" && npx vitest run --root client src/app/__tests__/events.bodies.test.js`.
      Expected: PASS.

### 3b. The builders, test-first

- [ ] Create `client/src/app/__tests__/requestBodies.test.js` with one `describe` per
      builder, asserting `JSON.stringify(builder(input))` equals the same strings as 3a
      for the same inputs, plus:
  - `signupBody` metric: `weightKg` falls back to `weightKg` when `weight` is blank;
  - `loginBody` keeps `rememberMe: false` (not dropped);
  - `accountDeleteBody("x")` is `{"password":"x"}`.
- [ ] Run it. Expected: FAIL, `Failed to resolve import "../requestBodies"`.
- [ ] Create `client/src/app/requestBodies.js`:

```js
/**
 * The bodies the client sends to the routes that check them with zod, each
 * typed against that route's schema (roadmap D1 phase 2). Each builds exactly
 * what its caller sent inline before, key order included.
 */
// @ts-check
import { toCmFromFeetInches, toKg } from "./units";

/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").SignupBody} SignupBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").LoginBody} LoginBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").PasswordChangeBody} PasswordChangeBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").AccountDeleteBody} AccountDeleteBody */

/** @typedef {{ email: string, password: string }} AuthForm */

/**
 * The sign-up body: the auth form, and the profile in centimetres and
 * kilograms, converted from the form's units. The rest of the profile form
 * travels as it is.
 * @param {{ authForm: AuthForm, profileForm: Record<string, string>, heightUnit: string, weightUnit: string }} parts
 * @returns {SignupBody}
 */
export const signupBody = ({ authForm, profileForm, heightUnit, weightUnit }) => ({
  ...authForm,
  profile: {
    ...profileForm,
    heightCm:
      heightUnit === "ft"
        ? toCmFromFeetInches(profileForm.heightFeet, profileForm.heightInches)
        : profileForm.heightCm,
    weightKg:
      weightUnit === "lb"
        ? toKg(profileForm.weight, "lb")
        : profileForm.weight || profileForm.weightKg
  }
});

/**
 * The sign-in body: the auth form, and whether to keep the session.
 * @param {AuthForm} authForm
 * @param {boolean} rememberMe
 * @returns {LoginBody}
 */
export const loginBody = (authForm, rememberMe) => ({ ...authForm, rememberMe });

/**
 * The password change body.
 * @param {{ currentPassword: string, newPassword: string }} passwords
 * @returns {PasswordChangeBody}
 */
export const passwordChangeBody = ({ currentPassword, newPassword }) => ({
  currentPassword,
  newPassword
});

/**
 * The account delete body: the password that confirms it.
 * @param {string} password
 * @returns {AccountDeleteBody}
 */
export const accountDeleteBody = (password) => ({ password });
```

If `npm run typecheck -w client` reports an argument type from `units.js` (its
signatures are checked), widen the parameter here to what `units.js` declares; do not
change `units.js`.

- [ ] Run both test files. Expected: PASS.

### 3c. `profileMapping.js` checked

- [ ] `// @ts-check` below the header. `toFormValue` and `toDayList`: `@param {unknown} value`.
      `personalToProfile`: `@param {Record<string, any> | null | undefined} personal`,
      `@param {{ heightUnit?: string, weightUnit?: string } | null | undefined} units`,
      `@returns {import("../../../server/src/services/http/apiSchemaService.js").ProfileBody}`.
      `profileToPersonal`: `@param {Record<string, any> | null | undefined} profile` and the
      same `units`.
- [ ] `npm run typecheck -w client`: PASS, or a real disagreement, which is reported, not
      fixed in this PR unless it is a bug, test-first.

### 3d. Move the call sites

- [ ] In `events.js`, `import { accountDeleteBody, loginBody, passwordChangeBody, signupBody } from "./requestBodies";`, then:
  - sign-up: `body: JSON.stringify(signupBody({ authForm, profileForm: signupProfileForm, heightUnit: signupHeightUnit, weightUnit: signupWeightUnit }))`, and delete `normalizedProfile`;
  - login: `body: JSON.stringify(loginBody(authForm, authAutoSignIn))`;
  - password: `body: JSON.stringify(passwordChangeBody({ currentPassword, newPassword }))`;
  - delete: `body: JSON.stringify(accountDeleteBody(password))`.
- [ ] `toCmFromFeetInches` and `toKg` stay among `createAppEventHandlers`' arguments
      (`events.js:121-123`): the home flow's personal step still uses them (`events.js:220`,
      `:230`). The builder imports the same two functions from `units.js`, which is what
      `App.jsx` passes in (`App.jsx:47`, `:424`) and what `events.test.js` passes (line 6),
      so the result is the same.
- [ ] Run `events.bodies.test.js`, `events.test.js`, `events.handlers.test.js`. Expected: PASS
      unchanged.

### 3e. Guard 2, with a pending list

- [ ] Add to the guards from 2a:

```js
// Typedefs no checked client file names yet. Only shrinks; empty after PR 5.
const PENDING_BODY_TYPES = [
  "WorkoutSessionBody",
  "CaloriesBody",
  "MealLogBody",
  "ProgressMetricBody",
  "GoalsBody",
  "SavedExerciseBody",
  "GeneratePlanBody",
  "PlanSwapBody",
  "PlanUndoBody",
  "LiftDecisionBody",
  "WeekDecisionBody"
];

test("every body typedef is named by a checked client file", () => {
  const clientText = checked
    .filter(({ file }) => file.startsWith("client/"))
    .map(({ lines }) => lines.join("\n"))
    .join("\n");
  const unnamed = bodyTypedefs
    .map(({ name }) => name)
    .filter((name) => name && !new RegExp(`\\.${name}\\b`).test(clientText));
  expect(unnamed, "name each body type in a checked client file").toEqual(PENDING_BODY_TYPES);
});
```

`toEqual` makes the list exact both ways: a type that becomes named must leave it.

- [ ] Mutations, confirmed applied: rename `AccountDeleteBody` in `requestBodies.js` to a
      typo (guard 2 fails); remove `ProfileBody`'s `@returns` (fails); move `CaloriesBody` out
      of the list (fails); restore each.
- [ ] `TYPE_CHECKED_FILES` 28 → 30.

### 3f. The types bite, and measure

- [ ] For each builder, a mutation with a misspelled key (`newPasword`, `rememberMee`,
      `pasword`, `profiel`) and one giving a number for a string field (`email: 1`), each
      confirmed applied: `npm run typecheck -w client` must exit non-zero naming
      `src/app/requestBodies.js`. Restore, typecheck PASS.
- [ ] Gates, coverage counts, main bundle size against main's, E2E. Report any undeclared key
      the types surfaced (signup's `heightFeet`, `heightInches`, `weight`, and the rest of the
      signup form) in the PR body.
- [ ] Commit, PR, report, OK, merge, Deploy.

## Task 4: Log bodies (PR 4, `feat/api-body-types-logs`)

These four reach the outbox, which stores a body and replays it later, so an exact match is
what lets a body queued before the deploy replay after it.

### 4a. Pin today's bodies

- [ ] Add a `describe("log bodies")` to `events.bodies.test.js`, pinning the raw string for:
      `submitWorkout` with the cards from `events.handlers.test.js`, with and without
      `planId`/`planDayIndex`; `finishSession` for a session from `sessionFromPlanDay`;
      `submitCalories`; `submitMealLog` (filled, and blank but for the name);
      `submitProgressMetric`. For the queued ones, run the commit's `request()` and read the
      `apiFetch` body, and assert the commit's `outbox.body` is the same object. Pin the clock
      (`vi.setSystemTime`) and stub `crypto.randomUUID` so ids and dates are fixed. PASS against
      unchanged code first.

### 4b. Builders, test-first

- [ ] Tests in `requestBodies.test.js`, then add to `requestBodies.js`:

```js
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").WorkoutSessionBody} WorkoutSessionBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").CaloriesBody} CaloriesBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").MealLogBody} MealLogBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").ProgressMetricBody} ProgressMetricBody */

/**
 * A workout's body, from the form or a finished session: the exercises named
 * from their sets, and the plan day's link only when it has a plan, since the
 * server takes an absent planId, never a null one.
 * @param {{ id: string, date: string, focus: string, duration: string | number, notes: string,
 *   exerciseSets: NonNullable<WorkoutSessionBody["exerciseSets"]>,
 *   planId?: string | null, planDayIndex?: number | null }} workout
 * @returns {WorkoutSessionBody}
 */
export const workoutSessionBody = ({
  id,
  date,
  focus,
  duration,
  notes,
  exerciseSets,
  planId,
  planDayIndex
}) => {
  const link = planId ? { planId, planDayIndex } : null;
  return {
    id,
    date,
    focus,
    duration,
    notes,
    exercises: exerciseSets.map((exercise) => exercise.name),
    exerciseSets,
    ...link
  };
};

/**
 * A calorie entry's body: the form, its replay key and its date.
 * @param {{ calories: string }} calorieForm
 * @param {string} id
 * @param {string} date
 * @returns {CaloriesBody}
 */
export const caloriesBody = (calorieForm, id, date) => ({ ...calorieForm, id, date });

/**
 * @typedef {{ date: string, mealType: string, name: string, calories: string,
 *   proteinG: string, carbsG: string, fatG: string, notes: string }} MealLogForm
 */

/**
 * A meal's body: the form and its replay key.
 * @param {MealLogForm} mealLogForm
 * @param {string} id
 * @returns {MealLogBody}
 */
export const mealLogBody = (mealLogForm, id) => ({ ...mealLogForm, id });

/**
 * The progress form as it starts and after each save: today's date, the rest
 * blank. Submitted whole, so its keys are the body's.
 * @param {string} date
 * @returns {ProgressMetricBody}
 */
export const blankProgressForm = (date) => ({
  date,
  weightLb: "",
  bodyFatPct: "",
  waistCm: "",
  restingHr: "",
  notes: ""
});
```

### 4c. Move the call sites

- [ ] `events.js` `queueWorkout`: `const payload = workoutSessionBody({ id, date, focus, duration, notes, exerciseSets, planId, planDayIndex });`, and the optimistic item's
      `exercises: payload.exercises`. The optimistic item reads `link?.planId ?? null` and
      `link?.planDayIndex ?? null` (`events.js:462-463`): read `payload.planId ?? null` and
      `payload.planDayIndex ?? null` instead, which are equal, since the payload carries both
      exactly when `link` exists. Then delete `exerciseNames` and `link`.
- [ ] `submitCalories`: `const payload = caloriesBody(calorieForm, crypto.randomUUID(), getLocalDateKey());`
- [ ] `submitMealLog`: `const payload = mealLogBody(mealLogForm, crypto.randomUUID());`
- [ ] `submitProgressMetric`'s reset: `setProgressForm(blankProgressForm(getLocalDateKey()));`
- [ ] `App.jsx`: `useState(() => blankProgressForm(getLocalDateKey()))` in place of the literal.
- [ ] Remove `WorkoutSessionBody`, `CaloriesBody`, `MealLogBody`, `ProgressMetricBody` from
      `PENDING_BODY_TYPES`. All event tests, `outbox.test.js`, `sendLog.test.js`: PASS.

### 4d. The types bite, and measure

- [ ] Per builder, a misspelled key (`exersiseSets`, `calorie`, `mealTyp`, `weightLbs`) and a
      number for a string field (`date: 1`), confirmed applied, each failing
      `npm run typecheck -w client`. `ProgressMetricBody` is the strict schema, so its
      misspelling is also a 400 at runtime: note it, change nothing.
- [ ] Gates, coverage, bundle, E2E (the workout and plan-day specs send these bodies).
- [ ] Commit, PR, report, OK, merge, Deploy.

## Task 5: The rest (PR 5, `feat/api-body-types-rest`)

### 5a. Pin today's bodies

- [ ] `events.bodies.test.js` gains `onSubmit` (the planner form from
      `createDefaultPlannerForm("Mobility")`), `submitGoals`, `saveExerciseToPlan`.
      `planSwaps.test.js` gains raw-string pins for `swapExercise` (with and without `area`)
      and `undoExerciseSwap`. `useProgression`'s test gains one for a lift decision and one
      for the week. `TipsView.test.jsx` gains a pin for the body passed to
      `onSaveExerciseToPlan` for a fixture exercise with a category, two muscles, an image and
      a video. PASS against unchanged code first.

### 5b. Builders, test-first

- [ ] Tests, then add to `requestBodies.js`:

```js
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").GoalsBody} GoalsBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").GeneratePlanBody} GeneratePlanBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").SavedExerciseBody} SavedExerciseBody */
/** @typedef {import("../../../server/src/routes/dashboard/validation.js").PlanSwapBody} PlanSwapBody */
/** @typedef {import("../../../server/src/routes/dashboard/validation.js").PlanUndoBody} PlanUndoBody */
/** @typedef {import("../../../server/src/routes/dashboard/validation.js").LiftDecisionBody} LiftDecisionBody */
/** @typedef {import("../../../server/src/routes/dashboard/validation.js").WeekDecisionBody} WeekDecisionBody */
```

- `createDefaultPlannerForm(goal)` moves here unchanged, with its summary from
  `constants.js`, `@param {string | null | undefined} goal`,
  `@returns {GeneratePlanBody}`, and `import { goalOptions } from "./constants";`.
- `blankGoalsForm()` returns `{ targetWeight: "", targetCalories: "2200", weeklyWorkouts: "3" }`,
  `@returns {GoalsBody}`.
- `savedExerciseBody(exercise, recommendation, media)` is `TipsView`'s
  `buildSavePayload` with `imageUrl: media.imageUrl, videoUrl: media.videoUrl` in place of
  the two helper calls, which stay in `TipsView`:

```js
/**
 * @typedef {{ id?: number | null, name?: string, category?: { name?: string } | null,
 *   muscles?: Array<{ name: string }>, equipment?: Array<{ name: string }> }} LibraryExercise
 */

/**
 * The body that saves a library exercise to the plan: the exercise's id, name,
 * category, muscles and equipment by name, its media, and the first reason it
 * was recommended.
 * @param {LibraryExercise | null | undefined} exercise
 * @param {{ reasons?: string[] } | null | undefined} recommendation
 * @param {{ imageUrl: string, videoUrl: string }} media
 * @returns {SavedExerciseBody}
 */
export const savedExerciseBody = (exercise, recommendation, media) => ({
  exerciseId: exercise?.id ?? null,
  name: exercise?.name || "",
  category: exercise?.category?.name || "",
  muscles: Array.isArray(exercise?.muscles) ? exercise.muscles.map((item) => item?.name) : [],
  equipment: Array.isArray(exercise?.equipment) ? exercise.equipment.map((item) => item?.name) : [],
  imageUrl: media.imageUrl,
  videoUrl: media.videoUrl,
  reason: recommendation?.reasons?.[0] || ""
});
```

    **Check before typing the items `{ name: string }`:** read what the wger route answers
    (`server/src/routes/external/registerWgerRoutes.js`) for a muscle or equipment item
    without a name. If one can arrive, the body today sends `null` in that array, which the
    schema refuses with a 400: report it to the owner as a finding, type the item as it
    really arrives, and leave the body unchanged.

- `planSwapBody({ from, to, area })` returns `{ from, to, area }`, `@returns {PlanSwapBody}`.
  `area` is `string | null | undefined`: `SWAP_AREAS` is a plain array, so the schema's
  enum types as `string`.
- `planUndoBody(name)` returns `{ name }`.
- `liftDecisionBody(decision)`, `@param {LiftDecisionBody["decision"]} decision`, returns
  `{ decision }`; `weekDecisionBody(decision)`, `@param {WeekDecisionBody["decision"]}`,
  the same.

### 5c. Move the call sites

- [ ] `App.jsx` imports `createDefaultPlannerForm` and `blankGoalsForm` from
      `./app/requestBodies`; `useState(blankGoalsForm)` replaces the goals literal.
      `constants.js` loses `createDefaultPlannerForm` (`goalOptions` stays). Update the
      imports in `constants.test.js` (its planner tests move to `requestBodies.test.js`
      unchanged) and `TipsView.test.jsx`.
- [ ] `planSwaps.js`: `postOf(planSwapBody({ from, to, area }))` and `postOf(planUndoBody(name))`.
- [ ] `useProgression.js`: `body: JSON.stringify(liftKey ? liftDecisionBody(decision) : weekDecisionBody(decision))`.
- [ ] `TipsView.jsx`: `onSaveExerciseToPlan(savedExerciseBody(exercise, recommendation, { imageUrl: getExerciseImage(exercise), videoUrl: resolveMediaUrl(exercise?.videos?.[0]?.url || "") }))`, and `buildSavePayload` is deleted.
- [ ] `PENDING_BODY_TYPES` is now empty: delete it and compare with `[]`. All tests PASS.

### 5d. The types bite, and measure

- [ ] Per builder, a misspelled key (`focusses`, `targetCalorie`, `exersiseId`, `too`,
      `nmae`, `decison`) and a wrong type (`level: 1`, `name: 1`, `decision: "nope"` for both
      decision builders), confirmed applied, each failing the client's typecheck.
- [ ] Gates, coverage, bundle (`buildSavePayload` moves from the lazy `TipsView` chunk to
      the eager one: record both chunks' sizes), E2E.
- [ ] Commit, PR, report, OK, merge, Deploy.

## Task 6: Floors (PR 6, only if a figure rose)

- [ ] On main after PR 5, with `client/dist` present, `npm run test:coverage` with
      `--coverage.reporter=json-summary`. For each side, truncate each figure to one decimal.
      If any exceeds its floor, raise that side's floors and its `Measured <date>` note in one
      `chore/d1p2-<side>-floor` PR; `npm run test:scripts` holds note and floor together.
      Otherwise no PR, and Task 7 records why.

## Task 7: Close-out (PR 7, `docs/d1p2-close-out`)

- [ ] Decision record 0017 gains a section, "Types shared across the workspaces (phase 2)":
      a client file may name a server module only inside a JSDoc `import()` type, and runtime
      imports of server code stay in test files; this rests on npm hoisting `zod` to the root,
      and on each checked server file it names also passing the client's program.
- [ ] `CLAUDE.md`, under "Type checking is per file": one sentence, at most 300 bytes, that
      client source names server code only in JSDoc `import()` types, pointing at 0017. The
      file is 39,427 of its 40,000 bytes: check with `npm run test:scripts`.
- [ ] The plan's status block: done, the PRs, and every departure. The spec's status:
      applied. Roadmap `status/D1` via ArtifactData: phase 2 done, phase 3 next. Memory: the
      D1 file and the handoff.
- [ ] Commit, PR, report, OK, merge, Deploy.
