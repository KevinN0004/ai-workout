# Structured plans (roadmap Phase 4), design

Status: **decided 2026-11-02**, nothing applied. The plan is
`docs/plans/2026-11-02-structured-plans.md`.

The September roadmap (`docs/specs/2026-09-18-development-roadmap-design.md`, Phase 4)
approved the shape: `/api/generate` parses the model's answer once, at write time, into
`{ version, days: [{ index, weekday, title, lines }], notes }`, `planText` stays as it is,
and the client's two parsers become one structured read, with the text parse kept as the
fallback for older plans. This spec settles the parse rules, the API fields, the client
read and the tests, against real answers captured for it.

## What was found

Read on `1bbc0ea`.

1. **The structure column is written empty and never read.** `saveGeneratedPlan` writes
   `planPayload: {}` (`generatedPlanRepository.js:61`) into a `jsonb` column that defaults to
   `'{}'` (`schema.prisma:125`), and `mapGeneratedPlan` does not return it.
2. **The route answers with text alone.** `/api/generate` answers `{ plan, savedPlan }`
   (`generateRoutes.js:378`), and `savedPlan` is null for an anonymous caller. Its "no
   weekday" warning tests a looser pattern than the client's rule: a weekday named
   mid-line passes it (`generateRoutes.js:18`).
3. **Two client parsers read the text, and they disagree at the edges.**
   - `parsePlanSections` (`plans.js:44`) parses the plan just generated, for the result page
     (`App.jsx:419`).
   - `extractLatestPlanByWeekday` (`plans.js:92`) turns the newest saved plan into a map from
     weekday to lines (`App.jsx:421`), which `useDashboardMetrics`, `planUtils`, `PlansView`
     and `TipsView` read.
   - Both find the notes with `findNotesStart`. A weekday repeated in a plan is two days in
     the first and one merged key in the second. A heading with no lines under it is a day
     in the first and no key in the second. Text with no weekday heading is one "Your plan"
     day in the first and an empty map in the second.
4. **The client reads only the newest saved plan** (`dashboard.plans[0]`). The dashboard
   returns up to `GENERATED_PLAN_LIMIT` of them.
5. **A markdown heading opens no day.** `**Monday**`, `## Monday` and `- Monday` are not
   recognised, and `plans.test.js` pins that.

## Real answers

Captured on 2026-11-02 from the local server, with the model it is configured with: eight
`/api/generate` answers for synthetic profiles, through a throwaway local account deleted
afterwards. The profiles cover Home and Commercial, 1 to 7 training days, every injury option
and none. One more request timed out at `GEMINI_TIMEOUT_MS` and was retried.

- **The format is regular.** Every answer has a bare heading for each weekday, Monday to
  Sunday, in order, and ends with `Coach Notes:`. All seven days appear even when one to
  three training days were asked for. No answer uses a markdown heading. Days hold labelled
  blocks of hyphen bullets: a warmup, a main block, accessories and a finisher.
- **Rest days are prose, written at least six ways.** Among them: "Rest / Active Recovery",
  "Rest Day - …", "Rest or 20-minute light walk.", "Full Rest.", "Active Recovery: …", and
  "Warmup: None." followed by "Main lifts: Full Rest.".
- **Today's parse already fits them.** It gives every answer seven days, each starting with
  a weekday, and one to five note lines.
- **Measured size.** The payload's JSON is 1.13 to 1.27 times the text it comes from, 1.18
  across the eight. A new plan's row and API object therefore grow to about 2.2 times their
  current size.

## Decision

**The September design, with the client fallback for older plans**, decided by the owner on
2026-11-02.

Considered and not chosen:

- **The server fills older plans' payload on read**, so the client keeps no parser. Every
  dashboard load would then parse each older plan's text again, up to `GENERATED_PLAN_LIMIT`
  of them, and existing users' responses would roughly double at once.
- **Recognising markdown headings.** No real answer uses one, so the rule stays as it is.
- **Asking Gemini for JSON.** That is roadmap item B5, after this structure has been in
  production, as the September roadmap decided.

## Design

### The payload

```text
{ version: 1, days: [{ index, weekday, title, lines }], notes }
```

The rules are today's `parsePlanSections`, unchanged:

- The text is split into lines, each trimmed, and empty lines are dropped.
- **The notes** start at the first `Coach Notes` heading wherever it is. Without one, they
  start at the first `Tips` or `Notes` heading below the last weekday heading. They hold the
  text after the label on that line, then every line below it.
- **A day** starts at each line, above the notes, that begins with a weekday name, compared
  lower-cased. It holds the lines up to the next weekday line or the notes.
- **Text with no weekday heading** becomes one day titled "Your plan". Empty text becomes no
  days.

Each day records:

- `index`, its position, counting from 0;
- `title`, the heading line as written;
- `weekday`, the name the title starts with, capitalised ("Monday" to "Sunday"), or null for
  the "Your plan" day;
- `lines`.

Index 0 is a real day, so no code tests `index` for truthiness.

### PR: the parser

