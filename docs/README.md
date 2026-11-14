# docs

| Path                                                 | What it is                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`deploy-runbook.md`](deploy-runbook.md)             | Step-by-step first deployment to Render + Neon + Upstash, and what to check when it goes wrong    |
| [`code-readability-sop.md`](code-readability-sop.md) | How source files are commented and ordered, and how to prove a readability change altered nothing |
| [`adr/`](adr/README.md)                              | Decision records: why a rule in `CLAUDE.md` exists, one record per decision, kept current         |
| `plans/`                                             | Implementation plans, one file per effort, named `YYYY-MM-DD-name.md`                             |
| `specs/`                                             | Design specs, named to match the plan they belong to                                              |

**Plans and specs are dated records.** Each describes the codebase as it was when it was written and is not updated afterwards, so a name or figure in one may since have changed. For how things are now, read the code, the READMEs and `CLAUDE.md`. For why something is the way it is, read its decision record in `adr/`, which is kept current, or the plan or spec for that effort.

## Plans

- [2026-08-05 — Operational hardening](plans/2026-08-05-operational-hardening.md)
- [2026-09-04 — Retiring the Mongo compatibility shim](plans/2026-09-04-retiring-the-mongo-compat-shim.md)
- [2026-09-06 — Foundation hardening](plans/2026-09-06-foundation-hardening.md)
- [2026-09-14 — Editable profile](plans/2026-09-14-editable-profile.md)
- [2026-09-18 — Baseline and account management](plans/2026-09-18-baseline-and-account-management.md)
- [2026-09-22 — Deployment readiness remediation](plans/2026-09-22-deployment-readiness-remediation.md)
- [2026-09-23 — Repository layout reorganization](plans/2026-09-23-repo-layout-reorganization.md)
- [2026-09-29 — Code readability](plans/2026-09-29-code-readability.md)
- [2026-10-10 — Readability follow-up](plans/2026-10-10-readability-follow-up.md)
- [2026-10-10 — Readability follow-up, Phase 2](plans/2026-10-10-readability-follow-up-phase-2.md)
- [2026-10-15 — Readability follow-up, Phase 3 server track](plans/2026-10-15-readability-follow-up-phase-3-server.md)
- [2026-10-15 — Readability follow-up, Phase 3 client track](plans/2026-10-15-readability-follow-up-phase-3-client.md)
- [2026-10-16 — Readability follow-up, Phase 4](plans/2026-10-16-readability-follow-up-phase-4.md)
- [2026-10-16 — Readability follow-up, Phase 5](plans/2026-10-16-readability-follow-up-phase-5.md)
- [2026-10-17 — Readability follow-up, Phase 6](plans/2026-10-17-readability-follow-up-phase-6.md)
- [2026-10-22 — Readability follow-up, open items](plans/2026-10-22-readability-follow-up-open-items.md)
- [2026-10-24 — Parked items](plans/2026-10-24-parked-items.md)
- [2026-11-02 — Production data growth](plans/2026-11-02-production-data-growth.md)
- [2026-11-02 — Decision records](plans/2026-11-02-decision-records.md)
- [2026-11-02 — Type checking through JSDoc, phase 1](plans/2026-11-02-jsdoc-type-checking.md)
- [2026-11-02 — Structured plans](plans/2026-11-02-structured-plans.md)
- [2026-11-02 — Logging a workout against a plan day](plans/2026-11-02-plan-day-logging.md)
- [2026-11-02 — Planned versus done](plans/2026-11-02-planned-versus-done.md)
- [2026-11-03 — Plan-quality evals](plans/2026-11-03-plan-quality-evals.md)
- [2026-11-03 — Rule-based plans](plans/2026-11-03-rule-based-plans.md)
- [2026-11-05 — Per-set logging](plans/2026-11-05-per-set-logging.md)
- [2026-11-06 — Progress records, e1RM and weekly sets](plans/2026-11-06-progress-records.md)
- [2026-11-06 — Plans that adapt to your history](plans/2026-11-06-adaptive-progression.md)
- [2026-11-06 — Offline-ready PWA](plans/2026-11-06-offline-ready-pwa.md)
- [2026-11-08 — In-gym workout mode](plans/2026-11-08-in-gym-workout-mode.md)
- [2026-11-08 — Exercise swaps](plans/2026-11-08-exercise-swaps.md)
- [2026-11-12 — Strava import](plans/2026-11-12-strava-import.md)
- [2026-11-14 — Request body types from the zod schemas, D1 phase 2](plans/2026-11-14-api-body-types.md)

## Specs

- [2026-09-06 — Foundation hardening](specs/2026-09-06-foundation-hardening-design.md)
- [2026-09-14 — Editable profile](specs/2026-09-14-editable-profile-design.md)
- [2026-09-18 — Development roadmap](specs/2026-09-18-development-roadmap-design.md)
- [2026-09-23 — Repository layout reorganization](specs/2026-09-23-repo-layout-reorganization-design.md)
- [2026-09-29 — Code readability](specs/2026-09-29-code-readability-design.md)
- [2026-10-10 — Readability follow-up](specs/2026-10-10-readability-follow-up-design.md)
- [2026-11-02 — Production data growth](specs/2026-11-02-production-data-growth-design.md)
- [2026-11-02 — Decision records](specs/2026-11-02-decision-records-design.md)
- [2026-11-02 — Type checking through JSDoc](specs/2026-11-02-jsdoc-type-checking-design.md)
- [2026-11-02 — Structured plans](specs/2026-11-02-structured-plans-design.md)
- [2026-11-02 — Logging a workout against a plan day](specs/2026-11-02-plan-day-logging-design.md)
- [2026-11-02 — Planned versus done](specs/2026-11-02-planned-versus-done-design.md)
- [2026-11-03 — Plan-quality evals](specs/2026-11-03-plan-quality-evals-design.md)
- [2026-11-03 — Rule-based plans](specs/2026-11-03-rule-based-plans-design.md)
- [2026-11-03 — Rule-based plans, evidence review](specs/2026-11-03-rule-based-plans-evidence.md)
- [2026-11-05 — Per-set logging](specs/2026-11-05-per-set-logging-design.md)
- [2026-11-06 — Progress records, e1RM and weekly sets](specs/2026-11-06-progress-records-design.md)
- [2026-11-06 — Plans that adapt to your history](specs/2026-11-06-adaptive-progression-design.md)
- [2026-11-06 — Offline-ready PWA](specs/2026-11-06-offline-ready-pwa-design.md)
- [2026-11-08 — In-gym workout mode](specs/2026-11-08-in-gym-workout-mode-design.md)
- [2026-11-08 — Exercise swaps](specs/2026-11-08-exercise-swaps-design.md)
- [2026-11-12 — Strava import](specs/2026-11-12-strava-import-design.md)
- [2026-11-14 — Request body types from the zod schemas, D1 phase 2](specs/2026-11-14-api-body-types-design.md)
