# Editable Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the account profile editable after signup, persist the seven fields that are currently lost on reload, and seed plan generation from the user's real goal.

**Architecture:** Seven fields are added to the `profile` JSON column through the existing `defaultProfile`/`buildProfile`/`profileInputSchema` chain — no SQL migration. A new pure module, `client/src/app/profileMapping.js`, owns translation between the server's `profile` shape and the client's in-memory `personal` shape, and is the single place that conversion happens. `SettingsView` gains a per-tab Edit/Save mode and splits into three files. `personal` is hydrated from the stored profile on sign-in, making the profile the source of truth.

**Tech Stack:** React 18, Vite, Vitest + Testing Library (client); Express 4, Zod, Prisma (server).

**Design spec:** `docs/specs/2026-09-14-editable-profile-design.md`

---

## Background the engineer needs

Read these before starting. Each is a real constraint that has already caused a shipped bug in this repository.

**Absent is not zero.** `Number(null)` and `Number("")` are both `0` and both finite. Any numeric coercion that converts before testing turns missing data into a real-looking measurement. Guard **before** `Number()`, never after. Copy the shape of `toNullableNumber` in `server/src/services/dashboardDataBuildersService.js:6-13`. This matters here because `personal` holds `""` for an unfilled numeric field while `profile` holds `null`, and `bodyFat` is the exact field behind the shipped "3% body fat" bug. Do not "fix" this with `!value` — that swallows a genuine zero.

**`buildProfile` is a whitelist, not a merge.** It returns an explicit object literal. A field absent from that literal is silently dropped no matter what the Zod schema allows — `profileInputSchema` is already `.passthrough()` and the six unpersisted fields still never reach the database. Adding a field means adding it in **three** places: `defaultProfile`, `buildProfile`, and `profileInputSchema`.

**Reuse the existing helpers.** `cleanText`, `toCleanArray` and `toNullableNumber` are exported from `dashboardDataBuildersService.js`. `optionalStringField` and `optionalStringArrayField` already exist in `apiSchemaService.js`. `splitFullName`, `toCmFromFeetInches`, `toFeetInchesFromCm`, `toKg` and `toLb` are exported from `client/src/app/units.js`. Do not write new versions of any of these.

**Characterization tests prove nothing on their own.** A test written against existing code passes on its first run whether or not it asserts anything useful. Where a task says to mutation-test, actually apply the mutation, confirm the file changed on disk, and confirm the test fails. An unapplied mutation and an uncaught one both look like "tests passed".

---

## File Structure

**Server — modified**

- `server/src/services/dashboardDataBuildersService.js` — `allowedGoalValues`, plus seven fields in `defaultProfile` and `buildProfile`.
- `server/src/services/apiSchemaService.js` — seven fields in `profileInputSchema`.

**Server — created**

- `server/src/services/dashboardDataBuildersService.test.js` — direct unit tests for `buildProfile`. None exist today; it is covered only indirectly through `index.test.js` and `authRoutes.test.js`.

**Client — created**

- `client/src/app/profileMapping.js` — `profileToPersonal`, `personalToProfile`, `toProfileNumber`. Pure, no React import.
- `client/src/app/profileMapping.test.js`
- `client/src/app/constants.test.js`
- `client/src/pages/dashboard/views/settingsFields.js` — field descriptors driving both read and edit rendering.
- `client/src/pages/dashboard/views/settingsFields.test.js`
- `client/src/pages/dashboard/views/SettingsEditForm.jsx` — edit mode for one tab.
- `client/src/pages/dashboard/views/SettingsEditForm.test.jsx`

**Client — modified**

- `client/src/app/constants.js` — reinstate `goalOptions`, add `sexOptions` / `activityOptions`, add `goal` to `defaultPersonalForm`, and let `createDefaultPlannerForm` take a goal.
- `client/src/app/units.js` — export `IMPERIAL_REGION_CODES` (needed once `SettingsView` stops defining its own).
- `client/src/app/events.js` — `submitProfile` handler.
- `client/src/App.jsx` — hydration, `resetPersonalFlow`, planner goal seeding.
- `client/src/pages/dashboard/views/SettingsView.jsx` — drop duplicated locale helpers, add edit mode.
- `client/src/pages/DashboardPage.jsx:347` — pass `onSaveProfile` through; `personal` is already passed.
- `client/src/numericCoercion.contract.test.js` — a row for `toProfileNumber`.
- `client/vite.config.js` — coverage ratchet.

---

### Task 1: Server — the seven new profile fields

> **Status: done, and the code blocks below are superseded.** They are kept as
> written so the corrections are legible rather than erased. Three things in
> this task turned out to be wrong and were fixed during implementation:
> `sleep`/`experience`/`nutrition`/`cardio` are closed-set selects and are
> validated against allowlists rather than stored as free text via `cleanText`;
> the fixture `"7-8 hours"` is not a value the form can produce, the real option
> being `"7 - 8 hours"`; and the `"caps trainingDays at seven days"` test below
> is doubly obsolete — `trainingDays` is no longer capped at all, and that
> fixture put its duplicate at the END of the array, past where the buggy slice
> had already cut, so it could never have caught the bug it was named for. See
> the `trainingDays` note in Task 2 for the full history. Read the committed
> code, not this snippet.

**Files:**

- Modify: `server/src/services/dashboardDataBuildersService.js:26-46` and `:145-168`
- Create: `server/src/services/dashboardDataBuildersService.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/src/services/dashboardDataBuildersService.test.js`:

```js
import { describe, expect, test } from "vitest";
import { allowedGoalValues, buildProfile, defaultProfile } from "./dashboardDataBuildersService";

// buildProfile is a whitelist, not a merge: a field missing from its returned
// object literal is dropped however permissive the Zod schema is. These seven
// fields reached the server and were discarded for exactly that reason, so the
// assertions below are what stops that recurring.

describe("defaultProfile", () => {
  test("declares every persisted field", () => {
    expect(defaultProfile()).toMatchObject({
      sleep: "",
      timeline: "",
      experience: "",
      nutrition: "",
      cardio: "",
      goal: "",
      trainingDays: []
    });
  });
});

describe("buildProfile", () => {
  test("persists the training and lifestyle fields", () => {
    const profile = buildProfile({
      sleep: "7-8 hours",
      timeline: "3 months",
      experience: "Intermediate",
      nutrition: "High-protein",
      cardio: "HIIT"
    });

    expect(profile).toMatchObject({
      sleep: "7-8 hours",
      timeline: "3 months",
      experience: "Intermediate",
      nutrition: "High-protein",
      cardio: "HIIT"
    });
  });

  test("keeps trainingDays as an array of clean strings", () => {
    expect(buildProfile({ trainingDays: ["Monday", "  Tuesday  ", ""] }).trainingDays).toEqual([
      "Monday",
      "Tuesday"
    ]);
  });

  test("caps trainingDays at seven days", () => {
    const eight = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(buildProfile({ trainingDays: eight }).trainingDays).toHaveLength(7);
  });

  test("defaults trainingDays to an array when given a non-array", () => {
    expect(buildProfile({ trainingDays: null }).trainingDays).toEqual([]);
  });

  test("accepts a goal from the allowed list", () => {
    expect(buildProfile({ goal: allowedGoalValues[1] }).goal).toBe(allowedGoalValues[1]);
  });

  test("rejects a goal outside the allowed list", () => {
    expect(buildProfile({ goal: "Become a wizard" }).goal).toBe("");
  });

  test("still strips genuinely unknown fields", () => {
    expect(buildProfile({ favouriteColour: "green" })).not.toHaveProperty("favouriteColour");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --root server src/services/dashboardDataBuildersService.test.js`

Expected: FAIL. `allowedGoalValues` is not exported, and the `toMatchObject` assertions report the seven keys as missing.

- [ ] **Step 3: Add the allowed goal list**

In `dashboardDataBuildersService.js`, directly below `allowedActivityValues` on line 27:

```js
// Reinstated from commit c2c820f, which removed it as dead code. It is live
// again because the profile now carries a goal and the planner seeds from it.
export const allowedGoalValues = [
  "Build lean strength and energy",
  "Fat loss + conditioning",
  "Mobility",
  "Recovery",
  "Cardio"
];
```

Then beside `allowedActivities` on line 30:

```js
const allowedGoals = new Set(allowedGoalValues);
```

- [ ] **Step 4: Add the fields to `defaultProfile`**

In the object returned by `defaultProfile()`, above `updatedAt`:

```js
  sleep: "",
  timeline: "",
  experience: "",
  nutrition: "",
  cardio: "",
  goal: "",
  trainingDays: [],
```

- [ ] **Step 5: Add the fields to `buildProfile`**

In the object returned by `buildProfile()`, above `updatedAt`:

```js
    sleep: cleanText(input.sleep, 40),
    timeline: cleanText(input.timeline, 60),
    experience: cleanText(input.experience, 40),
    nutrition: cleanText(input.nutrition, 60),
    cardio: cleanText(input.cardio, 60),
    goal: allowedGoals.has(input.goal) ? input.goal : "",
    trainingDays: toCleanArray(input.trainingDays, 7, 20),
```

`toCleanArray` is already defined in this file at line 14 and already coerces a non-array to `[]` via `filter(Boolean)`. Do not write a new array helper.

- [ ] **Step 6: Run the test and watch it pass**

Run: `npx vitest run --root server src/services/dashboardDataBuildersService.test.js`

Expected: PASS, 8 tests.

- [ ] **Step 7: Confirm signup is unaffected**