- `server/src/services/dashboard/planPayloadService.js` exports `PLAN_PAYLOAD_VERSION`,
  `buildPlanPayload(text)` and `toPlanPayload(value)`. `toPlanPayload` returns a stored
  value when it is a version-1 payload of the right shape, and null otherwise, the stored
  `{}` included.
- The module carries `// @ts-check` from the start (decision record 0017), so
  `TYPE_CHECKED_FILES` rises to 5.
- The eight captured answers become fixtures in
  `server/src/services/dashboard/__tests__/fixtures/plans/`.
- No route uses the module yet.

### PR: write and read

- `/api/generate` builds the payload from the answer once its checks pass. It stores the
  payload with the plan and answers `{ plan, payload, savedPlan }`, so an anonymous caller
  gets the structure too.
- The `generate_no_weekday` warning fires when no day has a weekday, replacing the looser
  pattern.
- `saveGeneratedPlan` stores `toPlanPayload(entry.payload) ?? {}`, which keeps `{}` as the
  one meaning of "none". `mapGeneratedPlan` returns `payload: toPlanPayload(row.planPayload)`.
- `events.js` already puts `savedPlan` at the head of the dashboard's plans, so the newest
  plan carries its payload from the moment it is saved.

### PR: the client read

- **`plans.js` gains `readPlan({ payload, text })`.** It returns the payload when it is a
  valid version-1 payload, and otherwise the text parse, which gains `weekday` and `index`.
  The file carries `// @ts-check` once it is rewritten, so `TYPE_CHECKED_FILES` rises to 6.
- **`planByWeekday(plan)` turns a structured plan into the weekday map.** It maps each weekday
  to its days' lines, in order, so a repeated weekday's lines merge as they do today. A day
  with no weekday or no lines adds no key.
- **`extractLatestPlanByWeekday` keeps its name and signature, but loses its own parse.** It
  reads the newest saved plan through `readPlan` and groups it with `planByWeekday`. Its
  existing tests stay unchanged, and before the swap the old and new versions are run over
  the eight fixtures and must give equal maps.
- **The result page's plan goes through `readPlan` too,** from the generate answer
  (`App.jsx:419`). `events.js` keeps the answer's `payload` beside its text.
- **A contract test, `client/src/app/__tests__/planPayload.contract.test.js`,** requires
  the server's `buildPlanPayload` and the client's text parse to agree on every fixture and on
  every `plans.test.js` input. It sits with the other cross-wire contract tests, which
  `CLAUDE.md` lists.

### Floor PR

Only if a truncated coverage figure rises.

## Testing

- **The parser** against the eight fixtures: seven days each, weekdays in order, and the
  notes. The `plans.test.js` cases are ported too: where the notes start, Tips and Notes
  headings, a weekday line inside the notes, no weekday heading, empty text, CRLF text, and
  markdown headings staying unrecognised.
- **`toPlanPayload`:** a valid payload passes. `{}`, null, a string, another version,
  `days` that is not an array, a non-integer `index` and a non-string line each give null.
- **The generate route:**
  - the payload is built from the answer, stored, and returned both at the top level and in
    `savedPlan`;
  - an anonymous caller gets the payload;
  - the no-weekday warning fires for markdown headings and stays silent for real answers.
- **The repository** stores the payload. `mapGeneratedPlan` returns it, and returns null for
  `{}`.
- **The client:** `readPlan` prefers a valid payload and falls back on null or a malformed
  one. `extractLatestPlanByWeekday`'s existing tests pass unchanged on its new body.
- **Every new guard is mutation-tested,** each mutation confirmed applied.
- **Coverage slack is thin.** It stands at client functions 0.19, server statements 0.19 and
  server functions 0.16, so every new function and branch ships with its test.
- **No E2E change.** Generation needs a live key, so it stays outside the E2E suite.

## What P5 inherits

P5 links a session to `(generated_plan_id, plan_day_index)`. A stored payload keeps that
index stable. A plan saved before this phase has no stored payload, so P5's spec should offer
plan-day logging only for plans that have one.

## What forces a re-check

- **A change of model (`GEMINI_MODEL`) or prompt:** capture again and run the parser's tests.
  If a new answer uses a markdown heading, the rule changes in both parsers at once; the
  contract test fails otherwise.
- **B5 (JSON from the model):** the payload comes from the model's answer, and the text
  parse stays as the fallback for a malformed one.

## Found, not fixed here

- **Rest days count as training days.** `planUtils.js:168` marks a day as a training day when
  the newest plan has lines for it. Every real answer gives rest days lines, so the meal plan
  gives every day the training-day calories (`getDailyCalories`). Rest days are written too
  many ways to parse reliably, and P6 needs planned training days anyway, so this is P6's.
- **The dashboard returns up to `GENERATED_PLAN_LIMIT` plans** with their text, and now their
  payload, though the client reads only the newest. Trimming the rest is a data-growth
  change, not this phase's.

## Out of scope

- Asking Gemini for JSON (B5).
- Recognising markdown headings.
- Detecting rest days (P6).
- Backfilling older rows: the client fallback replaces a backfill.
