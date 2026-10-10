# Readability follow-up — design

Date: 2026-10-10
Branch: `docs/follow-up-sequence`, stacked on #199 (`c483c6f`); `main` is at `9b85b7d`.

## Goal

Work through everything the code-readability effort (`docs/specs/2026-09-29-code-readability-design.md`)
left open, in an order that keeps coverage under control and means each thing is
verified once. The effort's reviews found a red CI audit, five open fix PRs that overlap the
stack, about thirty code bugs, gaps in reduced-motion handling, cascade bugs in the CSS, and
records (CLAUDE.md, READMEs) that the stack made untrue. Each was researched on 2026-10-09
and given a recommended fix; this spec decides the order and the rules that govern it.

Success means:

- every item not parked below has merged;
- `main` is green on every required check;
- every coverage floor equals its truncated measurement;
- CLAUDE.md and the READMEs agree with the code.

## Starting state, 2026-10-10

- **Nothing has merged.** `main` is at `9b85b7d`. The 14 readability PRs (#180–#188,
  #195–#199) form a stack: every base is `main`, and each branch is an ancestor of the next.
- **Every PR is blocked by the dependency audit.** The required "Lint, format, audit" check
  fails on two advisories published after the stack was cut: shell-quote
  GHSA-pqg4-j6r4-53mv (critical, through concurrently 10.0.5, which pins shell-quote 1.9.0)
  and source-map-js GHSA-68fv-2mgg-jv7q (high). `main` pins the same versions. #180–#187
  show green only because their checks ran before the advisories existed.
- **Five coverage metrics have no slack.** The floors are client 98.7 / 93.7 / 98.7 / 99.3
  and server 94.3 / 86.7 / 95.4 / 95.6 (statements / branches / functions / lines), set
  from the stack tip's own measurement. Client statements and functions, and server
  statements, branches and functions, sit at their floors: one new uncovered statement,
  branch or function on that side fails CI.
- **Client and server coverage are separate.** Each side has its own suite and its own
  floors, so a change on one side can never fail the other side's floors.
- **The open fix PRs:** #189 (pin the deploy checkout to the CI-passed commit) and #194
  (Dependabot) merge cleanly onto the stack tip. #190 (PM2.5 band gaps), #192 (Gemini
  guardrails) and #193 (meal-log sync) conflict with it in one or two files each, and #191
  (portable Claude tooling) conflicts in `repo-invariants.test.mjs` and fails the header
  ratchet, because its new `.cjs` file puts `"use strict"` before its header.

## Decisions

Four choices were put to the owner and settled before this was written.

| Question               | Decision                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| When floors are raised | Once per phase, by one floor PR per side. A fix PR keeps coverage at or above the floors but leaves the floor lines alone                                    |
| How fast PRs merge     | Promptly and one at a time, so every fix branches from the current `main` and nothing is stacked                                                             |
| The open product calls | Adopt the recommended defaults below, listed in one table; any can be overridden before the phase it affects starts                                          |
| What orders the phases | How each change moves coverage: changes that leave coverage alone first, then additions, then visual changes, then deletions, with the records of state last |

## The rules

1. **One merge at a time, on two independent tracks.** Every fix PR branches from the current
   `main`. Server and client fixes are separate tracks, because their floors are separate.
   Within a track, one PR at a time is ready to merge; others may be drafted, but each is
   rebased and re-measured just before it is marked ready. A merge on one track never
   forces a re-check on the other.
2. **Every PR covers its own changes.** Each fix ships tests for every line, branch and
   function it adds, and passes the floors on its own. No fix PR edits a floor.
3. **Each phase closes with one floor PR per side.** It re-measures `main`, raises each floor
   whose value truncated to one decimal went up, and updates the measurement note in the
   config. It is the only point at which the baseline moves. Floors are never lowered.
4. **Comments change with the code.** A fix updates the comments that describe the code it
   changes, in the same PR, as `docs/code-readability-sop.md` requires. Nothing waits for a
   later sweep.
5. **All deletions go in one phase, after the additions.** Deleting covered code lowers the
   percentage and deleting uncovered code raises it, so the net effect cannot be predicted.
   Grouping the deletions means it is measured once.
6. **Records of measured state are edited once, at the end.** CLAUDE.md, the READMEs and any
   other figure describing coverage, test counts or line numbers change after the last floor
   PR, so they describe the final state.
7. **CSS changes share one screenshot baseline per phase.** The phase captures `main` once
   with the fixed capture tool (`docs/plans/2026-09-29-code-readability.md`, Task 13
   Step 1). Each CSS PR lists the visual and computed-style changes it expects, and its
   compare must show exactly those.