Run: `npx vitest run --root server src/routes/authRoutes.test.js`

Expected: PASS. `isCompleteSignupProfile` was not touched and none of the new fields are required.

- [ ] **Step 8: Commit**

```bash
git add server/src/services/dashboardDataBuildersService.js server/src/services/dashboardDataBuildersService.test.js
git commit -m "feat(server): persist the seven profile fields that were being dropped"
```

---

### Task 2: Server — accept the new fields at the boundary

**Files:**

- Modify: `server/src/services/apiSchemaService.js:41-54`
- Test: `server/src/routes/authRoutes.test.js`

- [ ] **Step 1: Write the failing test**

Append inside the existing `POST /api/profile` describe block in `server/src/routes/authRoutes.test.js`:

```js
test("accepts and returns the training and lifestyle fields", async () => {
  const app = buildApp();
  const response = await request(app)
    .post("/api/profile")
    .send({
      sleep: "7 - 8 hours",
      timeline: "3 months",
      experience: "Intermediate",
      nutrition: "High-protein",
      cardio: "Mixed",
      goal: "Mobility",
      trainingDays: ["Monday", "Wednesday"]
    });

  expect(response.status).toBe(200);
  expect(response.body.profile).toMatchObject({
    sleep: "7 - 8 hours",
    cardio: "Mixed",
    goal: "Mobility",
    trainingDays: ["Monday", "Wednesday"]
  });
});

// One per closed-set field. An allowlist that silently omits a real option is
// the same defect class this whole change exists to close, so each field is
// asserted separately rather than trusting one representative.
test.each([
  ["sleep", "Nine-ish"],
  ["experience", "Wizard-tier"],
  ["nutrition", "Junk only"],
  ["cardio", "Interpretive dance"],
  ["goal", "Become a wizard"]
])("rejects a %s value outside the allowed list", async (field, value) => {
  const response = await request(buildApp())
    .post("/api/profile")
    .send({ [field]: value });

  expect(response.status).toBe(400);
});
```

The surrounding block already builds an authenticated app; follow the existing `buildApp()` usage in that file rather than constructing a new one.

**The fixture values above are exact and matter.** `sleep` is `"7 - 8 hours"` with spaces around the hyphen, and `cardio` is deliberately `"Mixed"` — the eighth option, the one most easily dropped from a hand-written allowlist. Both are taken from the `<option>` elements in `HomePersonalStage.jsx`. Do not "tidy" them. An earlier draft of this plan wrote `"7-8 hours"`, which is not a value the form can produce, and would have passed against a schema that was wrong in the same direction.

- [ ] **Step 2: Run the tests and watch the right ones fail**

Run both:

```bash
npx vitest run --root server src/routes/authRoutes.test.js -t "training and lifestyle"
npx vitest run --root server src/routes/authRoutes.test.js -t "rejects a"
```

Expected: the acceptance test **passes** already; the five rejection tests **fail**.

That is not a mistake in the test — it is what this task actually fixes, and it is worth understanding before writing the schema. `profileInputSchema` is `.passthrough()`, and Zod's passthrough **keeps undeclared keys unvalidated rather than stripping them**. So once Task 1 taught `buildProfile` to read these seven fields, valid values were already arriving through the passthrough gap. The happy path needs no schema change.

What was still broken is the invalid path. An out-of-list value reached `buildProfile`, which silently coerced it to `""` — data loss reported as a success. Declaring the fields turns that into a 400 at the boundary, before any write.

The acceptance test is still worth keeping: it pins the schema and `buildProfile` agreeing about the valid values, which is the pairing the `"Mixed"` near-miss in Task 1 showed is easy to break. Just do not expect it to be the test that fails here.

An earlier draft of this step claimed the fields were "stripped before reaching `buildProfile`". That was wrong on both counts — passthrough does not strip, and Task 1 had already landed.

- [ ] **Step 3: Extend the schema**

In `apiSchemaService.js`, add to the `profileInputSchema` object literal, after `notes`:

```js
    sleep: z.union([z.enum(allowedSleepValues), z.literal("")]).optional(),
    timeline: optionalStringField(60),
    experience: z.union([z.enum(allowedExperienceValues), z.literal("")]).optional(),
    nutrition: z.union([z.enum(allowedNutritionValues), z.literal("")]).optional(),
    cardio: z.union([z.enum(allowedCardioValues), z.literal("")]).optional(),
    goal: z.union([z.enum(allowedGoalValues), z.literal("")]).optional(),
    trainingDays: z.array(z.enum(allowedTrainingDayValues)).max(7).optional()
```

Import the six `allowed*Values` lists from `./dashboardDataBuildersService.js` alongside the existing `allowedSexValues` / `allowedActivityValues` import. **Do not retype the option strings here** — import the lists Task 1 created, so the schema and `buildProfile` cannot disagree about what is valid.

Only `timeline` is free text. Every other field here is closed-set and is declared the way `sex` already is, so an invalid value is a 400 rather than a silent fallback to `""`. `buildProfile` still guards each one independently; that double-guarding matches the existing `sex` precedent and is deliberate.

**`trainingDays` was got wrong three times before reaching the form above, and the history is the reason for the shape.** An earlier version of this plan said the schema should merely clean the strings and let `buildProfile` drop unknown days silently, justified as being kind to clients — one stray entry should not reject a whole save. That was wrong, and the sequence is worth knowing because the same instinct will recur:

1. `buildProfile` capped the list to 7 before deduping, so selecting all seven days stored six.
2. The schema then capped to 7 before `buildProfile`'s day filter, so `["x1".."x7","Monday"]` stored nothing at all — and returned 200.
3. Widening that cap to 64 moved the identical failure to 65 entries rather than removing it.

**A length cap placed in front of a membership filter silently discards valid data, and raising the number never fixes it.** The cure is to stop capping and start validating: with `z.enum`, an unknown day is a 400, and `z.array().max()` _rejects_ rather than truncating, so no silent drop remains anywhere in the path. It also makes `trainingDays` consistent with every sibling closed-set field instead of being the one that quietly discards bad input.

`buildProfile` was changed to match — it no longer slices its input at all, and instead filters `allowedTrainingDayValues` against whatever it was given, so the result is bounded at seven and deduped by construction with no cap to place wrongly.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --root server src/routes/authRoutes.test.js`

Expected: PASS.

- [ ] **Step 5: Run the whole server suite**

Run: `npm -w server run test`

Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/apiSchemaService.js server/src/routes/authRoutes.test.js
git commit -m "feat(server): accept the new profile fields at the API boundary"
```

---

### Task 3: Client — the profile mapping module

> **Rewritten before dispatch.** The first draft of this task was wrong in two
> ways that verification against the tree caught, both worth understanding
> before you start:
>
> - It mapped weight as `weightKg: toProfileNumber(personal.weight)`. That is
>   flatly wrong. `personal.weight` is a single field holding the number **in
>   whatever unit is currently active**, which is why `useBodyModel` resolves it
>   as `toKg(personal.weight, weightUnit)`. Without the unit, a user weighing
>   170 lb would have been stored as 170 kg.
> - It picked height as `heightCm ?? cmFromFeetInches(...)`. The app does not do
>   that. Both the signup flow and `useBodyModel` let the **active unit** decide
>   which of the two inputs wins, because the other one goes stale as soon as
>   the user types. Preferring `heightCm` unconditionally would ignore an edit
>   made in feet and inches.
>
> Both functions therefore take the active units. Do not "simplify" that away.

**Files:**

- Create: `client/src/app/profileMapping.js`
- Create: `client/src/app/profileMapping.test.js`

**The rule this module exists to enforce:** `personal` is form state — every
field is a string, and `""` means "not filled in". `profile` is stored state —
numbers are numbers and `null` means "not set". Converting between them is
exactly where `Number("")` turns an empty field into a measured zero, which is
the bug that once modelled a user at 3% body fat. Guard before coercing.

- [ ] **Step 1: Write the failing test**

Create `client/src/app/profileMapping.test.js`:

