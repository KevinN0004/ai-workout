# Editable Profile — Design

Status: approved, not yet implemented.

## Problem

The account profile can be set once, at signup, and never changed. Settings
displays it and nothing else. Behind that single symptom sit four distinct
defects, found while auditing the repository.

### 1. `POST /api/profile` has no caller

The endpoint is built, validated and tested (`authRoutes.js:58`), and nothing in
`client/` calls it. `SettingsView.jsx` contains no `fetch` at all — it is a
tabbed read-only list of label/value rows.

`GET /api/profile` is separately redundant: `/api/auth/me` already returns the
profile, which is where the client gets it.

### 2. Six fields are never persisted anywhere

The Training and Lifestyle tabs render `personal.*`, not `user.profile.*`.
`personal` is plain `useState` in `App.jsx:102`, seeded from
`defaultPersonalForm`. It is never written to `localStorage` — only the
dashboard and weather caches use that — and `buildProfile`
(`dashboardDataBuildersService.js:145-168`) returns an explicit whitelist, so
these six are dropped on the way to the database even though
`profileInputSchema` is `.passthrough()`:

`sleep`, `timeline`, `experience`, `trainingDays`, `nutrition`, `cardio`

They survive only until reload. This is not cosmetic. `useBodyModel.js:157-166`
derives `sleepScore` from `personal.sleep`, and it feeds the silhouette's
conditioning channel — so the rendered physique silently changes after a
refresh, with no user action.

### 3. The Goal row is dead

Settings renders `personal?.goal || profile?.goal`. Neither side is ever
assigned: `defaultPersonalForm` has no `goal` key, `HomePersonalStage` has no
goal input, and `defaultProfile()` has no `goal` field. The row reads "Not set"
for every user, permanently.

### 4. Every generated plan targets the same goal

`createDefaultPlannerForm()` sets `goal: "Build lean strength and energy"`.
`PlannerSetupModal` exposes `days`, `duration`, `level` and `injuries` — but not
`goal`. The value is nonetheless sent to `/api/generate` and interpolated
straight into the Gemini prompt (`generateRoutes.js:162`) as `- Goal: ${goal}`.

So the goal line of every AI-generated plan, for every user, is a constant.

## Decisions taken

| Question                         | Decision                                                      |
| -------------------------------- | ------------------------------------------------------------- |
| Scope                            | Profile tab **and** the unpersisted training/lifestyle fields |
| Edit interaction                 | Per-tab Edit / Save / Cancel mode                             |
| Source of truth                  | Stored profile; `personal` hydrates from it                   |
| Dead Goal row                    | Add `goal` as a real profile field                            |
| Clearing a signup-required field | Allowed                                                       |

## Scope correction worth recording

While asking about source of truth it was claimed that plan generation reads
`personal`. **It does not.** `/api/generate` posts the planner form
(`events.js:96`), which is separate state. `personal` feeds `HomePersonalStage`,
`useBodyModel` and `SettingsView` only. Hydration is still the right call — the
two-copies problem is real for height, weight and name — but the blast radius is
smaller than stated at the time.

## Design

### Server: seven new profile fields

`AppUser.profile` is a `Json` column (`schema.prisma:16`), so **no SQL migration
is required**. Three files change:

- **`defaultProfile()`** — add `sleep`, `timeline`, `experience`, `nutrition`,
  `cardio`, `goal` as `""`, and `trainingDays` as `[]`.
- **`buildProfile()`** — add the seven whitelist entries. Only `timeline` is
  free text and uses `cleanText`. `sleep`, `experience`, `nutrition`, `cardio`
  and `goal` are each validated against an allowlist and fall back to `""`,
  mirroring how `sex` and `activity` already work. `trainingDays` is cleaned,
  deduped and filtered to the seven day names.
- **`profileInputSchema`** — `optionalStringField(60)` for `timeline`, a
  `z.array(z.enum(allowedTrainingDayValues)).max(7).optional()` for
  `trainingDays`, and a
  `z.union([z.enum(allowedXValues), z.literal("")]).optional()` for each of the
  five closed-set scalar fields, matching how `sex` is already declared. Every
  field except `timeline` rejects an unrecognised value with a 400 rather than
  storing a fallback.

**Correction, recorded because the first draft of this spec had it wrong.** An
earlier version of this section called `sleep`, `experience`, `nutrition` and
`cardio` free-text fields. They are not. All four are closed-set `<select>`
dropdowns in `HomePersonalStage.jsx`, and `useBodyModel.js` resolves each one
through an exact-match lowercased map to derive a body-model score — so they are
structurally identical to `sex` and `activity`, which `buildProfile` already
validates. Storing them as free text would let any caller other than the app's
own form leave display-visible garbage in a profile, and would score it as the
neutral fallback. There is no legacy data for these fields — they were never
persisted before this work — so validating them from the outset costs nothing.

Two consequences worth carrying forward:

- **An allowlist that is missing a real option silently drops a legitimate
  value**, which is the same defect class this work exists to close. The `cardio`
  list has **eight** entries; `"Mixed"` is easy to miss and is scored `0.7` in
  `useBodyModel`. Build each list from the `<option>` elements and cross-check it
  against the lookup-map keys.
