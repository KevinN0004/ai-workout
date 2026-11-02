# Structured plans (roadmap Phase 4), Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Do roadmap Phase 4 as decided on 2026-11-02. `/api/generate` stores and returns
each new plan's structure, and the client reads that structure, parsing text only for plans
saved before this phase. One spec PR and three PRs, then a floor PR only if a figure rose.

**Design:** `docs/specs/2026-11-02-structured-plans-design.md`. Its findings, the captured
answers and the size measurement are not repeated here.

**Tech Stack:** Express 5, Prisma 7.10 over Postgres 18, React 19 with Vite 8, Vitest 5 with
v8 coverage, supertest, TypeScript 7.0.2 over JSDoc, Node 24, GitHub Actions, gh CLI.

**Status: a plan.** Every file and line below was read on `1bbc0ea`.

---

## Owner's decisions

Decided 2026-11-02:

- **The September design, with the client fallback for older plans.** Filling older plans'
  structure on the server at read time was offered and not chosen.
- **Fixtures from real answers.** Eight answers were captured through the local server with
  the owner's key.

## Conventions

The readability follow-up's rules still apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor.
- The comments, and the `CLAUDE.md` and README passages, that describe a change move in the PR
  that makes it.

Every behaviour change is test-first. Write the test, see it fail for the right reason, make
it pass, then show by mutation that it holds. Confirm each mutation applied before trusting a
run, and restore it from a saved copy.

Coverage slack is thin: client functions 0.19, server statements 0.19, server functions 0.16.
So every new function and branch ships with its test.

**Gates, in order, from `D:/ai-workout`:**

1. `npm run format:check`, `npm run lint`, `npm run knip`, `npm run typecheck`,
   `npm run build` and `npm test`;
2. `npm run test:coverage`, with `--coverage.reporter=json-summary` for exact counts against
   each floor.

**Merging:** only when GitHub reports the PR `CLEAN`, with a standalone
`gh pr merge <n> --merge`. Then watch `main`'s CI and Deploy runs to green.

## Task 1: the spec and this plan (PR 1)

**Files:** create the spec and this file; modify `docs/README.md` (list both).

- [ ] **Step 1:** branch from `origin/main`, add the three files, and run `npm run format:check`.
- [ ] **Step 2:** open the PR, wait for `CLEAN`, merge, and watch CI and Deploy.

## Task 2: the parser (PR 2)

**Files:**

- create `server/src/services/dashboard/planPayloadService.js`;
- create `server/src/services/dashboard/__tests__/planPayloadService.test.js`;
- create the eight fixtures in `server/src/services/dashboard/__tests__/fixtures/plans/`, named
  `01-home-bodyweight-3d.txt` to `08-commercial-recovery-1d-hip.txt`;
- modify `scripts/__tests__/repo-invariants.test.mjs` (`TYPE_CHECKED_FILES` from 4 to 5).

Steps:

- [ ] **Step 1: add the fixtures.** Copy the eight captured answers in byte for byte, with LF
      endings and no newline added.
- [ ] **Step 2: raise the count first.** Set `TYPE_CHECKED_FILES` to 5, run
      `npm run test:scripts`, and see the count test fail at 4.
- [ ] **Step 3: write the failing tests.**
  - Each fixture gives version 1 and seven days:
    - `index` 0 to 6;
    - `weekday` "Monday" to "Sunday", in order;
    - a `title` equal to the weekday;
    - `lines` that are not empty;
    - notes that are not empty.
  - The cases `plans.test.js` covers for `parsePlanSections`, ported:
    - a Coach Notes heading anywhere wins, even above the last weekday;
    - without one, the first Tips or Notes heading below the last weekday heading starts the
      notes, and one above it stays a line of its day;
    - a weekday line inside the notes stays a note;
    - the text after a notes label on its own line is the first note;
    - text with no weekday heading is one "Your plan" day, and empty text is no days;
    - CRLF text parses the same as LF text;
    - `**Monday - Push**`, `## Monday - Push` and `- Monday - Push` open no day.
  - `"MONDAY - Push"` gives weekday "Monday". The "Your plan" day has weekday null. A
    repeated weekday is two days, indexed in order.
  - `toPlanPayload` returns a valid payload unchanged. It returns null for each of:
    - `{}`, null, undefined, a string and an array;
    - version 2;
    - `days` that is not an array, or a day that is not an object;
    - an `index` that is not a whole number of 0 or more;
    - a `weekday` that is neither null nor one of the seven names;
    - a `title` that is not a string;
    - `lines` or `notes` that are not arrays of strings.

  Run them and see them fail, because the module does not exist yet.