```js
import { describe, expect, test } from "vitest";
import { personalToProfile, profileToPersonal, toProfileNumber } from "./profileMapping";

// The two shapes disagree about names, about units, and about how they spell
// "no value": `personal` uses "" because it backs form inputs, `profile` uses
// null because it is stored.
//
// Units are the sharp edge. `personal.weight` is a single field holding the
// number in whatever unit is active, so a mapper that ignores the unit stores
// 170 lb as 170 kg. Height has the same problem in the other direction: the cm
// field and the feet/inches fields both exist, and whichever one the user is
// not currently typing into is stale.

describe("toProfileNumber", () => {
  test.each([
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined]
  ])("treats %s as absent", (_label, value) => {
    expect(toProfileNumber(value)).toBeNull();
  });

  // Both spellings matter. A guard written as `if (!value)` still passes the
  // string "0", which is truthy, and only fails on the number -- so testing the
  // string alone lets the forbidden falsiness guard through.
  test.each([
    ["a numeric string", "0"],
    ["a number", 0]
  ])("keeps a measured zero given as %s", (_label, value) => {
    expect(toProfileNumber(value)).toBe(0);
  });

  test("parses a real measurement", () => {
    expect(toProfileNumber("34")).toBe(34);
  });

  test("treats a non-numeric string as absent", () => {
    expect(toProfileNumber("not-a-number")).toBeNull();
  });
});

describe("personalToProfile", () => {
  test("splits the display name into first and last", () => {
    expect(personalToProfile({ name: "Jordan Fields" })).toMatchObject({
      firstName: "Jordan",
      lastName: "Fields"
    });
  });

  test("sends an unfilled body fat as null, not zero", () => {
    expect(personalToProfile({ bodyFat: "" }).bodyFat).toBeNull();
  });

  test("keeps an entered body fat of zero", () => {
    expect(personalToProfile({ bodyFat: "0" }).bodyFat).toBe(0);
  });

  // The bug this signature exists to prevent: without the unit, 170 lb is
  // stored as 170 kg, which is 375 lb.
  test("converts pounds to kilograms before storing", () => {
    expect(personalToProfile({ weight: "170" }, { weightUnit: "lb" }).weightKg).toBe(77);
  });

  test("stores kilograms unchanged", () => {
    expect(personalToProfile({ weight: "77" }, { weightUnit: "kg" }).weightKg).toBe(77);
  });

  test("sends an unfilled weight as null", () => {
    expect(personalToProfile({ weight: "" }, { weightUnit: "lb" }).weightKg).toBeNull();
  });

  // The active unit decides which height input wins, matching useBodyModel.
  // The other field is stale whenever the user is typing in the first one.
  test("takes height from feet and inches while the imperial unit is active", () => {
    const profile = personalToProfile(
      { heightCm: "180", heightFeet: "5", heightInches: "10" },
      { heightUnit: "ft" }
    );
    expect(profile.heightCm).toBe(178);
  });

  test("takes height from centimetres while the metric unit is active", () => {
    const profile = personalToProfile(
      { heightCm: "180", heightFeet: "5", heightInches: "10" },
      { heightUnit: "cm" }
    );
    expect(profile.heightCm).toBe(180);
  });

  test("falls back across units when the active unit's field is empty", () => {
    expect(
      personalToProfile({ heightCm: "180", heightFeet: "", heightInches: "" }, { heightUnit: "ft" })
        .heightCm
    ).toBe(180);
  });

  test("defaults to metric when no units are supplied", () => {
    expect(personalToProfile({ weight: "77", heightCm: "180" }).weightKg).toBe(77);
  });

  test("carries the training and lifestyle fields straight through", () => {
    expect(
      personalToProfile({
        sleep: "7 - 8 hours",
        timeline: "3 months",
        experience: "Intermediate",
        nutrition: "High-protein",
        cardio: "Mixed",
        goal: "Mobility",
        trainingDays: ["Monday"]
      })
    ).toMatchObject({
      sleep: "7 - 8 hours",
      timeline: "3 months",
      experience: "Intermediate",
      nutrition: "High-protein",
      cardio: "Mixed",
      goal: "Mobility",
      trainingDays: ["Monday"]
    });
  });

  test("never sends a non-array trainingDays", () => {
    expect(personalToProfile({ trainingDays: "Monday" }).trainingDays).toEqual([]);
  });
});

describe("profileToPersonal", () => {
  test("joins first and last into the display name", () => {
    expect(profileToPersonal({ firstName: "Jordan", lastName: "Fields" }).name).toBe(
      "Jordan Fields"
    );
  });

  test("renders a null measurement as an empty form field, not zero", () => {
    const personal = profileToPersonal({ age: null, weightKg: null, bodyFat: null });

    expect(personal.age).toBe("");
    expect(personal.weight).toBe("");
    expect(personal.bodyFat).toBe("");
  });

  test("keeps a stored zero visible in the form", () => {
    expect(profileToPersonal({ bodyFat: 0 }).bodyFat).toBe("0");
  });

  test("shows weight in pounds when the imperial unit is active", () => {
    expect(profileToPersonal({ weightKg: 77 }, { weightUnit: "lb" }).weight).toBe("170");
  });

  test("shows weight in kilograms when the metric unit is active", () => {
    expect(profileToPersonal({ weightKg: 77 }, { weightUnit: "kg" }).weight).toBe("77");
  });

  test("fills both height representations", () => {
    const personal = profileToPersonal({ heightCm: 178 });

    expect(personal.heightCm).toBe("178");
    expect(personal.heightFeet).toBe("5");
    expect(personal.heightInches).toBe("10");
  });

  test("defaults trainingDays to an array", () => {
    expect(profileToPersonal({ trainingDays: null }).trainingDays).toEqual([]);
  });

  test("supplies the rest of the personal form so callers get a complete shape", () => {
    expect(profileToPersonal({})).toHaveProperty("notes", "");
  });
});

describe("round trips", () => {
  test("weight survives a metric round trip exactly", () => {
    const personal = profileToPersonal({ weightKg: 77 }, { weightUnit: "kg" });
    expect(personalToProfile(personal, { weightUnit: "kg" }).weightKg).toBe(77);
  });

  test("weight survives an imperial round trip exactly", () => {
    const personal = profileToPersonal({ weightKg: 77 }, { weightUnit: "lb" });
    expect(personalToProfile(personal, { weightUnit: "lb" }).weightKg).toBe(77);
  });

  test("height survives a metric round trip exactly", () => {
    const personal = profileToPersonal({ heightCm: 181 });
    expect(personalToProfile(personal, { heightUnit: "cm" }).heightCm).toBe(181);
  });

  // Imperial height is displayed to the nearest inch, so a stored centimetre
  // value that is not exactly representable moves by at most 1cm the first time
  // an imperial user saves. Measured across 140-210cm: 43 of 71 values shift,
  // never by more than 1cm, and never again afterwards -- the second save is a
  // fixed point. This is a property of showing height in whole inches, not a
  // defect, and it is pinned here so nobody rediscovers it as a mystery.
  test("imperial height moves by at most one centimetre, once", () => {
    const first = personalToProfile(profileToPersonal({ heightCm: 181 }), {
      heightUnit: "ft"
    }).heightCm;
    const second = personalToProfile(profileToPersonal({ heightCm: first }), {
      heightUnit: "ft"
    }).heightCm;

    expect(Math.abs(first - 181)).toBeLessThanOrEqual(1);
    expect(second).toBe(first);
  });

  test("the training and lifestyle fields survive a round trip unchanged", () => {
    const personal = {
      sleep: "7 - 8 hours",
      timeline: "3 months",
      experience: "Intermediate",
      nutrition: "High-protein",
      cardio: "Mixed",
      goal: "Mobility",
      trainingDays: ["Monday", "Wednesday"]
    };

    expect(profileToPersonal(personalToProfile(personal))).toMatchObject(personal);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --root client src/app/profileMapping.test.js`

Expected: FAIL, "Failed to resolve import ./profileMapping".

- [ ] **Step 3: Write the module**

Create `client/src/app/profileMapping.js`:

```js
import { splitFullName, toCmFromFeetInches, toFeetInchesFromCm, toKg, toLb } from "./units";
import { defaultPersonalForm } from "./constants";

// Guards before it coerces. `Number("")` and `Number(null)` are both 0 and both
// finite, so testing afterwards turns an unfilled form field into a measured
// value -- which is how an unentered body fat once modelled a user at 3%.
// Same shape as toNullableNumber in the server's dashboardDataBuildersService.
export const toProfileNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// The mirror: a stored null is an empty form field, never the string "0".
const toFormValue = (value) => (value === null || value === undefined ? "" : String(value));

const toDayList = (value) => (Array.isArray(value) ? value : []);

export const personalToProfile = (personal = {}, units = {}) => {
  const { heightUnit = "cm", weightUnit = "kg" } = units;
  const { firstName, lastName } = splitFullName(personal.name);

  // Whichever unit is active is the one the user is typing into; the other
  // field is whatever was last converted into it and may be stale. This is the
  // same pick useBodyModel makes, deliberately -- the two must agree or the
  // silhouette and the stored profile disagree about the same person.
  const fromCm = toProfileNumber(personal.heightCm);
  const fromImperial = toProfileNumber(
    toCmFromFeetInches(personal.heightFeet, personal.heightInches)
  );
  const heightCm = heightUnit === "ft" ? (fromImperial ?? fromCm) : (fromCm ?? fromImperial);

  return {
    firstName,
    lastName,
    name: personal.name || "",
    age: toProfileNumber(personal.age),
    heightCm,
    // personal.weight is a bare number in the active unit, so the unit is not
    // optional information -- without it 170 lb is stored as 170 kg.
    weightKg: toProfileNumber(toKg(personal.weight, weightUnit)),
    sex: personal.sex || "",
    bodyFat: toProfileNumber(personal.bodyFat),
    activity: personal.activity || "",
    notes: personal.notes || "",
    sleep: personal.sleep || "",
    timeline: personal.timeline || "",
    experience: personal.experience || "",
    nutrition: personal.nutrition || "",
    cardio: personal.cardio || "",
    goal: personal.goal || "",
    trainingDays: toDayList(personal.trainingDays)
  };
};

export const profileToPersonal = (profile = {}, units = {}) => {
  const { weightUnit = "kg" } = units;
  const name =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || profile.name || "";
  // Already returns { feet: String, inches: String }, and { feet: "", inches: "" }
  // for an absent height, so these two need no further conversion.
  const { feet, inches } = toFeetInchesFromCm(profile.heightCm);
  const storedWeight = toFormValue(profile.weightKg);

  return {
    ...defaultPersonalForm,
    name,
    age: toFormValue(profile.age),
    heightCm: toFormValue(profile.heightCm),
    heightFeet: feet,
    heightInches: inches,
    weight: weightUnit === "lb" ? toLb(storedWeight, "kg") : storedWeight,
    sex: profile.sex || "",
    bodyFat: toFormValue(profile.bodyFat),
    activity: profile.activity || defaultPersonalForm.activity,
    notes: profile.notes || "",
    sleep: profile.sleep || "",
    timeline: profile.timeline || "",
    experience: profile.experience || "",
    nutrition: profile.nutrition || "",
    cardio: profile.cardio || "",
    goal: profile.goal || "",
    trainingDays: toDayList(profile.trainingDays)
  };
};
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --root client src/app/profileMapping.test.js`

