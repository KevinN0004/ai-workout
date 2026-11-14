# Request body types from the zod schemas (roadmap lane D1, phase 2), design

Status: **decided 2026-11-14** with the owner, probed, nothing applied. The plan is
`docs/plans/2026-11-14-api-body-types.md`. Phase 1 is
`docs/specs/2026-11-02-jsdoc-type-checking-design.md`, which names this phase: "API types
inferred from the zod schemas and shared by both sides through JSDoc `import()` types, so a
form and the route that validates it cannot disagree about a field."

## Owner's decisions

1. **Body builders.** Each request body the client sends is built by a small pure function in
   a new checked module, `client/src/app/requestBodies.js`, typed against the server's schema.
   `events.js` calls the builders and stays unchecked until phase 3. Not chosen: checking
   `events.js` whole now, and checking only the small senders.
2. **Bodies exactly as today.** Phase 2 changes nothing on the wire. Each builder produces the
   JSON the client sends now. An undeclared key the types expose is reported to the owner, and
   any removal is a later decision of its own. Not chosen: builders that send only declared
   fields.

## What was found

Probed on `b6b6d92`, TypeScript 7.0.2 and zod 4.6.7, with throwaway files that were removed.

1. **The client's program can name a server schema.** A JSDoc
   `import("../../server/src/services/http/apiSchemaService.js")` in a client file resolves,
   and so does `zod`, which npm hoists to the root `node_modules`. Nothing reaches the bundle:
   the import is a comment to Vite.
2. **A checked server file is checked twice.** Once the client names it, the client's program
   checks it as well, under the client's options (DOM libraries, `bundler` resolution). It
   must pass both. An unchecked server file is only read for its types.
3. **Eleven of the sixteen body schemas are `.passthrough()`**, so `z.input` of each has an
   index signature, `[x: string]: unknown`, and a misspelled key passes. Progress metrics is
   `.strict()`. The swap, undo and both decision bodies strip unknown keys.
4. **A type built from the schema's `shape` drops the index signature.**
   `z.input<z.ZodObject<S["shape"]>>` keeps the declared fields and whether each is required.
   It caught a misspelled `rememberMee` and a number given for `focus`, a string field.
5. **Coerced fields type as `unknown`.** Every numeric and boolean field goes through
   `z.preprocess`, whose input is whatever arrives, so only the field's name and whether it is
   required are checked. A plain string, an enum, an array and a literal are checked in full:
   the decision bodies' `"undo" | "accept" | "decline"` and `"normal"` among them.
6. **Spreads are not checked for extra keys.** `{ ...form, rememberMe }` passes with any
   `form`, and a nested passthrough schema, signup's `profile`, keeps its index signature.
7. **The client sends undeclared keys today.** Signup's profile spreads in the whole signup
   form, `heightFeet`, `heightInches` and `weight` among them, and passthrough lets them
   through.
8. **Most bodies are built in `events.js`**, 925 lines, which reports 111 errors when checked.
   The two schema files and `profileMapping.js` report only missing parameter types: 15 in
   `apiSchemaService.js`, 6 in `routes/dashboard/validation.js`, 6 in `profileMapping.js`.
9. **Five bodies are a form's state sent whole**: the planner form to `/api/generate`, goals,
   progress metrics, and, with an id added, calories and meal logs. Their keys are fixed where
   the blank form is made: `createDefaultPlannerForm` in `constants.js`, and literals in
   `App.jsx`'s `useState` calls and the resets in `events.js`.

## Design

### The server: a type beside each schema

`server/src/services/http/apiSchemaService.js` and `server/src/routes/dashboard/validation.js`
get `// @ts-check`. The changes are annotations only. `validateBody` and the query and params
validators get small local typedefs for `req` and `res`, as no Express types are installed.
No schema changes, and every passthrough stays.

`apiSchemaService.js` defines the generic:

```js
/**
 * A body schema's declared fields as the client sends them, without the index
 * signature `.passthrough()` adds, so a misspelled key is an error.
 * @template {import("zod").ZodObject<any>} S
 * @typedef {import("zod").input<import("zod").ZodObject<S["shape"]>>} DeclaredBody
 */
```

Each body schema gets a typedef directly below it, sixteen in all:

| Typedef              | Schema                     | Route                                       |
| -------------------- | -------------------------- | ------------------------------------------- |
| `SignupBody`         | `signupBodySchema`         | POST /api/auth/signup                       |
| `LoginBody`          | `loginBodySchema`          | POST /api/auth/login                        |
| `PasswordChangeBody` | `passwordChangeBodySchema` | POST /api/auth/password                     |
| `AccountDeleteBody`  | `accountDeleteBodySchema`  | DELETE /api/auth/me                         |
| `ProfileBody`        | `profileBodySchema`        | POST /api/profile                           |
| `WorkoutSessionBody` | `workoutSessionBodySchema` | POST /api/dashboard/workout-sessions        |
| `CaloriesBody`       | `caloriesBodySchema`       | POST /api/dashboard/calories                |
| `GoalsBody`          | `goalsBodySchema`          | POST /api/dashboard/goals                   |
| `MealLogBody`        | `mealLogBodySchema`        | POST /api/dashboard/meal-logs               |
| `ProgressMetricBody` | `progressMetricBodySchema` | POST /api/dashboard/progress-metrics        |
| `SavedExerciseBody`  | `savedExerciseBodySchema`  | POST /api/dashboard/saved-exercises         |
| `GeneratePlanBody`   | `generatePlanBodySchema`   | POST /api/generate                          |
| `PlanSwapBody`       | `planSwapBodySchema`       | POST …/plans/:planId/swaps                  |
| `PlanUndoBody`       | `planUndoBodySchema`       | POST …/plans/:planId/swaps/undo             |
| `LiftDecisionBody`   | `liftDecisionBodySchema`   | PUT …/progression/:weekStart/lifts/:liftKey |
| `WeekDecisionBody`   | `weekDecisionBodySchema`   | PUT …/progression/:weekStart/week           |

