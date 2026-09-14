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

**Files:**

- Create: `client/src/app/profileMapping.js`
- Create: `client/src/app/profileMapping.test.js`

- [ ] **Step 1: Write the failing test**

Create `client/src/app/profileMapping.test.js`:

```js
import { describe, expect, test } from "vitest";
import { personalToProfile, profileToPersonal, toProfileNumber } from "./profileMapping";

// The two shapes disagree on names and on how they spell "no value": `personal`
// uses "" because it backs form inputs, `profile` uses null because it is
// stored. Conflating those is the bug class that shipped a 3% body fat.

describe("toProfileNumber", () => {
  test.each([
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined]
  ])("treats %s as absent", (_label, value) => {
    expect(toProfileNumber(value)).toBeNull();
  });

  test("keeps a measured zero", () => {
    expect(toProfileNumber("0")).toBe(0);
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

  test("renames weight to weightKg", () => {
    expect(personalToProfile({ weight: "77" }).weightKg).toBe(77);
  });

  test("converts feet and inches to centimetres", () => {
    expect(personalToProfile({ heightFeet: "5", heightInches: "10" }).heightCm).toBe(178);
  });

  test("prefers an explicit heightCm over feet and inches", () => {
    expect(
      personalToProfile({ heightCm: "180", heightFeet: "5", heightInches: "10" }).heightCm
    ).toBe(180);
  });

  test("sends an unfilled body fat as null, not zero", () => {
    expect(personalToProfile({ bodyFat: "" }).bodyFat).toBeNull();
  });

  test("carries the training and lifestyle fields straight through", () => {
    expect(
      personalToProfile({
        sleep: "7-8 hours",
        timeline: "3 months",
        experience: "Intermediate",
        nutrition: "High-protein",
        cardio: "HIIT",
        goal: "Mobility",
        trainingDays: ["Monday"]
      })
    ).toMatchObject({
      sleep: "7-8 hours",
      timeline: "3 months",
      experience: "Intermediate",
      nutrition: "High-protein",
      cardio: "HIIT",
      goal: "Mobility",
      trainingDays: ["Monday"]
    });
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

  test("fills both height representations", () => {
    const personal = profileToPersonal({ heightCm: 178 });

    expect(personal.heightCm).toBe("178");
    expect(personal.heightFeet).toBe("5");
    expect(personal.heightInches).toBe("10");
  });

  test("defaults trainingDays to an array", () => {
    expect(profileToPersonal({ trainingDays: null }).trainingDays).toEqual([]);
  });

  test("round-trips the training and lifestyle fields unchanged", () => {
    const personal = {
      sleep: "7-8 hours",
      timeline: "3 months",
      experience: "Intermediate",
      nutrition: "High-protein",
      cardio: "HIIT",
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
import { splitFullName, toCmFromFeetInches, toFeetInchesFromCm } from "./units";
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

export const personalToProfile = (personal = {}) => {
  const { firstName, lastName } = splitFullName(personal.name);
  const heightCm =
    toProfileNumber(personal.heightCm) ??
    toProfileNumber(toCmFromFeetInches(personal.heightFeet, personal.heightInches));

  return {
    firstName,
    lastName,
    name: personal.name || "",
    age: toProfileNumber(personal.age),
    heightCm,
    weightKg: toProfileNumber(personal.weight),
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
    trainingDays: Array.isArray(personal.trainingDays) ? personal.trainingDays : []
  };
};

export const profileToPersonal = (profile = {}) => {
  const name =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || profile.name || "";
  // Already returns { feet: String, inches: String }, and { feet: "", inches: "" }
  // for an absent height -- so these two need no further conversion.
  const { feet, inches } = toFeetInchesFromCm(profile.heightCm);

  return {
    ...defaultPersonalForm,
    name,
    age: toFormValue(profile.age),
    heightCm: toFormValue(profile.heightCm),
    heightFeet: feet,
    heightInches: inches,
    weight: toFormValue(profile.weightKg),
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
    trainingDays: Array.isArray(profile.trainingDays) ? profile.trainingDays : []
  };
};
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --root client src/app/profileMapping.test.js`