- [ ] **Step 4: write the module,** with a header, `// @ts-check` and typedefs for a day and
      a payload. It exports `PLAN_PAYLOAD_VERSION`, `buildPlanPayload(text)` and
      `toPlanPayload(value)`, with the rules exactly as the spec's "The payload" gives them.
- [ ] **Step 5: see them pass,** with `npm run typecheck` and `npm run test:scripts` clean.
- [ ] **Step 6: mutate.** Each mutation must fail a test:
  - drop `toPlanPayload`'s version check;
  - stop capitalising the weekday;
  - let a Tips heading win over Coach Notes;
  - drop the "Your plan" fallback;
  - accept a non-integer `index`.
- [ ] **Step 7: run the gates and coverage.** The new file is fully covered.
- [ ] **Step 8:** open the PR, wait for `CLEAN`, merge, and watch CI and Deploy.

## Task 3: write and read (PR 3)

**Files:**

- modify `server/src/routes/generateRoutes.js`:
  - `:18-22`, the comment and `WEEKDAY_HEADING`;
  - `:333-335`, the warning;
  - `:342-354`, the plan entry;
  - `:378`, the answer;
- modify `server/src/repositories/generatedPlanRepository.js`: `:23-35`, `mapGeneratedPlan`,
  and `:61`, the stored payload;
- modify `server/src/routes/__tests__/generateRoutes.equipment.test.js`, which holds the
  route's HTTP tests;
- modify `server/src/repositories/__tests__/generatedPlanRepository.test.js` (real Postgres);
- modify `server/README.md:237-240`.

Steps:

- [ ] **Step 1: write the failing route tests.** Gemini is stubbed to answer fixture 01.
  - A signed-in call hands `saveGeneratedPlan` an entry whose `payload` equals
    `buildPlanPayload` of the answer. It answers that payload at the top level, and in
    `savedPlan` as well.
  - An anonymous call answers the payload, with `savedPlan` null.
  - `generate_no_weekday` is logged for a plan whose headings are all markdown. It is
    logged too for "Rest on Monday" alone, which the looser pattern let through. It is not
    logged for fixture 01.
- [ ] **Step 2: write the failing repository tests.**
  - `saveGeneratedPlan` stores the payload: the row read back holds it in `planPayload`, and
    the plan it returns carries it as `payload`.
  - An entry without a payload stores `{}`.
  - `mapGeneratedPlan` returns null for `{}` and for a malformed stored value.
- [ ] **Step 3: implement the route.** It imports `buildPlanPayload` and builds the payload
      once the length check passes. It warns when no day has a weekday, which replaces
      `WEEKDAY_HEADING`. It adds `payload` to the plan entry and answers
      `{ plan, payload, savedPlan }`.
- [ ] **Step 4: implement the repository.** It imports `toPlanPayload` from the service. That
      is the first repository import of a service module; the service imports nothing, so no
      cycle forms. It stores `toPlanPayload(entry.payload) ?? {}`, and `mapGeneratedPlan`
      returns `payload: toPlanPayload(row.planPayload)`.
- [ ] **Step 5: write it down.**
  - The route's comments.
  - `server/README.md:237`: the headings the prompt asks for are what `planPayloadService`
    parses when a plan is saved, and `plans.js` parses older plans' text by the same rules.
- [ ] **Step 6: mutate.** Each mutation must fail a test:
  - leave `payload` out of the answer;
  - store `{}` whatever the entry holds;
  - bring back the looser pattern for the warning.