Left out: the query and params schemas, which no form builds, and Strava's Sync now body,
`{ manual }`, which the route reads without a schema. Giving it one would change the server.

### The client: builders typed against the server

`client/src/app/requestBodies.js` is a new checked module of pure functions. Each one's
`@returns` names its typedef through a JSDoc `import()` of the server file:

- **Assembled bodies** get a builder that takes the parts the call site has now: signup, from
  the auth form, the signup profile form and the two units; login; password change; account
  delete; workout session, from `queueWorkout`'s fields; calories and meal logs, from the form
  and the new id; plan swap and undo; the lift and week decisions; and the saved exercise,
  which moves from `TipsView.jsx`'s `buildSavePayload`.
- **Form-shaped bodies** get their blank form built here, typed as the body: the planner form,
  moved from `createDefaultPlannerForm` in `constants.js`; goals; progress metrics. `App.jsx`'s
  initial state and `events.js`'s resets use them, so the keys are written once.
- **The profile body** stays `personalToProfile` in `profileMapping.js`, which is checked and
  gets `@returns` `ProfileBody`.

`events.js`, `planSwaps.js`, `useProgression.js`, `TipsView.jsx` and `App.jsx` call these
instead of writing the bodies inline. None of them is checked, so the types prove each
builder's output against the schema's declared fields for the inputs the builder declares,
not what an unchecked caller passes in. Phase 3 checks the callers.

Each builder reproduces today's JSON exactly, key order included, so a workout or meal
already waiting in a device's outbox replays as it would have. Tests written before each move
pin the body the old inline code built, and the moved code must pass them unchanged. Where a
builder's types expose an undeclared key, such as signup's `heightFeet`, the key stays and is
listed in the PR and the plan's status for the owner.

### Guards

In `scripts/__tests__/repo-invariants.test.mjs`:

1. every exported `…BodySchema` in the two schema files has a typedef `DeclaredBody` of it
   in the same file, so a new schema cannot arrive without its type;
2. each of those typedefs is named by a checked client file, so a type nothing uses shows;
3. `TYPE_CHECKED_FILES` rises by four, from 26 to 30: the two schema files,
   `requestBodies.js` and `profileMapping.js`.

The guards are test-first and mutation-tested, each mutation confirmed applied: a schema
added without its typedef, a typedef that names the wrong schema, and a typedef no client
file names.

### Proof that the types bite

For each builder, `npm run typecheck` must fail on a misspelled key and on a number given for
a string field, and pass once restored. For each decision body, it must fail on a value
outside the enum. Each mutation is written as a file with the Write tool and confirmed
applied before its result counts.

### Recorded

Decision record 0017 gains a section, and `CLAUDE.md` a line, for the rule this phase adds:
**client source may name a server module only inside a JSDoc `import()` type.** Runtime
imports of server code stay in test files. The record also notes the two conditions it rests
on: `zod` resolves from the root because npm hoists it, and a checked server file named from
the client must pass the client's program too (finding 2).

## Testing

- **Builders are test-first.** Each builder's test pins the body today's inline code sends,
  for an empty form and a filled one, written and passing against the old code before the code
  moves.
- **Mutations** are confirmed applied, as in "Guards" and "Proof that the types bite".
- **E2E** runs on each client PR. Sign-up, logging a workout and generating a plan all send
  bodies built here.
- **Coverage is measured** with `npm run test:coverage` and exact counts. Moving code out of
  `events.js` moves statements between files. A floor PR follows only if a figure rose.
- **The main bundle is measured.** `buildSavePayload` moves from the lazy `TipsView` chunk to
  the eager path, a few dozen bytes.

## PRs

1. This spec and its plan.
2. The server: both schema files checked, `DeclaredBody`, the sixteen typedefs, guard 1.
3. Account bodies: signup, login, password change, account delete; `profileMapping.js`
   checked; `requestBodies.js` created; guard 2 (pending typedefs it lists as allowed, so the
   list only shrinks).
4. Log bodies: workout session, calories, meal log, progress metrics, which flow through the
   outbox.
5. The rest: the planner form, goals, the saved exercise, swap and undo, both decisions. Guard
   2's pending list is empty and removed.
6. Server and client floors, only if a figure rose.
7. Close-out: roadmap status, decision record 0017, `CLAUDE.md`, the plan's status.

## Out of scope

- Changing any schema, passthrough included, or any body on the wire.
- Response types. No zod schema describes what the server answers.
- Checking `events.js`, `App.jsx` or any other caller, which is phase 3.