Expected: PASS.

- [ ] **Step 6: Add the contract row**

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

- [ ] **Step 7: Run the contract test**

Run: `npx vitest run --root client src/numericCoercion.contract.test.js`

Expected: PASS, with the shared table now exercising both helpers.

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
import { createDefaultPlannerForm, defaultPersonalForm, goalOptions } from "./constants";

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

// These two must match allowedSexValues / allowedActivityValues in the server's
// dashboardDataBuildersService.js, which rejects anything else. They cannot be
// imported across the wire, so the duplication is unavoidable -- but it is kept
// to ONE copy on each side. AuthPage, HomePersonalStage and
// PreviewPersonalChapter currently hardcode the same options as inline <option>
// elements; migrating those three to read from here is worthwhile and is
// deliberately out of scope for this plan.
export const sexOptions = ["Female", "Male", "Non-binary", "Prefer not to say"];
export const activityOptions = ["Light", "Moderate", "High", "Very high"];
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

**Files:**

- Modify: `client/src/app/units.js`
- Modify: `client/src/pages/dashboard/views/SettingsView.jsx:1-32`

- [ ] **Step 1: Confirm the two copies are identical before touching either**

Run:

```bash
diff <(sed -n '17,44p' client/src/app/units.js | sed 's/^export //') <(sed -n '6,32p' client/src/pages/dashboard/views/SettingsView.jsx)
```

Expected: no output beyond whitespace. If they differ, stop — the difference is behaviour and must be understood before deduplicating.

- [ ] **Step 2: Run the existing SettingsView tests and record the result**

Run: `npx vitest run --root client src/pages/dashboard/views/SettingsView.test.jsx`

Expected: PASS. Note the test count; it must be identical after this task.

- [ ] **Step 3: Export the shared constant**

In `client/src/app/units.js`, add `export` to the existing `IMPERIAL_REGION_CODES` declaration so `units.js` remains its single definition.

- [ ] **Step 4: Delete the copies from SettingsView**

Remove `IMPERIAL_REGION_CODES`, `getRegionFromLocale` and `getPreferredMeasurementSystem` from `SettingsView.jsx` and import instead:

```js
import { getPreferredMeasurementSystem } from "../../../app/units";
```

`getRegionFromLocale` is used only by `getPreferredMeasurementSystem`, so it does not need importing.

- [ ] **Step 5: Run the tests and confirm nothing changed**

Run: `npx vitest run --root client src/pages/dashboard/views/SettingsView.test.jsx`

Expected: PASS, same test count as Step 2. This is a pure refactor — a changed count means behaviour moved.

- [ ] **Step 6: Commit**

```bash
git add client/src/app/units.js client/src/pages/dashboard/views/SettingsView.jsx
git commit -m "refactor(client): use the shared locale helpers in SettingsView"
```

---

### Task 6: Client — field descriptors

The tab `rows` array is currently the single declaration of what a tab shows. Keep it that way: add a descriptor to each row so the same array drives both read and edit rendering, rather than introducing a second list that can drift.

**Files:**

- Create: `client/src/pages/dashboard/views/settingsFields.js`
- Create: `client/src/pages/dashboard/views/settingsFields.test.js`

- [ ] **Step 1: Write the failing test**

Create `client/src/pages/dashboard/views/settingsFields.test.js`:

```js
import { describe, expect, test } from "vitest";
import { EDITABLE_TABS, fieldsForTab } from "./settingsFields";
import { sexOptions } from "../../../app/constants";

describe("settingsFields", () => {
  test("marks exactly the three real tabs editable", () => {
    expect(EDITABLE_TABS).toEqual(["profile", "training", "lifestyle"]);
  });

  test("gives every field a name and a type", () => {
    for (const tab of EDITABLE_TABS) {
      for (const field of fieldsForTab(tab)) {
        expect(field.name).toBeTruthy();
        expect(["text", "number", "select", "multiselect", "textarea"]).toContain(field.type);
      }
    }
  });

  test("offers the allowed sex values on the sex field", () => {
    const sex = fieldsForTab("profile").find((field) => field.name === "sex");
    expect(sex.options).toEqual(sexOptions);
  });

  // weekDays is a list of { label, key } objects, not strings. The multiselect
  // stores day keys, which is what buildProfile's trainingDays receives, so the
  // options must be the keys rather than the whole objects.
  test("offers training days as plain day-name strings", () => {
    const days = fieldsForTab("training").find((field) => field.name === "trainingDays");
    expect(days.options).toContain("Monday");
    expect(days.options.every((option) => typeof option === "string")).toBe(true);
  });

  test("returns nothing for a read-only tab", () => {
    expect(fieldsForTab("privacy")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --root client src/pages/dashboard/views/settingsFields.test.js`

Expected: FAIL, "Failed to resolve import ./settingsFields".

- [ ] **Step 3: Write the descriptors**

Create `client/src/pages/dashboard/views/settingsFields.js`. Mirror the server ranges exactly — age 10-120, height 100-260 cm, weight 25-400 kg, body fat 3-70 — so the ordinary case never round-trips, and re-export the option lists so the form and the server cannot disagree about them:

```js
import { activityOptions, goalOptions, sexOptions, weekDays } from "../../../app/constants";

// weekDays is [{ label: "Mon", key: "Monday" }, ...]. The stored trainingDays
// are the keys, so the multiselect offers those rather than the objects.
const trainingDayOptions = weekDays.map((day) => day.key);

export const EDITABLE_TABS = ["profile", "training", "lifestyle"];

const FIELDS_BY_TAB = {
  profile: [
    { name: "name", label: "Name", type: "text", maxLength: 80 },
    { name: "age", label: "Age", type: "number", min: 10, max: 120 },
    { name: "sex", label: "Sex", type: "select", options: sexOptions },
    { name: "heightCm", label: "Height", type: "number", min: 100, max: 260, unit: "height" },
    { name: "weight", label: "Weight", type: "number", min: 25, max: 400, unit: "weight" },
    { name: "bodyFat", label: "Body fat", type: "number", min: 3, max: 70 }
  ],
  training: [
    { name: "timeline", label: "Timeline", type: "text", maxLength: 60 },
    { name: "experience", label: "Experience", type: "text", maxLength: 40 },
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
    { name: "sleep", label: "Sleep", type: "text", maxLength: 40 },
    { name: "nutrition", label: "Nutrition", type: "text", maxLength: 60 },
    { name: "cardio", label: "Cardio", type: "text", maxLength: 60 },
    { name: "notes", label: "Notes", type: "textarea", maxLength: 500 }
  ]
};

export const fieldsForTab = (tabId) => FIELDS_BY_TAB[tabId] || [];
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --root client src/pages/dashboard/views/settingsFields.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/dashboard/views/settingsFields.js client/src/pages/dashboard/views/settingsFields.test.js
git commit -m "feat(client): declare the editable settings fields"
```

---

### Task 7: Client — the edit form component

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
  { name: "age", label: "Age", type: "number", min: 10, max: 120 },
  { name: "sex", label: "Sex", type: "select", options: ["Female", "Male"] },
  { name: "trainingDays", label: "Training days", type: "multiselect", options: ["Mon", "Tue"] }
];