Expected: PASS.

- [ ] **Step 5: Add the contract row**

In `client/src/numericCoercion.contract.test.js`, add the import:

```js
import { toProfileNumber } from "./app/profileMapping";
```

and a row to the `helpers` table:

```js
  {
    name: "toProfileNumber (app/profileMapping)",
    call: (value) => toProfileNumber(value),
    absent: null
  }
```

- [ ] **Step 6: Run the contract test**

Run: `npx vitest run --root client src/numericCoercion.contract.test.js`

Expected: PASS, with the shared table now exercising both helpers.

- [ ] **Step 7: Mutation-test the two unit rules**

These are the assertions that matter most, and both would pass against wrong
code if written carelessly. Apply each mutation, confirm the file changed on
disk, run the suite, then revert:

| Mutation                                                                | Must be caught by                             |
| ----------------------------------------------------------------------- | --------------------------------------------- |
| `weightKg: toProfileNumber(personal.weight)` (drop the unit)            | "converts pounds to kilograms before storing" |
| Invert the height pick to `heightUnit === "cm" ? fromImperial : fromCm` | both height-pick tests                        |
| `weight: storedWeight` in `profileToPersonal` (drop the unit)           | "shows weight in pounds..."                   |
| Make `toProfileNumber` coerce before guarding                           | the contract test and the body-fat cases      |

- [ ] **Step 8: Commit**

```bash
git add client/src/app/profileMapping.js client/src/app/profileMapping.test.js client/src/numericCoercion.contract.test.js
git commit -m "feat(client): add the profile/personal mapping module"
```

---

### Task 4: Client — goal options and the personal form field

**Files:**

- Modify: `client/src/app/constants.js:93-118`

- [ ] **Step 1: Write the failing test**

Create `client/src/app/constants.test.js`:

```js
import { describe, expect, test } from "vitest";
import {
  activityOptions,
  cardioOptions,
  createDefaultPlannerForm,
  defaultPersonalForm,
  experienceOptions,
  goalOptions,
  nutritionOptions,
  sexOptions,
  sleepOptions
} from "./constants";

// Every list here is duplicated on the server, which rejects anything outside
// it with a 400. A list that omits a real option therefore makes a legitimate
// dropdown choice unsaveable -- which is the defect class this whole change
// exists to close, and which has already happened once on this plan.
//
// These assertions also keep knip quiet: the lists have no importer until the
// settings field descriptors land, and CI fails on an unused export.

describe("goalOptions", () => {
  test("offers the five goals the planner prompt understands", () => {
    expect(goalOptions).toEqual([
      "Build lean strength and energy",
      "Fat loss + conditioning",
      "Mobility",
      "Recovery",
      "Cardio"
    ]);
  });

  // The planner's fallback must stay a member of the list, or a signed-out
  // visitor gets a goal the profile select cannot represent.
  test("the planner default is one of them", () => {
    expect(goalOptions).toContain(createDefaultPlannerForm().goal);
  });
});

describe("the closed-set option lists", () => {
  test("offers the four sex values the server accepts", () => {
    expect(sexOptions).toEqual(["Female", "Male", "Non-binary", "Prefer not to say"]);
  });

  test("offers the four activity levels the server accepts", () => {
    expect(activityOptions).toEqual(["Light", "Moderate", "High", "Very high"]);
  });

  // The hyphen has spaces around it. "7-8 hours" is not a value the form can
  // produce, and an earlier draft of this plan had it wrong.
  test("spells the sleep bands exactly as the form does", () => {
    expect(sleepOptions).toEqual(["Less than 4", "4 - 6 hours", "7 - 8 hours", "More than 8"]);
  });

  test("offers the three experience levels", () => {
    expect(experienceOptions).toEqual(["Beginner", "Intermediate", "Advanced"]);
  });

  test("offers the six nutrition preferences", () => {
    expect(nutritionOptions).toEqual([
      "No preference",
      "High-protein",
      "Balanced",
      "Low-carb",
      "Vegetarian",
      "Vegan"
    ]);
  });

  // EIGHT, not seven. "Mixed" was dropped once already from a hand-written
  // copy of this list, and useBodyModel scores it 0.7 like any other.
  test("offers all eight cardio styles, including Mixed", () => {
    expect(cardioOptions).toEqual([
      "None",
      "Walking",
      "Running",
      "Cycling",
      "Rowing",
      "Swimming",
      "HIIT",
      "Mixed"
    ]);
  });
});

describe("defaultPersonalForm", () => {
  test("declares goal so the generic change handler can set it", () => {
    expect(defaultPersonalForm).toHaveProperty("goal", "");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --root client src/app/constants.test.js`

Expected: FAIL, `goalOptions` is undefined.

- [ ] **Step 3: Reinstate `goalOptions`**

Add above `equipmentOptionsByEnv` in `client/src/app/constants.js`:

```js
// Removed as dead code in c2c820f and reinstated deliberately: the profile now
// carries a goal, and createDefaultPlannerForm seeds from it.
export const goalOptions = [
  "Build lean strength and energy",
  "Fat loss + conditioning",
  "Mobility",
  "Recovery",
  "Cardio"
];

// Each of these must match its allowed*Values counterpart in the server's
// dashboardDataBuildersService.js, which now rejects anything else with a 400.
// They cannot be imported across the wire, so the duplication is unavoidable --
// but it is kept to ONE copy on each side. AuthPage, HomePersonalStage and
// PreviewPersonalChapter currently hardcode the same options as inline <option>
// elements; migrating those three to read from here is worthwhile and is
// deliberately out of scope for this plan.
//
// Copy these from the <option> elements in HomePersonalStage.jsx, not from
// memory. Two of them are easy to get wrong: sleep is "7 - 8 hours" with spaces
// around the hyphen, and cardio has EIGHT entries -- "Mixed" was missed once
// already, and an allowlist missing a real option silently drops a legitimate
// value, which is the defect class this whole change exists to close.
export const sexOptions = ["Female", "Male", "Non-binary", "Prefer not to say"];
export const activityOptions = ["Light", "Moderate", "High", "Very high"];
export const sleepOptions = ["Less than 4", "4 - 6 hours", "7 - 8 hours", "More than 8"];
export const experienceOptions = ["Beginner", "Intermediate", "Advanced"];
export const nutritionOptions = [
  "No preference",
  "High-protein",
  "Balanced",
  "Low-carb",
  "Vegetarian",
  "Vegan"
];
export const cardioOptions = [
  "None",
  "Walking",
  "Running",
  "Cycling",
  "Rowing",
  "Swimming",
  "HIIT",
  "Mixed"
];
```

- [ ] **Step 4: Add `goal` to `defaultPersonalForm`**

Add to the `defaultPersonalForm` object, after `activity`:

```js
  goal: "",
```

`App.jsx`'s change handler is generic (`[e.target.name]: e.target.value`), so declaring the key is all that is needed for a `name="goal"` input to work.

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run --root client src/app/constants.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/app/constants.js client/src/app/constants.test.js
git commit -m "feat(client): reinstate goalOptions and add goal to the personal form"
```

---

### Task 5: Client — remove the duplicated locale helpers

`SettingsView.jsx:4-32` is a character-for-character copy of `units.js:17-44`, including the `IMPERIAL_REGION_CODES` set. Two copies of the same logic will eventually disagree, and this file is about to grow.

**There is a third copy, and this task deliberately leaves it — but it is not the same kind of copy.** `pages/preview/constants.js:1` and `pages/preview/utils.js:16` carry the same `IMPERIAL_REGION_CODES` and the same `getRegionFromLocale`, character-for-character identical to `units.js`, consumed by `usePreviewDerivedData.js`.

What is duplicated there is the two **primitives**. The behaviour composed on top of them is **already different**, so folding the preview onto `getPreferredMeasurementSystem` would be a behaviour change rather than a dedupe:

|                    | `units.js`                                 | `usePreviewDerivedData`                                       |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------- |
| no `navigator`     | `"metric"`                                 | `"en-US"`, so imperial                                        |
| locale list        | scans every entry of `navigator.languages` | only `navigator.languages[0]`                                 |
| unparseable locale | `"metric"`                                 | falls back to `Intl.DateTimeFormat`, then `"US"`, so imperial |

The preview's every-fallback-ends-at-`"US"` chain is deliberate and pinned by its own tests — CLAUDE.md records that a test whose locale resolves to US cannot tell one fallback from the next, which is why those tests stub different regions at each step.

So the correct follow-up is to share the two primitives from `units.js` and leave each composition alone, **not** to replace the preview's logic with `getPreferredMeasurementSystem`. Anyone touching the preview locale code should do that rather than adding a fourth copy of the primitives.

**Files:**

- Modify: `client/src/pages/dashboard/views/SettingsView.jsx:1-32` — this is the only file that changes. `units.js` is already correct and must not be touched.

- [ ] **Step 1: Confirm the two copies are identical before touching either**

The two copies are not contiguous blocks at matching offsets — `IMPERIAL_REGION_CODES` sits at the very top of `units.js`, far from the two functions — so compare the three pieces separately:

```bash
diff <(sed -n '1p'     client/src/app/units.js) <(sed -n '4p'     client/src/pages/dashboard/views/SettingsView.jsx)
diff <(sed -n '17,29p' client/src/app/units.js | sed 's/^export //') <(sed -n '6,18p'  client/src/pages/dashboard/views/SettingsView.jsx)
diff <(sed -n '31,44p' client/src/app/units.js | sed 's/^export //') <(sed -n '20,33p' client/src/pages/dashboard/views/SettingsView.jsx)
```

Expected: no output from any of the three. If they differ, stop — the difference is behaviour and must be understood before deduplicating.

An earlier draft of this step tried to do it as one `diff` over `17,44` against `6,32`, which straddles the gap in `units.js` and cuts the `SettingsView` block a line short. It reports a spurious one-line difference, so **a non-empty result there is not evidence of a real divergence** — re-derive the ranges rather than trusting the exit code either way.

- [ ] **Step 2: Run the existing SettingsView tests and record the result**

Run: `npx vitest run --root client src/pages/dashboard/views/SettingsView.test.jsx`

Expected: PASS. Note the test count; it must be identical after this task.

- [ ] **Step 3: Delete the copies from SettingsView**

Remove `IMPERIAL_REGION_CODES`, `getRegionFromLocale` and `getPreferredMeasurementSystem` from `SettingsView.jsx` and import instead:

```js
import { getPreferredMeasurementSystem } from "../../../app/units";
```

`getRegionFromLocale` is used only by `getPreferredMeasurementSystem`, so it does not need importing.

**`IMPERIAL_REGION_CODES` does not need exporting, and must not be exported.** An earlier draft of this task said to export it. That was wrong: `getPreferredMeasurementSystem` closes over the copy already declared at the top of `units.js`, so importing the function is enough. Exporting the set as well would add an export nothing consumes, which `npm run knip` reports as an unused export and which CI now fails on.

- [ ] **Step 4: Run the tests and confirm nothing changed**

Run: `npx vitest run --root client src/pages/dashboard/views/SettingsView.test.jsx`

Expected: PASS, same test count as Step 2. This is a pure refactor — a changed count means behaviour moved.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/dashboard/views/SettingsView.jsx
git commit -m "refactor(client): use the shared locale helpers in SettingsView"
```