## The phases

### Phase 0 — Unblock (no effect on coverage)

| Item | Change                                                                                                                                                      | Why here                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 0.1  | `npm update concurrently source-map-js --package-lock-only`: concurrently 10.0.6, shell-quote 1.12.0, source-map-js 1.2.2. Only `package-lock.json` changes | Every merge is blocked until the audit passes                                                                             |
| 0.2  | A `.env.*` rule in `.gitignore`. No negation is needed: the template is `env.example`, with no leading dot                                                  | Touches no other file, so it runs in parallel with 0.1                                                                    |
| 0.3  | The owner enables GitHub secret scanning and push protection                                                                                                | A settings change on a public repo, with no code                                                                          |
| 0.4  | Close and reopen the stacked PRs a few at a time                                                                                                            | A plain re-run reuses the old merge commit and stays red; staggering keeps CI's image pulls under Docker Hub's rate limit |

### Phase 1 — Land the reviewed work

| Item | Change                                                                                                                                                                                                                               | Why here                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1.1  | Merge #189                                                                                                                                                                                                                           | Every deploy the stack triggers then ships the commit CI passed                  |
| 1.2  | One comment-only commit on #199: the untrue `server/src/corsPolicy.js:40` comment and its twin in `index.cors.test.js`; the three headers over four lines trimmed, with `scripts/manual-deploy.mjs`'s notes moved to a "Usage" block | Keeps the stack's comments true when it lands; the push also refreshes #199's CI |
| 1.3  | Merge #180 to #199 in order, each with "Create a merge commit"                                                                                                                                                                       | Squash or rebase merging conflicts at every step; merge commits stay clean       |

After 1.3, coverage on `main` is the stack tip's, which is already measured.

### Phase 2 — The existing fix PRs, each rebased once

| Item | Change                                                                                                                                 | Track                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 2.1  | #190, plus the EPA 2024 PM2.5 breakpoint table, a row in the numeric-coercion contract test, and a "based on the latest reading" label | Server                                                   |
| 2.2  | #193                                                                                                                                   | Server                                                   |
| 2.3  | #192                                                                                                                                   | Server                                                   |
| 2.4  | #191, with its header moved above `"use strict"` and both blocks kept in `repo-invariants.test.mjs`                                    | Tooling, no coverage effect; merges when ready           |
| 2.5  | #194, rebased by Dependabot after 0.1                                                                                                  | Both: it bumps the coverage tool itself, so it goes last |
| 2.6  | Floor PR, both sides                                                                                                                   | Close                                                    |

### Phase 3 — Additive fixes, on two parallel tracks

| Server, in order                                                                                                                                         | Client, in order                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1. Sessions fail closed when Redis is down: 503 at sign-in with no cookie, a 1–2 s command timeout. Rewrites the three tests that pin today's behaviour | C1. `cache.js` reads `localStorage` inside its `try`, plus a hand-written root error boundary                                                                                               |
| S2. `sendErrorResponse` reports to Sentry when the status is 500 or above, which covers its 28 call sites                                                | C2. A shared client `toNumberOrNull`, used for weight, with a row in the client contract test                                                                                               |
| S3. The two `CREDENTIAL_RATE_LIMIT_*` validation rows, the missing-OpenAQ-key fast path, and loading only the collection a paginated route answers with  | C3. A generation counter so a save in flight at logout cannot reach the next account; Undo withdrawn once the send starts; "Show more" paging in the Logs view                              |
| S4. `metrics.authFailures` exposed in the metrics payload; a comment and test for the CSRF reissue at sign-in; the `vitest.setup.js` count               | C4. The height-unit toggle, the plan-notes heading, the injury "None" default, the Cardio goal                                                                                              |
| S5. Floor PR, server                                                                                                                                     | C5. Local dates for meal logs and the next workout, client bounds matching the server's with a contract test, `Intl.Locale` for the region, `Object.hasOwn` in routing, "Back to dashboard" |
|                                                                                                                                                          | C6. Floor PR, client                                                                                                                                                                        |

### Phase 4 — Motion and CSS (client track, with screenshot checks)

It follows Phase 3 because C4 and C5 change markup these fixes style.