const renderForm = (overrides = {}) =>
  render(
    <SettingsEditForm
      fields={FIELDS}
      values={{ name: "Jordan", age: "34", sex: "Female", trainingDays: ["Mon"] }}
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

  test("applies the server range to a number field so the common case never round-trips", () => {
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

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Sam" }));
  });

  test("toggles a multiselect value on and off", () => {
    const onSave = vi.fn();
    renderForm({ onSave });

    fireEvent.click(screen.getByRole("checkbox", { name: "Tue" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ trainingDays: ["Mon", "Tue"] }));
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

Create `client/src/pages/dashboard/views/SettingsEditForm.jsx`. Wrap each control in its own `<label>` — that nesting is how every form in this app associates labels, and the axe scan is the authority on whether it is correct, not the linter:

```jsx
import { useState } from "react";

export default function SettingsEditForm({ fields, values, onSave, onCancel, error, saving }) {
  const [draft, setDraft] = useState(() => ({ ...values }));

  const setField = (name, value) => setDraft((prev) => ({ ...prev, [name]: value }));

  const toggleInList = (name, option) =>
    setDraft((prev) => {
      const list = Array.isArray(prev[name]) ? prev[name] : [];
      return {
        ...prev,
        [name]: list.includes(option) ? list.filter((item) => item !== option) : [...list, option]
      };
    });

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave(draft);
  };

  return (
    <form className="settings-edit-form" onSubmit={handleSubmit}>
      {fields.map((field) => (
        <div key={field.name} className="settings-edit-row">
          {field.type === "multiselect" ? (
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
          ) : (
            <label>
              {field.label}
              {field.type === "select" ? (
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
              ) : field.type === "textarea" ? (
                <textarea
                  value={draft[field.name] || ""}
                  maxLength={field.maxLength}
                  onChange={(event) => setField(field.name, event.target.value)}
                />
              ) : (
                <input
                  type={field.type === "number" ? "number" : "text"}
                  value={draft[field.name] ?? ""}
                  min={field.min}
                  max={field.max}
                  maxLength={field.maxLength}
                  onChange={(event) => setField(field.name, event.target.value)}
                />
              )}
            </label>
          )}
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

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

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
const submitProfile = async (draft) => {
  try {
    const res = await apiFetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(personalToProfile(draft))
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload?.error || "Unable to save profile.");
    }
    const data = await res.json();
    setPersonal(profileToPersonal(data.profile));
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

Add `submitProfile` to the object returned at the end of the factory, and add `setPersonal` / `setUser` to its destructured dependencies if they are not already there.

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

const handleSave = async (draft) => {
  setSaving(true);
  setSaveError("");
  const result = await onSaveProfile({ ...personal, ...draft });
  setSaving(false);
  if (result?.ok) {
    setEditingTab("");
    return;
  }
  setSaveError(result?.error || "Unable to save profile.");
};
```

Merging over `personal` rather than sending `draft` alone matters: each tab edits a subset, and `personalToProfile` builds a whole profile. Sending one tab's fields alone would clear the others.

- [ ] **Step 4: Render the form in place of the rows**

Where the active tab's rows are rendered, branch on the edit state. Add the Edit button beside the tab description, rendered only when `EDITABLE_TABS.includes(activeTab)`:

```jsx
{
  editingTab === activeTab ? (
    <SettingsEditForm
      fields={fieldsForTab(activeTab)}
      values={personal || {}}
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
test("seeds the personal form from the signed-in user's stored profile", async () => {
  renderAppWithUser({
    profile: { firstName: "Jordan", lastName: "Fields", heightCm: 178, goal: "Mobility" }
  });

  await waitFor(() => expect(screen.getByTestId("personal-stage")).toBeInTheDocument());
  expect(stages.personal.personal.name).toBe("Jordan Fields");
  expect(stages.personal.personal.goal).toBe("Mobility");
});

test("seeds the planner goal from the stored profile", async () => {
  renderAppWithUser({ profile: { goal: "Recovery" } });

  await waitFor(() => expect(stages.personal).toBeTruthy());
  expect(screen.getByTestId("planner-goal")).toHaveTextContent("Recovery");
});
```

Use the file's existing render helper and `stages` capture object; `renderAppWithUser` may need adding alongside them, stubbing `/api/auth/me` to return the given user.

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