---

### Task 6: Client — field descriptors

> **Rewritten before dispatch.** The first draft declared height and weight as
> plain number fields with metric bounds — `weight` as `min: 25, max: 400`. That
> is wrong wherever the form renders in pounds, because 170 lb is a perfectly
> ordinary weight that those bounds would reject, and 30 lb is not. Height has
> the same problem: an imperial visitor types feet and inches, not centimetres.
> The descriptors therefore carry bounds **per unit**, declared rather than
> converted at runtime so there is nothing to drift.

**Files:**

- Create: `client/src/pages/dashboard/views/settingsFields.js`
- Create: `client/src/pages/dashboard/views/settingsFields.test.js`

The tab `rows` array is currently the single declaration of what a tab shows. Keep it that way — these descriptors drive both the read and the edit rendering, rather than introducing a second list that can drift out of step with the first.

- [ ] **Step 1: Write the failing test**

Create `client/src/pages/dashboard/views/settingsFields.test.js`:

```js
import { describe, expect, test } from "vitest";
import { EDITABLE_TABS, fieldsForTab } from "./settingsFields";
import {
  activityOptions,
  cardioOptions,
  experienceOptions,
  goalOptions,
  nutritionOptions,
  sexOptions,
  sleepOptions
} from "../../../app/constants";

describe("settingsFields", () => {
  test("marks exactly the three real tabs editable", () => {
    expect(EDITABLE_TABS).toEqual(["profile", "training", "lifestyle"]);
  });

  test("gives every field a name and a known type", () => {
    for (const tab of EDITABLE_TABS) {
      for (const field of fieldsForTab(tab)) {
        expect(field.name).toBeTruthy();
        expect([
          "text",
          "number",
          "select",
          "multiselect",
          "textarea",
          "height",
          "weight"
        ]).toContain(field.type);
      }
    }
  });

  // `toBe`, not `toEqual`: identity is the assertion. A descriptor that retyped
  // the values would still be deeply equal today and would drift tomorrow, and
  // these lists are already pinned against the server in constants.test.js.
  // Covering all six also catches a list referenced but never imported, which
  // is a ReferenceError at module load rather than a failing assertion.
  test.each([
    ["profile", "sex", () => sexOptions],
    ["training", "activity", () => activityOptions],
    ["training", "goal", () => goalOptions],
    ["training", "experience", () => experienceOptions],
    ["lifestyle", "sleep", () => sleepOptions],
    ["lifestyle", "nutrition", () => nutritionOptions],
    ["lifestyle", "cardio", () => cardioOptions]
  ])("the %s tab's %s field reuses the shared list", (tab, name, expected) => {
    expect(fieldsForTab(tab).find((field) => field.name === name).options).toBe(expected());
  });

  // weekDays is a list of { label, key } objects, not strings. The multiselect
  // stores day keys, which is what buildProfile's trainingDays receives, so the
  // options must be the keys rather than the whole objects.
  test("offers training days as plain day-name strings", () => {
    const days = fieldsForTab("training").find((field) => field.name === "trainingDays");

    expect(days.options).toContain("Monday");
    expect(days.options.every((option) => typeof option === "string")).toBe(true);
    expect(days.options).toHaveLength(7);
  });

  // The bounds are per unit because the form renders in the visitor's locale
  // units. Applying the kilogram range to a pounds input rejects 170 lb, an
  // entirely ordinary weight, and accepts 30 lb, which is not.
  test("declares weight bounds for both units", () => {
    const weight = fieldsForTab("profile").find((field) => field.name === "weight");

    expect(weight.type).toBe("weight");
    expect(weight.bounds.kg).toEqual([25, 400]);
    expect(weight.bounds.lb[0]).toBeGreaterThan(50);
    expect(weight.bounds.lb[1]).toBeGreaterThan(800);
  });

  test("declares height bounds for both units", () => {
    const height = fieldsForTab("profile").find((field) => field.name === "heightCm");

    expect(height.type).toBe("height");
    expect(height.bounds.cm).toEqual([100, 260]);
    expect(height.bounds.ft).toEqual([3, 8]);
    expect(height.bounds.in).toEqual([0, 11]);
  });

  // Feet and inches cannot express 100-260cm exactly: the range 3'0" to 8'11"
  // is 91-272cm, looser at both ends. That is deliberate and it is the safe
  // direction to be wrong. A client bound TIGHTER than the server's would make
  // a legitimate height unenterable, which is the defect class this whole
  // change exists to close; a looser one merely defers to the server, which
  // answers 400 and renders the message inline. Pinned so nobody "corrects" it
  // into a false precision.
  test("keeps the imperial height range permissive rather than stricter", () => {
    const {
      ft,
      in: inches,
      cm
    } = fieldsForTab("profile").find((field) => field.name === "heightCm").bounds;
    const lowestImperialCm = Math.round(ft[0] * 30.48 + inches[0] * 2.54);
    const highestImperialCm = Math.round(ft[1] * 30.48 + inches[1] * 2.54);

    expect(lowestImperialCm).toBeLessThanOrEqual(cm[0]);
    expect(highestImperialCm).toBeGreaterThanOrEqual(cm[1]);
  });

  // The metric bounds must be the same numbers the server enforces, or the form
  // accepts input the API then rejects with a 400.
  test("mirrors the server's metric ranges exactly", () => {
    const profile = fieldsForTab("profile");

    expect(profile.find((f) => f.name === "age").bounds).toEqual([10, 120]);
    expect(profile.find((f) => f.name === "bodyFat").bounds).toEqual([3, 70]);
    expect(profile.find((f) => f.name === "heightCm").bounds.cm).toEqual([100, 260]);
    expect(profile.find((f) => f.name === "weight").bounds.kg).toEqual([25, 400]);
  });

  test("returns nothing for a read-only tab", () => {
    expect(fieldsForTab("privacy")).toEqual([]);
    expect(fieldsForTab("nonsense")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --root client src/pages/dashboard/views/settingsFields.test.js`

Expected: FAIL, "Failed to resolve import ./settingsFields".

- [ ] **Step 3: Write the descriptors**

Create `client/src/pages/dashboard/views/settingsFields.js`:

```js
import {
  activityOptions,
  cardioOptions,
  experienceOptions,
  goalOptions,
  nutritionOptions,
  sexOptions,
  sleepOptions,
  weekDays
} from "../../../app/constants";

// weekDays is [{ label: "Mon", key: "Monday" }, ...]. The stored trainingDays
// are the keys, so the multiselect offers those rather than the objects.
const trainingDayOptions = weekDays.map((day) => day.key);

export const EDITABLE_TABS = ["profile", "training", "lifestyle"];

const FIELDS_BY_TAB = {
  profile: [
    { name: "name", label: "Name", type: "text", maxLength: 80 },
    { name: "age", label: "Age", type: "number", bounds: [10, 120] },
    { name: "sex", label: "Sex", type: "select", options: sexOptions },
    // Bounds per unit, declared rather than converted, so the imperial and
    // metric ranges cannot drift apart. The metric numbers are the server's.
    {
      name: "heightCm",
      label: "Height",
      type: "height",
      bounds: { cm: [100, 260], ft: [3, 8], in: [0, 11] }
    },
    { name: "weight", label: "Weight", type: "weight", bounds: { kg: [25, 400], lb: [55, 882] } },
    { name: "bodyFat", label: "Body fat", type: "number", bounds: [3, 70] }
  ],
  training: [
    { name: "timeline", label: "Timeline", type: "text", maxLength: 60 },
    { name: "experience", label: "Experience", type: "select", options: experienceOptions },
    {
      name: "trainingDays",
      label: "Training days",
      type: "multiselect",
      options: trainingDayOptions
    },
    { name: "activity", label: "Activity level", type: "select", options: activityOptions },
    { name: "goal", label: "Goal", type: "select", options: goalOptions }
  ],
  lifestyle: [
    { name: "sleep", label: "Sleep", type: "select", options: sleepOptions },
    { name: "nutrition", label: "Nutrition", type: "select", options: nutritionOptions },
    { name: "cardio", label: "Cardio", type: "select", options: cardioOptions },
    { name: "notes", label: "Notes", type: "textarea", maxLength: 500 }
  ]
};

export const fieldsForTab = (tabId) => FIELDS_BY_TAB[tabId] || [];
```