| Item | Change                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1   | A JavaScript reduced-motion gate for the physique pulse and entrance, and for the walkthrough's opening scroll. It adds branches, with tests                 |
| M2   | Reduced-motion CSS for the toggle pills, the remember-me tick, the planner pill, the contents labels' `!important` transition and the three loading shimmers |
| K1   | The walkthrough contents lane: `backdrop-filter: none` on `.preview-stage-panel`, so the lane stays fixed to the viewport                                    |
| K2   | The phone form layouts: the advanced personal form and the `/auth` height fields                                                                             |
| K3   | The advanced fields' grid between 721 and 980px, and the Sets/Reps/Intensity row in the workout modal                                                        |
| K4   | The cosmetic two: the bottom navigation's borders and the workout modal's button alignment                                                                   |
| K5   | Floor PR, client                                                                                                                                             |

### Phase 5 — Deletions

| Item | Change                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------- |
| D1   | GeneratedPlanModal, its state, its tests and its `.plan-modal` CSS                                |
| D2   | The dead CSRF fallback in `useApiClient.js` and the "Enviroment" typo, with the tests that pin it |
| D3   | Floor PR, both sides. The one measurement where the percentages can move either way               |

### Phase 6 — Records

| Item | Change                                                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | CLAUDE.md: the volatile numbers and line references go, each replaced by where the value lives; the identifiers that changed are fixed; the floor-raising timing is recorded |
| R2   | A test that pins the floors CLAUDE.md names to the two configs, in the style of `repo-invariants.test.mjs`                                                                   |
| R3   | The READMEs, and the "barely exercised" CORS wording in `render.yaml`, the README and `docs/deploy-runbook.md`                                                               |
| R4   | A header-length check in the ratchet. It passes on the day it lands, because 1.2 trimmed the three long headers                                                              |

### Parked

Not sequenced, each for a later decision: NowCast or a switch to AirNow's own AQI (the PM2.5
averaging period), a `@layer` migration, gitleaks, letting the server allow its own origin
automatically, and the cascade bugs no user can see, which are accepted as they are.

## Default answers to the product calls

| #   | Decision                                       | Default                                                                                                   | Phase   |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------- |
| 1   | A signed-in request while Redis is down        | 503, which keeps the client's signed-in state; a 401 would likely log the user out                        | S1      |
| 2   | Entries still inside the undo window at logout | Sent before the state is cleared; their toast already said "Saved locally"                                | C3      |
| 3   | Meal logs and metrics past the first page      | "Show more" calls the paged GET routes the server already has and tests, which nothing calls today        | C3      |
| 4   | "Back to home" for a signed-in user            | Relabelled "Back to dashboard", going to `/dashboard`; a signed-in user cannot reach `/`                  | C5      |
| 5   | PM2.5 above 325.4 µg/m³                        | Extrapolated on the top segment's slope, as the EPA's guidance says; `aqiBand` already handles 500 and up | 2.1     |
| 6   | A negative sensor reading                      | Stays "Unknown", as now: a sensor fault, not a measured zero                                              | 2.1     |
| 7   | `metrics.authFailures`                         | Exposed in the metrics payload; it is already counted                                                     | S4      |
| 8   | GeneratedPlanModal                             | Deleted; its last opener was removed on purpose in `21a2d45`                                              | D1      |
| 9   | The cascade bugs no user can see               | Accepted; their rules are removed only where they die with deleted code                                   | 4 and 5 |
| 10  | When floors are raised                         | Once per phase; CLAUDE.md says so from R1                                                                 | All     |

## Verification

**Every fix PR, before it is marked ready:**

- a test written first that fails for the bug's reason, then passes;
- every gate on the branch rebased onto the current `main`: lint, format:check, knip, build,
  `test:coverage` with Postgres up, and the E2E suite;
- the header ratchet, with the allowlist empty;
- the comments describing the changed code updated in the same PR, and checked for truth;
- a spec review and a quality review, with fix rounds until both pass;
- for CSS and motion PRs, a compare against the phase's screenshot baseline that shows
  exactly the changes the PR lists.

**What forces a re-check, and how far it goes:**

| Event                          | Re-check                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| A merge on the same track      | The next PR on that track is rebased and `test:coverage` re-run. A reviewer looks again only at conflicted hunks |
| A merge on the other track     | None                                                                                                             |
| A floor PR merging             | Drafts on that side are re-measured once against the new floors                                                  |
| A CSS PR merging               | The next CSS PR's compare uses the merged state as its baseline                                                  |
| A default overridden mid-phase | Only the PR that carries that item is re-planned                                                                 |

**Closing a phase:** the floor PR merges with its measurement on `main`; a short phase report
lists what merged, the coverage before and after, and anything moved to a later phase; and the
next phase gets its own implementation plan before work starts.

## Out of scope

The parked items above, any new feature, and any change to the readability SOP beyond R4.
