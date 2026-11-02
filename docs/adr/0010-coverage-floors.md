# 0010. Ratchet the coverage floors from exact measurements, once per phase

Accepted. First recorded in `CLAUDE.md` on 2026-09-05 (`3d8e7ac`); moved here on 2026-11-02.

## Decision

Each side's floors are its measured figures truncated to one decimal, recorded in a dated
note beside them, and `scripts/__tests__/repo-invariants.test.mjs` checks the two agree.
One floor PR per side raises them once per phase, from a re-measured `main`; a fix PR leaves
them alone, and a floor is never lowered.

## Background

**Coverage is measured, not estimated.** `npm run test:coverage`. The current figures
are in the comment above `thresholds` in each side's config, `client/vite.config.js`
and `server/vitest.config.js`
(`Measured <date> (statements / branches / functions / lines)`), and each floor is its
figure truncated to one decimal;
`scripts/__tests__/repo-invariants.test.mjs` fails when a floor and its note disagree.
For exact counts, add `--coverage.reporter=json-summary` and read
`<side>/coverage/coverage-summary.json`: the text table's two decimals are too coarse
when a metric sits a fraction above its floor, and a metric passes exactly when
`covered >= floor / 100 × total`.
**Floors are raised once per phase of work, by one floor PR per side.** A fix PR keeps
coverage at or above the floors and leaves the floor lines alone. The floor PR
re-measures `main`, raises each floor whose truncated measurement went up, and updates
the note beside it; a floor is never lowered
(`docs/specs/2026-10-10-readability-follow-up-design.md`, rule 3).
**Two things move a measurement with no code changing.** Server branches read higher
in CI than locally, so the server floor follows the local figure. And with
`client/dist` present, `index.js` serves the bundle, so `staticClient.js`'s no-bundle
arm goes unreached and server branches read one lower; the gates build before they
measure, so measure a server floor with a build on disk. The server config's note
records both.
On 2026-09-22 the client's branch figure read 93.62%, **down** 0.02 from the reading
before it, and the ratchet correctly did not trip, which is the floor doing its job
rather than failing at it: it sits one decimal below the measurement, so a
rounding-scale movement is tolerated while a real regression is not. Do not "fix" a
small dip by raising the floor to meet it. That dip was never explained, though, and
it was measured on a Tuesday (`a4097dd`), when the weekday-dependent branch in
[0011](0011-tests-control-their-environment.md) went uncovered. One arm is about 0.03 points, which the truncated report
can show as 0.02, so it may have been that rather than rounding. Nobody re-measured it.
How much a floor tolerates is whatever truncation leaves, and that can be nothing:
when the slack, `covered - floor / 100 × total`, is under one, a single new uncovered
statement, branch or function can fail CI.
Both configs measure all of `src/**` and exclude only the tests themselves, because a
narrower `include` reports a better number rather than a truer one.
**Both sides carry a ratchet**, floored one decimal below the measured value — the
client's in `client/vite.config.js`, the server's in `server/vitest.config.js`. Raise
them when coverage rises; never lower them to make a build pass. Whole-percent floors
were tried first and let a sub-point gain evaporate without tripping anything.
**This entry used to name only the client's**, and the omission cost a CI cycle: a
change was verified with `npm test`, which runs no coverage at all, while CI runs
`test:coverage` and tripped the server floor on lines, functions and statements. Run
`npm run test:coverage`, not `npm test`, before claiming a change is ready.

Do not infer coverage from whether a file has a neighbouring `*.test.js`. The
repositories have few tests of their own (three files for ten modules) and are well
covered anyway, because the dashboard integration suites drive them.