**`experience`, `sleep`, `nutrition` and `cardio` are selects, not text inputs.** Task 1 established that all four are closed sets validated server-side, and Task 2 made an out-of-list value a 400 — so a free-text input here would let a visitor type something the save then rejects. Task 4 adds `experienceOptions`, `sleepOptions`, `nutritionOptions` and `cardioOptions` to `constants.js` alongside `sexOptions`; import them here. If Task 4 has not been done yet, do it first — these two tasks are ordered wrongly if you hit a missing import.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --root client src/pages/dashboard/views/settingsFields.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/dashboard/views/settingsFields.js client/src/pages/dashboard/views/settingsFields.test.js
git commit -m "feat(client): declare the editable settings fields"
```

---

### Task 7: Client — the edit form component

> **Rewritten before dispatch,** for the same reason as Task 6: the first draft
> rendered height and weight as plain number inputs, which is wrong for an
> imperial visitor. This form renders in the units the visitor's locale implies
> and reports which units it used, because the caller has to convert with the
> same ones — see Task 8's note on why reading the app-level units instead would
> store 170 lb as 170 kg.

**Files:**

- Create: `client/src/pages/dashboard/views/SettingsEditForm.jsx`
- Create: `client/src/pages/dashboard/views/SettingsEditForm.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/pages/dashboard/views/SettingsEditForm.test.jsx`:

```jsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import SettingsEditForm from "./SettingsEditForm";

const FIELDS = [
  { name: "name", label: "Name", type: "text", maxLength: 80 },
  { name: "age", label: "Age", type: "number", bounds: [10, 120] },
  { name: "sex", label: "Sex", type: "select", options: ["Female", "Male"] },
  {
    name: "heightCm",
    label: "Height",
    type: "height",
    bounds: { cm: [100, 260], ft: [3, 8], in: [0, 11] }
  },
  { name: "weight", label: "Weight", type: "weight", bounds: { kg: [25, 400], lb: [55, 882] } },
  {
    name: "trainingDays",
    label: "Training days",
    type: "multiselect",
    options: ["Monday", "Tuesday"]
  }
];

const VALUES = {
  name: "Jordan",
  age: "34",
  sex: "Female",
  heightCm: "178",
  heightFeet: "5",
  heightInches: "10",
  weight: "77",
  trainingDays: ["Monday"]
};

const renderForm = (overrides = {}) =>
  render(
    <SettingsEditForm
      fields={FIELDS}
      values={VALUES}
      measurementSystem="metric"
      onSave={() => {}}
      onCancel={() => {}}
      {...overrides}
    />
  );

describe("SettingsEditForm", () => {
  test("renders a labelled control per field", () => {
    renderForm();

    expect(screen.getByLabelText("Name")).toHaveValue("Jordan");
    expect(screen.getByLabelText("Age")).toHaveValue(34);
    expect(screen.getByLabelText("Sex")).toHaveValue("Female");
  });

  test("applies the server range to a plain number field", () => {
    renderForm();
    const age = screen.getByLabelText("Age");

    expect(age).toHaveAttribute("min", "10");
    expect(age).toHaveAttribute("max", "120");
  });

  test("submits the edited values", () => {
    const onSave = vi.fn();
    renderForm({ onSave });

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: "Sam" });
  });

  test("reports the units it rendered with, so the caller converts the same way", () => {
    const onSave = vi.fn();
    renderForm({ onSave, measurementSystem: "imperial" });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][1]).toEqual({ heightUnit: "ft", weightUnit: "lb" });
  });

  test("reports metric units when the locale is metric", () => {
    const onSave = vi.fn();
    renderForm({ onSave });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][1]).toEqual({ heightUnit: "cm", weightUnit: "kg" });
  });

  test("shows one height input in centimetres for a metric visitor", () => {
    renderForm();

    expect(screen.getByLabelText("Height (cm)")).toHaveValue(178);
    expect(screen.queryByLabelText("Height (ft)")).toBeNull();
  });

  test("shows feet and inches for an imperial visitor", () => {
    renderForm({ measurementSystem: "imperial" });

    expect(screen.getByLabelText("Height (ft)")).toHaveValue(5);
    expect(screen.getByLabelText("Height (in)")).toHaveValue(10);
    expect(screen.queryByLabelText("Height (cm)")).toBeNull();
  });

  test("writes feet and inches back to their own fields, not to centimetres", () => {
    const onSave = vi.fn();
    renderForm({ onSave, measurementSystem: "imperial" });

    fireEvent.change(screen.getByLabelText("Height (ft)"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][0]).toMatchObject({ heightFeet: "6", heightInches: "10" });
  });

  // 170 lb is an ordinary weight that the kilogram range would reject, and
  // 30 lb is not a weight but would pass it.
  test("bounds the weight input by the unit on screen", () => {
    renderForm({ measurementSystem: "imperial" });
    const weight = screen.getByLabelText("Weight (lb)");

    expect(weight).toHaveAttribute("min", "55");
    expect(weight).toHaveAttribute("max", "882");
  });

  test("bounds the weight input in kilograms for a metric visitor", () => {
    renderForm();
    const weight = screen.getByLabelText("Weight (kg)");

    expect(weight).toHaveAttribute("min", "25");
    expect(weight).toHaveAttribute("max", "400");
  });

  test("toggles a multiselect value on and off", () => {
    const onSave = vi.fn();
    renderForm({ onSave });

    fireEvent.click(screen.getByRole("checkbox", { name: "Tuesday" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][0]).toMatchObject({ trainingDays: ["Monday", "Tuesday"] });
  });

  test("discards edits on cancel", () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    renderForm({ onCancel, onSave });

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("shows a save error without closing the form", () => {
    renderForm({ error: "Age must be between 10 and 120." });

    expect(screen.getByText("Age must be between 10 and 120.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  test("disables both controls while a save is in flight", () => {
    renderForm({ saving: true });

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --root client src/pages/dashboard/views/SettingsEditForm.test.jsx`

Expected: FAIL, "Failed to resolve import ./SettingsEditForm".

- [ ] **Step 3: Write the component**

Create `client/src/pages/dashboard/views/SettingsEditForm.jsx`. Wrap each control in its own `<label>` — that nesting is how every form in this app associates labels, and the axe scan in `e2e/a11y.spec.js` is the authority on whether it is correct, not the linter:

```jsx
import { useState } from "react";

const unitsFor = (measurementSystem) =>
  measurementSystem === "imperial"
    ? { heightUnit: "ft", weightUnit: "lb" }
    : { heightUnit: "cm", weightUnit: "kg" };

export default function SettingsEditForm({
  fields,
  values,
  measurementSystem,
  onSave,
  onCancel,
  error,
  saving
}) {
  const [draft, setDraft] = useState(() => ({ ...values }));
  const units = unitsFor(measurementSystem);

  const setField = (name, value) => setDraft((prev) => ({ ...prev, [name]: value }));

  const toggleInList = (name, option) =>
    setDraft((prev) => {
      const list = Array.isArray(prev[name]) ? prev[name] : [];
      return {
        ...prev,
        [name]: list.includes(option) ? list.filter((item) => item !== option) : [...list, option]
      };
    });

  const numberInput = (name, label, [min, max]) => (
    <label>
      {label}
      <input
        type="number"
        value={draft[name] ?? ""}
        min={min}
        max={max}
        onChange={(event) => setField(name, event.target.value)}
      />
    </label>
  );

  const renderField = (field) => {
    if (field.type === "height") {
      return units.heightUnit === "ft" ? (
        <>
          {numberInput("heightFeet", "Height (ft)", field.bounds.ft)}
          {numberInput("heightInches", "Height (in)", field.bounds.in)}
        </>
      ) : (
        numberInput("heightCm", "Height (cm)", field.bounds.cm)
      );
    }

    if (field.type === "weight") {
      return numberInput("weight", `Weight (${units.weightUnit})`, field.bounds[units.weightUnit]);
    }

    if (field.type === "multiselect") {
      return (
        <fieldset>
          <legend>{field.label}</legend>
          {field.options.map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                checked={(draft[field.name] || []).includes(option)}
                onChange={() => toggleInList(field.name, option)}
              />
              {option}
            </label>
          ))}
        </fieldset>
      );
    }

    if (field.type === "select") {
      return (
        <label>
          {field.label}
          <select
            value={draft[field.name] || ""}
            onChange={(event) => setField(field.name, event.target.value)}
          >
            <option value="">Not set</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field.type === "textarea") {
      return (
        <label>
          {field.label}
          <textarea
            value={draft[field.name] || ""}
            maxLength={field.maxLength}
            onChange={(event) => setField(field.name, event.target.value)}
          />
        </label>
      );
    }

    if (field.type === "number") {
      return numberInput(field.name, field.label, field.bounds);
    }

    return (
      <label>
        {field.label}
        <input
          type="text"
          value={draft[field.name] ?? ""}
          maxLength={field.maxLength}
          onChange={(event) => setField(field.name, event.target.value)}
        />
      </label>
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    // The units go with the draft: the caller must convert with the same ones
    // this form rendered in, and they are the visitor's locale units rather
    // than the home flow's toggles.
    onSave(draft, units);
  };

  return (
    <form className="settings-edit-form" onSubmit={handleSubmit}>
      {fields.map((field) => (
        <div key={field.name} className="settings-edit-row">
          {renderField(field)}
        </div>
      ))}

      {error && <p className="error">{error}</p>}

      <div className="settings-edit-actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --root client src/pages/dashboard/views/SettingsEditForm.test.jsx`

Expected: PASS.

- [ ] **Step 5: Mutation-test the unit rules**

The unit behaviour is the part most likely to be silently wrong. Apply each, confirm the file changed on disk, run the suite, revert:

| Mutation                                      | Must be caught by                                 |
| --------------------------------------------- | ------------------------------------------------- |
| `unitsFor` always returns the metric pair     | "reports the units it rendered with"              |
| Height always renders the `cm` input          | "shows feet and inches for an imperial visitor"   |
| Weight uses `field.bounds.kg` unconditionally | "bounds the weight input by the unit on screen"   |
| `onSave(draft)` without the units             | "reports the units it rendered with"              |
| Feet input writes to `heightCm`               | "writes feet and inches back to their own fields" |

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/dashboard/views/SettingsEditForm.jsx client/src/pages/dashboard/views/SettingsEditForm.test.jsx
git commit -m "feat(client): add the settings edit form"
```

---

### Task 8: Client — the save handler

**Files:**

- Modify: `client/src/app/events.js`
- Test: `client/src/app/events.handlers.test.js`

- [ ] **Step 1: Write the failing test**

Append to `client/src/app/events.handlers.test.js`, following the `apiFetch` stubbing already used in that file:

```js
describe("submitProfile", () => {
  test("posts the mapped profile and rehydrates personal", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () =>
        jsonResponse({ profile: { firstName: "Sam", lastName: "Fields", heightCm: 178 } })
      ),
      setPersonal: vi.fn(),
      setUser: vi.fn()
    });

    await handlers.submitProfile({ name: "Sam Fields", heightCm: "178" });

    const [url, options] = deps.apiFetch.mock.calls[0];
    expect(url).toBe("/api/profile");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toMatchObject({ firstName: "Sam", lastName: "Fields" });
    expect(deps.setPersonal).toHaveBeenCalled();
  });

  // The handler is where units reach the mapper. Drop them and a user weighing
  // 170 lb is stored as 170 kg -- so these assert the converted value, not just
  // that a request was made.
  test("falls back to the app's active units when the caller passes none", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ profile: {} })),
      setPersonal: vi.fn(),
      setUser: vi.fn(),
      weightUnit: "lb",
      heightUnit: "ft"
    });

    await handlers.submitProfile({ weight: "170", heightFeet: "5", heightInches: "10" });

    expect(JSON.parse(deps.apiFetch.mock.calls[0][1].body)).toMatchObject({
      weightKg: 77,
      heightCm: 178
    });
  });

  // Settings renders in the visitor's locale units, which are not the home
  // flow's toggles. If the caller's units were ignored in favour of the
  // app-level ones, this stores 170 lb as 170 kg.
  test("uses the caller's units over the app's when given them", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ profile: {} })),
      setPersonal: vi.fn(),
      setUser: vi.fn(),
      weightUnit: "kg",
      heightUnit: "cm"
    });

    await handlers.submitProfile({ weight: "170" }, { weightUnit: "lb", heightUnit: "ft" });

    expect(JSON.parse(deps.apiFetch.mock.calls[0][1].body)).toMatchObject({ weightKg: 77 });
  });

  test("surfaces a server error and leaves personal alone", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () =>
        jsonResponse({ error: "Age must be between 10 and 120." }, false)
      ),
      setPersonal: vi.fn(),
      setUser: vi.fn()
    });

    const result = await handlers.submitProfile({ age: "3" });

    expect(result).toMatchObject({ ok: false, error: "Age must be between 10 and 120." });
    expect(deps.setPersonal).not.toHaveBeenCalled();
  });
});
```

This file's existing helper is `buildDeps(overrides)` at line 9, which assembles the dependency object the events factory takes. Use it the way the surrounding tests do — build deps, construct the factory, pull `submitProfile` off the result — rather than inventing a new setup.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --root client src/app/events.handlers.test.js -t submitProfile`