- **A length cap placed in front of a membership filter silently discards valid
  data, and raising the number never fixes it.** `trainingDays` got this wrong
  three times: `buildProfile` capped to 7 before deduping, so all seven days
  selected stored six; the schema then capped to 7 before `buildProfile`'s
  filter, so `["x1".."x7","Monday"]` stored nothing and returned 200; widening
  that cap to 64 moved the identical failure to 65 entries. The cure is to stop
  capping and start validating — `z.enum` rejects an unknown day, and
  `z.array().max()` rejects rather than truncating, so no silent drop is left.
  `buildProfile` no longer slices at all: it filters the seven canonical day
  names against its input, so the result is bounded and deduped by construction
  with no cap to misplace.

  The instinct that produced all three bugs was treating "cap the list" as
  validation. It is not — it is an ordering hazard. The same instinct also
  produced the justification that a stray entry should be dropped rather than
  rejected "to be kind to clients", which made `trainingDays` the only
  closed-set field in the schema that silently discarded bad input, in a change
  whose whole purpose was eliminating silent data loss.

`allowedGoalValues` is reinstated in `dashboardDataBuildersService.js` beside
`allowedSexValues` and `allowedActivityValues`. The list is recovered verbatim
from commit `c2c820f`, which deleted it as dead code:

```
Build lean strength and energy
Fat loss + conditioning
Mobility
Recovery
Cardio
```

`isCompleteSignupProfile` is **unchanged**. All seven new fields are optional, so
signup behaves exactly as before.

### Clearing a field

`POST /api/profile` already accepts `null` for the numeric fields via
`optionalNullableNumberField`, so a user may clear age, height, weight or body
fat. This is left as-is by decision: those fields gate account _creation_, not
account validity, and enforcing `isCompleteSignupProfile` on edit would mean a
server change to reject input the schema currently accepts.

### Field mapping

`personal` and `profile` use different names for the same data, so one module
owns the translation rather than scattering it across components:
`client/src/app/profileMapping.js`, two pure functions, its own test file.

| `personal`                                   | `profile`                | Note                                                |
| -------------------------------------------- | ------------------------ | --------------------------------------------------- |
| `name`                                       | `firstName` + `lastName` | `buildProfile` already splits and rejoins           |
| `weight`                                     | `weightKg`               | rename only                                         |
| `heightFeet` / `heightInches`                | `heightCm`               | UI unit representation; `toCmFromFeetInches` exists |
| `age`, `sex`, `bodyFat`, `activity`, `notes` | same                     | direct                                              |
| the seven new fields                         | same                     | direct                                              |

Pure functions with no React import, so both directions can be tested in
isolation.

The absent-versus-zero rule governs this module. `personal` holds `""` for an
unfilled numeric field while `profile` holds `null`, and these are the exact
fields — `bodyFat` above all — behind the shipped 3%-body-fat bug. The mapper
guards before it coerces, copying `toNumberOrNull` in `repositories/rowValues.js`,
and gets a row in the client numeric-coercion contract test.

### Hydration

- On sign-in and on the `/api/auth/me` response, seed `personal` from
  `user.profile` through the mapper. The home flow arrives pre-filled with what
  the user already told it.
- A Settings save updates the server, then updates `personal` from the response,
  so the silhouette and home flow reflect the edit without a reload.
- `resetPersonalFlow()` resets to the saved profile when signed in, and to
  `defaultPersonalForm` when not.

### Planner seeding

`createDefaultPlannerForm()` takes the profile's `goal`, falling back to
`goalOptions[0]` when it is empty or the user is signed out.

This is what makes the new `goal` field genuinely read rather than dead data,
and it fixes defect 4: generated plans start targeting the user's actual goal.
It is a deliberate behaviour change to plan generation and should be called out
in the PR.

### Client: per-tab Edit / Save

Only the three real tabs become editable — Profile, Training, Lifestyle.
Connected Apps, Privacy and Notifications remain read-only placeholders; they
are hardcoded strings with no backing concept and are out of scope.

Each tab gains an Edit button that swaps its rows into inputs, with Save and
Cancel. One request per save. The existing `rows` array stays the single
declaration of what a tab contains; each row gains a descriptor
(`type: text | number | select | multiselect | textarea`) that drives both the
read and the edit rendering, so the two cannot drift apart.

Height and weight reuse the signup unit toggles and the existing `units.js`
converters. Email is displayed but locked — there is no change-email endpoint.

`SettingsView.jsx` is 209 lines and would roughly double. It splits into
`SettingsView.jsx` (tabs and read rows), `SettingsEditForm.jsx` (edit mode) and
`settingsFields.js` (descriptors). The trigger is the second reason to change
rather than the line count, per the repository's stated convention.

### Validation and errors

The client mirrors the server ranges — age 10-120, height 100-260 cm, weight
25-400 kg, body fat 3-70 — so the ordinary case never round-trips. The server
stays authoritative. A 400 renders inline above the Save button, and the edit
stays open with the user's input intact rather than discarding it.

## Testing

Test-driven for the mapper, the server field additions and the planner seeding.
Characterization-then-mutation for the view, following the approach used on the
home stage components: an assertion written against existing behaviour passes on
its first run either way, so the mutation pass is what proves it discriminates.

What must be pinned:

- The mapper round-trips in both directions, including the `""` / `null` /
  absent cases, with a row added to the client numeric-coercion contract test.
- `buildProfile` persists the seven new fields and still strips genuinely
  unknown ones.
- `trainingDays` survives as an array and is capped.
- A save updates the stored profile, and the rehydrated `personal` changes the
  silhouette — the regression that defect 2 causes today.
- The planner's goal follows the profile, and falls back when it is empty.
- Signup still succeeds with none of the new fields supplied.

## Out of scope

Connected Apps, Privacy and Notifications; changing email or password; deleting
an account; exposing `goal` in `PlannerSetupModal` (the profile now seeds it, and
a per-plan override is a separate question).