- [ ] **Step 7: run the gates and coverage.** The `index.*` tests run the real wiring.
- [ ] **Step 8:** open the PR, wait for `CLEAN`, merge, and watch CI and Deploy. Until PR 4
      ships, the client ignores the new field.

## Task 4: the client read (PR 4)

**Files:**

- modify `client/src/app/plans.js` and `client/src/app/__tests__/plans.test.js`;
- create `client/src/app/__tests__/planPayload.contract.test.js`;
- modify `client/src/App.jsx`: `:124`, the result state; `:351`, the handlers' dependencies;
  and `:419`, `planSections`;
- modify `client/src/app/events.js` (`:87`, `:141`, `:164`) and
  `client/src/app/__tests__/events.test.js`;
- modify `scripts/__tests__/repo-invariants.test.mjs` (`TYPE_CHECKED_FILES` from 5 to 6, for
  `plans.js`);
- modify `CLAUDE.md:239-242`, the contract-test list, and `client/README.md:198-209`.

Steps:

- [ ] **Step 1: raise the count first.** Set `TYPE_CHECKED_FILES` to 6 and see the count
      test fail at 5.
- [ ] **Step 2: write the failing tests.**
  - `readPlan` returns a valid payload's days and notes, and parses the text when the payload
    is null or malformed.
  - The text parse's days carry `weekday` and `index`.
  - `planByWeekday` merges a repeated weekday's lines in order, and gives no key to a day
    with no weekday or no lines.
- [ ] **Step 3: write the contract test.** It runs every fixture, read from the server's
      fixture folder, and the edge cases from Task 2, Step 3, through both `buildPlanPayload`
      and the client's text parse. They must be equal, the version aside.
- [ ] **Step 4: implement in `plans.js`.** Add `// @ts-check`, give the text parse its
      `weekday` and `index`, and add `readPlan` and `planByWeekday`. Keep
      `extractLatestPlanByWeekday` as it is for now.
- [ ] **Step 5: prove the swap, then make it.**
  - A scratch script, not committed, runs today's `extractLatestPlanByWeekday` and
    `planByWeekday(readPlan(...))` over the fixtures and every `plans.test.js` input. The
    maps must be equal.
  - Then give `extractLatestPlanByWeekday` the new body. Its existing tests pass unchanged.
- [ ] **Step 6: wire the result.**
  - `App.jsx` gains `resultPayload` state, which `events.js` clears with the result and sets
    from `data.payload`.
  - `planSections` comes from `readPlan({ payload: resultPayload, text: result })`.
  - `events.test.js` asserts both setter calls.
- [ ] **Step 7: write it down.**
  - `CLAUDE.md`: add the contract test to the list.
  - `client/README.md`: the payload is read first, and the text parse covers older plans.
    Its notes on markdown headings and on the "Your plan" day still hold.
  - `server/README.md`: name the contract test.
- [ ] **Step 8: mutate.** Each mutation must fail a test:
  - make `readPlan` ignore the payload;
  - accept version 2;
  - change the server's Coach Notes pattern alone, which the contract test must catch.
- [ ] **Step 9: run the gates and coverage.** The client build changes in this PR, as
      expected. CI's E2E runs the dashboard with no plans, which `readPlan` must answer with
      no days.
- [ ] **Step 10:** open the PR, wait for `CLEAN`, merge, and watch CI and Deploy.

## Task 5: re-measure

- [ ] Run `npm run test:coverage` on `main` with exact counts. If a truncated figure rose, a
      floor PR per side raises it and updates the note beside it. Otherwise, say so in the
      phase's closing summary.

## Done when

- A new plan's structure is stored in `plan_payload`, and `/api/generate` and the dashboard
  return it as `payload`.
- The result page and the dashboard read that structure. Older plans parse from text by the
  same rules, which the contract test holds equal.
- `TYPE_CHECKED_FILES` is 6.
- `main` is green and deployed, and the roadmap page marks P4 done.