Expected: FAIL, `handlers.submitProfile is not a function`.

- [ ] **Step 3: Add the handler**

In `client/src/app/events.js`, import the mapper at the top:

```js
import { personalToProfile, profileToPersonal } from "./profileMapping";
```

Add the handler beside `submitGoals`, returning a result object rather than only setting state, so the form can keep itself open on failure:

```js
// The units travel with the draft rather than being read from App state. The
// app-level heightUnit/weightUnit belong to the home flow's toggles, while
// Settings renders in whatever the visitor's locale implies -- so reading the
// app-level ones here would convert a locale-imperial form with a metric unit
// and store 170 lb as 170 kg. The app-level values remain the default for any
// caller that does not pass units.
const submitProfile = async (draft, units = { heightUnit, weightUnit }) => {
  try {
    const res = await apiFetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(personalToProfile(draft, units))
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload?.error || "Unable to save profile.");
    }
    const data = await res.json();
    setPersonal(profileToPersonal(data.profile, units));
    setUser((prev) => (prev ? { ...prev, profile: data.profile } : prev));
    showDashboardToast("Profile updated.");
    return { ok: true };
  } catch (err) {
    const message = err.message || "Unable to save profile.";
    showDashboardToast(message, "error");
    return { ok: false, error: message };
  }
};
```

**The units are not optional and must not be dropped.** `personal.weight` is a bare number in whatever unit is active, so `personalToProfile(draft)` without them would store 170 lb as 170 kg. `profileToPersonal` needs `weightUnit` for the same reason in reverse — it decides whether the form shows 77 or 170.

Dependency check, verified against the file rather than assumed:

- `heightUnit`, `weightUnit`, `personal`, `setUser`, `showDashboardToast`, `setDashError` and `apiFetch` are **already** destructured dependencies of `createAppEventHandlers`. Use them as-is; add nothing.
- **`setPersonal` is not.** The factory takes `resetPersonalFlow`, which wraps it, but not the setter itself. Add `setPersonal` to the factory's destructured parameter list, and pass it at the call site in `App.jsx` where the other handlers are wired up — it is already in scope there as `const [personal, setPersonal] = useState(...)` at `App.jsx:102`.

Add `submitProfile` to the object returned at the end of the factory.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --root client src/app/events.handlers.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/app/events.js client/src/app/events.handlers.test.js
git commit -m "feat(client): add the profile save handler"
```

---

### Task 9: Client — wire the edit mode into SettingsView

**Files:**

- Modify: `client/src/pages/dashboard/views/SettingsView.jsx`
- Modify: `client/src/pages/dashboard/views/SettingsView.test.jsx`
- Modify: `client/src/pages/DashboardPage.jsx` (pass `personal` and `onSaveProfile` through)

- [ ] **Step 1: Write the failing test**

Append to `client/src/pages/dashboard/views/SettingsView.test.jsx`:

```jsx
test("shows an Edit button on an editable tab", () => {
  renderView();
  expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
});

test("swaps the rows for a form when Edit is clicked", () => {
  renderView();

  fireEvent.click(screen.getByRole("button", { name: "Edit" }));

  expect(screen.getByLabelText("Age")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
});

test("returns to the read view on cancel", () => {
  renderView();

  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.queryByLabelText("Age")).toBeNull();
  expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
});

test("calls onSaveProfile with the edited values", async () => {
  const onSaveProfile = vi.fn().mockResolvedValue({ ok: true });
  renderView({ onSaveProfile });

  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Age"), { target: { value: "35" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(onSaveProfile).toHaveBeenCalled());
  expect(onSaveProfile.mock.calls[0][0]).toMatchObject({ age: "35" });
});

test("keeps the form open and shows the error when the save fails", async () => {
  const onSaveProfile = vi.fn().mockResolvedValue({ ok: false, error: "Age must be 10-120." });
  renderView({ onSaveProfile });

  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Age must be 10-120.")).toBeInTheDocument();
  expect(screen.getByLabelText("Age")).toBeInTheDocument();
});

test("offers no Edit button on a placeholder tab", () => {
  renderView();

  fireEvent.click(screen.getByRole("button", { name: "Privacy" }));

  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
});
```

`renderView(props)` is this file's existing helper, at line 14. Extend it to forward `onSaveProfile` and `personal` through to `SettingsView`; the snippets above already call it by that name.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --root client src/pages/dashboard/views/SettingsView.test.jsx`

Expected: FAIL, no "Edit" button exists.

- [ ] **Step 3: Add the edit state to SettingsView**

Add the imports:

```jsx
import SettingsEditForm from "./SettingsEditForm";
import { EDITABLE_TABS, fieldsForTab } from "./settingsFields";
```

Accept `personal` and `onSaveProfile` as props alongside `user`, and add:

