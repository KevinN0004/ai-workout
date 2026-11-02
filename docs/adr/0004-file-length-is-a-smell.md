# 0004. Split a file for a second reason to change, not for its length

Accepted. First recorded in `CLAUDE.md` on 2026-09-13 (`a409770`); moved here on 2026-11-02.

## Decision

File length is a smell, not a limit, and nothing enforces one. A file is split when it
grows a second unrelated reason to change, or when something worth testing can only be
reached by booting the whole app. A long file that is one exported thing plus its private
helpers stays whole.

## Background

**File length is a smell, not a limit.** `CLAUDE.md` used to say "keep files under
500 lines". That rule arrived with the initial Claude config in `eb165c7`, whose
message says the setup was ported from another repo — it was never a decision
about this codebase. Nine files broke it, nothing enforced it, and adding
`max-lines` would contradict the ESLint policy in `CLAUDE.md`, which is deliberately
scoped to defect classes rather than style.

What matters is how many _things_ a file is, not how long it is. Eight of those
nine are one exported thing plus its private helpers: `templateOutline.js` has a
single export, `buildTemplateOutline`, and `externalDataService.js` and `events.js` are
closure factories. Splitting those means exporting internals to satisfy a line
count, which trades real encapsulation for a number. **Leave them.**

`index.js` was the exception — genuinely several things — and it was split for
that reason rather than for its length, which is why the pieces that came out
(`services/platform/metricsService.js`, `corsPolicy.js`) are cohesive rather than
arbitrary. It is still the largest server file and still over 500 lines. That is
fine; it is the app bootstrap, and the remainder is wiring that belongs together.

Reach for a split when a file grows a second unrelated reason to change, or when
something worth testing can only be reached by booting the whole app. Both were
true of the metrics helpers: they were the last uncovered statements in
`index.js` precisely because they were module-scope privates, and the identical
`recordLatency` in `middleware/requestContext.js` was a second copy of one of
them. Extracting fixed the coverage and the duplication together.