```jsx
const [editingTab, setEditingTab] = useState("");
const [saveError, setSaveError] = useState("");
const [saving, setSaving] = useState(false);

const handleSave = async (draft, units) => {
  setSaving(true);
  setSaveError("");
  const result = await onSaveProfile({ ...personal, ...draft }, units);
  setSaving(false);
  if (result?.ok) {
    setEditingTab("");
    return;
  }
  setSaveError(result?.error || "Unable to save profile.");
};
```

Two things here are load-bearing:

- **Merging over `personal` rather than sending `draft` alone.** Each tab edits a subset, and `personalToProfile` builds a whole profile, so posting one tab's fields alone would clear the others.
- **Forwarding `units` unchanged.** The form reports which units it rendered in, and `submitProfile` must convert with those same ones. Dropping the second argument here is exactly how 170 lb becomes 170 kg — the app-level `weightUnit` belongs to the home flow's toggle, not to this locale-driven form.

`measurementSystem` is already computed in this component (`getPreferredMeasurementSystem()` behind a `useMemo`) for the read-only rows; pass that same value to the form rather than computing it a second time.

- [ ] **Step 4: Render the form in place of the rows**

Where the active tab's rows are rendered, branch on the edit state. Add the Edit button beside the tab description, rendered only when `EDITABLE_TABS.includes(activeTab)`:

```jsx
{
  editingTab === activeTab ? (
    <SettingsEditForm
      fields={fieldsForTab(activeTab)}
      values={personal || {}}
      measurementSystem={measurementSystem}
      onSave={handleSave}
      onCancel={() => {
        setEditingTab("");
        setSaveError("");
      }}
      error={saveError}
      saving={saving}
    />
  ) : (
    renderRows()
  );
}
```

- [ ] **Step 5: Thread `onSaveProfile` through DashboardPage**

`DashboardPage.jsx:347` already passes `personal`, so only the handler is missing. Change that line to:

```jsx
<SettingsView user={user} personal={personal} onSaveProfile={onSaveProfile} />
```

Then add `onSaveProfile` to `DashboardPage`'s props and pass `submitProfile` down from `App.jsx` where the other event handlers are already threaded through. Follow that existing prop path rather than adding context.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run --root client src/pages/dashboard/views/SettingsView.test.jsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/dashboard/views/SettingsView.jsx client/src/pages/dashboard/views/SettingsView.test.jsx client/src/pages/DashboardPage.jsx
git commit -m "feat(client): make the settings profile tabs editable"
```

---

### Task 10: Client — hydration and planner seeding

**Files:**

- Modify: `client/src/App.jsx:102-103`, `:186-192`
- Modify: `client/src/app/constants.js:112`
- Test: `client/src/App.test.jsx`

- [ ] **Step 1: Write the failing test**

Append to `client/src/App.test.jsx`:

```jsx
describe("hydrating from the stored profile", () => {
  test("seeds the personal form from the signed-in user's profile", async () => {
    stubSession(
      sessionResponse({
        user: {
          email: "ada@example.com",
          profile: { firstName: "Jordan", lastName: "Fields", heightCm: 178, goal: "Mobility" }
        }
      })
    );
    await renderSettled("/");

    await waitFor(() => expect(home.props.personal.name).toBe("Jordan Fields"));
    expect(home.props.personal.goal).toBe("Mobility");
    expect(home.props.personal.heightCm).toBe("178");
  });

  test("seeds the planner goal from the stored profile", async () => {
    stubSession(
      sessionResponse({ user: { email: "ada@example.com", profile: { goal: "Recovery" } } })
    );
    await renderSettled("/");

    await waitFor(() => expect(home.props.form.goal).toBe("Recovery"));
  });

  test("leaves the planner on its default goal when the profile has none", async () => {
    stubSession(sessionResponse({ user: { email: "ada@example.com", profile: {} } }));
    await renderSettled("/");

    expect(home.props.form.goal).toBe(goalOptions[0]);
  });

  test("leaves a signed-out visitor on the blank personal form", async () => {
    stubSession(sessionResponse({}));
    await renderSettled("/");

    expect(home.props.personal.name).toBe("");
    expect(home.props.form.goal).toBe(goalOptions[0]);
  });
});
```

**These use the helpers this file already has — verified, not assumed.** `stubSession`, `sessionResponse`, `renderSettled` and the hoisted `home` prop-capture object are all defined at the top of `App.test.jsx`; follow the existing `"signs in the user the server returns"` test for the exact shape. `App.jsx` passes both `form` and `personal` to `HomePage`, so `home.props.form.goal` and `home.props.personal` are directly assertable with no new mock.

An earlier draft of this step invented `renderAppWithUser` and a `stages` capture object. Neither exists in `App.test.jsx` — `stages` belongs to `HomePage.test.jsx`, which is a different file mocking the individual stage components. Import `goalOptions` from `./app/constants` for the default-goal assertions.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --root client src/App.test.jsx -t "stored profile"`

Expected: FAIL. `personal` is `defaultPersonalForm`, so `name` is `""`.

- [ ] **Step 3: Make the planner accept a goal**

In `client/src/app/constants.js`, change the factory to take one:

```js
export const createDefaultPlannerForm = (goal) => ({
  goal: goal || goalOptions[0],
```

Leave the remaining fields untouched. The parameter is optional, so the existing signed-out call sites keep working.

- [ ] **Step 4: Hydrate `personal` on sign-in**

In `App.jsx`, import the mapper:

```jsx
import { profileToPersonal } from "./app/profileMapping";
```

Add an effect that runs when the signed-in user changes, seeding both pieces of state from the stored profile:

```jsx
useEffect(() => {
  if (!user?.profile) return;
  setPersonal(profileToPersonal(user.profile));
  setForm(createDefaultPlannerForm(user.profile.goal));
}, [user]);
```

- [ ] **Step 5: Make the reset respect the stored profile**

`resetPersonalFlow` currently resets to `defaultPersonalForm`. Change it to prefer the saved profile when signed in:

```jsx
setPersonal(user?.profile ? profileToPersonal(user.profile) : { ...defaultPersonalForm });
setForm(createDefaultPlannerForm(user?.profile?.goal));
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run --root client src/App.test.jsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/App.jsx client/src/app/constants.js client/src/App.test.jsx
git commit -m "feat(client): hydrate personal and the planner goal from the stored profile"
```

---

### Task 11: Verification, mutation pass, and the coverage ratchet

**Files:**

- Modify: `client/vite.config.js:44-49`

- [ ] **Step 1: Run every gate**

Run each and confirm exit 0:

```bash
npm test
npm run lint
npm run knip
npm run format:check
npm run build
```

`npm run format` fixes formatting failures. Lint must report 0 errors **and** 0 warnings — a new warning means this work introduced it.

- [ ] **Step 2: Mutation-test the new assertions**

Characterization and TDD tests both pass on a green tree, so confirm they discriminate. Apply each mutation, confirm the file changed on disk, run the named suite, then revert. Write the script with the Write tool rather than a heredoc — shell escaping has silently eaten mutations here before, and an unapplied mutation looks exactly like an uncaught one.

| Mutation                                                                      | Must be caught by                              |
| ----------------------------------------------------------------------------- | ---------------------------------------------- |
| Drop `goal` from `buildProfile`'s returned object                             | `dashboardDataBuildersService.test.js`         |
| Change `toCleanArray(input.trainingDays, 7, 20)` to `input.trainingDays`      | `dashboardDataBuildersService.test.js`         |
| Make `toProfileNumber` coerce before guarding                                 | `profileMapping.test.js` and the contract test |
| Change `toProfileNumber`'s guard to `if (!value)`                             | the contract test's measured-zero case         |
| Make `handleSave` send `draft` instead of `{ ...personal, ...draft }`         | `SettingsView.test.jsx`                        |
| Make `submitProfile` call `setPersonal` on the failure path                   | `events.handlers.test.js`                      |
| Drop the `goal` argument from `createDefaultPlannerForm(user?.profile?.goal)` | `App.test.jsx`                                 |

Every one must fail its suite. A survivor means the test is not asserting what it claims.

- [ ] **Step 3: Re-measure coverage**

Run: `npm run test:coverage`

Record the client `All files` row.

- [ ] **Step 4: Raise the ratchet**

In `client/vite.config.js`, set each threshold to the measured value floored to one decimal. Never lower a threshold to make the build pass; if a number dropped, find what stopped being covered.

- [ ] **Step 5: Confirm the raised ratchet holds**

Run: `npm run test:coverage -w client`

Expected: exit 0.

- [ ] **Step 6: Run the end-to-end suite**

Run:

```bash
npm -w client run build
npm run test:e2e
```

This is the only suite that exercises both halves together. Do not set `NODE_ENV=test` for the server it starts — `index.js` guards `startServer()` on it, and the process would exit 0 with no output, which reads exactly like a crash.

- [ ] **Step 7: Commit**

```bash
git add client/vite.config.js
git commit -m "test(client): raise the coverage ratchet for the editable profile"
```

---

## Notes for the pull request

Two things in this change are user-visible and should be called out rather than buried:

- **Generated plans will differ from today's.** The planner previously sent a hardcoded goal for every user because `PlannerSetupModal` never exposed the field. It now sends the user's own goal, which changes the Gemini prompt and therefore the plan.
- **The home flow now arrives pre-filled** for a signed-in user instead of blank.

One cleanup rides along: `SettingsView` no longer carries its own character-for-character copy of the locale helpers in `units.js`.
