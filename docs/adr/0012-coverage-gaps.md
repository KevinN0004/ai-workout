# 0012. Check that an uncovered arm can fire before testing it

Accepted. First recorded in `CLAUDE.md` on 2026-09-05 (`f40b5ed`); moved here on 2026-11-02.

## Decision

Coverage gaps are ranked by uncovered branches rather than by percentage, and an arm is
checked for reachability before a test is written for it. An arm that cannot fire is deleted
where it adds nothing, and kept where it is cheap insurance in rendering code.

## Background

Thin areas, worst first by uncovered statements: `index.js` (app bootstrap and
wiring) and `httpCacheService.js`. Nearly all of
what is still uncovered in `index.js` is the bootstrap the suite deliberately does
not run: the env preflight sits behind `NODE_ENV !== "test" && !VITEST`, so
it is verified by booting the server rather than by the unit suite, and
`startServer` is verified the same way.
**Its percentage went down when it got better**, which is worth knowing
before reading it as a regression: extracting `metricsService.js` and
`corsPolicy.js` removed covered statements, so the untestable bootstrap is
now a larger share of a smaller file. The same denominator effect took
`requestContext.js` from 84% to 79% branches while its statements went to
100%. Server totals rose across both moves. Judge this file by what is left
uncovered, not by its percentage.
Its CORS layer is now covered end to end (the own-origin rule with trust
proxy on, and the production fallback, in `corsPolicy.test.js`), and so is
every rate limiter — see `index.rateLimit.test.js`, which sets the limit
under test to 1 and the others far out of the way, because the limiters are
layered and the global `/api` one would otherwise answer first. `postgres.js` was the worst
at 53% and is now at 100% on every metric; its redaction of the database
password is the part that mattered, and the fallback for a URL too malformed
to parse had never been exercised.
For today's per-file figures, read `server/coverage/coverage-summary.json` after a
run with `--coverage.reporter=json-summary`; a figure written here goes stale with
the next merge.

On the client, rank by **uncovered branches** rather than by percentage —
that is what says where the untested behaviour actually is. Compute the ranking
from `client/coverage/coverage-summary.json` (`branches.total - branches.covered`
per file) rather than keeping one here: it changes with every merge.
**The two geometry files near the top of it, `outlineGeometry.js` and
`templateOutline.js`, are the same dead-defensive pattern**:
`outlineGeometry.js`'s uncovered arms are the `top || bottom || null`
fallbacks in `chooseYUpper`/`chooseXOuter` and friends, reachable only with
asymmetric anchor data that `geometry.js` never produces. They are
closure-scoped, so reaching them means driving the outer function with
hand-built anchor sets. Left alone deliberately: unlike the duplicated
profile guards, these are cheap insurance in rendering code where the worst
case is a slightly wrong silhouette, and deleting them would make the file
more fragile to change rather than less.
**This entry previously claimed "nothing is left above ten uncovered
branches" and listed `usePreviewDerivedData.js` among the files that were
done. Both were wrong** — it was the largest client gap at the time, and the
claim would have stopped the next reader looking. Re-measure before trusting
a ranking here; it goes stale every time anything lands.
`PreviewStage.jsx` (31), `PreviewDashboardChapter.jsx` (28),
`HomePage.jsx` (25), `DashboardPage.jsx` (23), `App.jsx` (20),
`CaloriesView.jsx` (16) and `AuthPage.jsx` (15) all used to head this
list and are done. `GeneratedPlanModal.jsx` (14) was there too, and was
deleted rather than tested, because nothing could open it.
**Much of what is left is not a missing test.** `usePreviewDerivedData.js`
went 46 → 34 by deleting branches rather than covering them: seven guards
re-applied `activePreviewProfile.X || JOHN_DOE_PREVIEW_PROFILE.X` to a value
that had already been through that exact guard 100 lines earlier, where the
profile is built. The else arms could not fire. Check whether an uncovered
arm is reachable at all before writing a test to reach it — and see
[0015](0015-mutation-testing.md) on two guards testing the same thing, for how to tell.
**`CaloriesView.jsx`'s two guards on `progressMetrics` used to disagree, and
the fix is worth copying.** The rows were guarded with `Array.isArray`, the
empty state beneath them with `?.length` — which a string satisfies — so a
non-array produced no rows _and_ suppressed the "No progress metrics logged
yet." line, leaving a blank panel with nothing to explain it. A third list
in the same file, `calories`, had no guard at all. Each list is now narrowed
once at the top of the component and both uses read that, so the two cannot
drift apart again; four mutation cases exist specifically to catch them
drifting back.
**A correction to how that was first reported.** PR #111 called the blank
panel "reachable only from a malformed cached dashboard". It is not
reachable at all: `useDashboardMetrics` narrows both lists with
`Array.isArray` before handing them over, and `buildDedupedList` narrows
again and returns an array it builds by pushing — so the props are
guaranteed arrays three times over, and `CaloriesView` has exactly one
caller. The inconsistency was real and worth removing; the user-visible
failure it implied was not. **Trace the producer before calling a guard's
disagreement reachable** — the guard may be the fourth in a chain.
`PreviewDashboardChapter.jsx` and `HomePage.jsx` reached 100% on every metric.
`DashboardPage.jsx`'s one remaining uncovered branch is unreachable, and so
is the `return null` under it: `activeDashView` is constrained to the eight
names in `DASH_VIEW_ORDER` by the line that computes it, and the router below
handles all eight, so it never falls past the last `if`.
**`App.jsx` carries a redundant pair worth knowing about.** The `useState`
initializers for `heightUnit` and `weightUnit` derive the visitor's units
from their locale, and `resetPersonalFlow` derives exactly the same thing
again from the same source. An effect calls `resetPersonalFlow()` whenever
the route is `/`, and `/` is the only route where those units are read at
all — they are passed to `HomePage` and nowhere else. So the initializers
are overwritten before anything observable, and inverting them changes no
test and no pixel. Verified by inverting the ternary by hand: the suite
stays green. If the two copies ever disagree, the effect's copy silently
wins. **Deliberately left alone.** Removing the initializers would leave
`heightUnit` and `weightUnit` undefined on the first render, before the
effect runs, and `HomePage` receives them on that render. The redundancy is
harmless; the alternative is a regression.
**Three files are off this list for good, and none of them is worth
revisiting.** Each was ranked high by uncovered branches and each turned out
to be unreachable rather than untested:

- `usePreviewDerivedData.js` (46) — double-guarded fallbacks, below.
- `outlineGeometry.js` (28) — its uncovered branches are null-guards inside
  module-private helpers (`toPoint`, `appendPoint`, and the four
  `chooseY`/`chooseX` pickers). Nothing exports them, and the anchor sets the
  one caller builds always supply the points they guard against.
- `templateOutline.js` (26) — one export, `buildTemplateOutline`, and
  everything else private. The remaining branches are
  `!Array.isArray(points) || points.length < 3` guards on private helpers,
  and the template is a **fixed SVG asset** with hundreds of points, so the
  single entry point cannot drive any of them.
  It used to contain genuinely dead code, now removed: `pointsToPath` was
  called from exactly one place, `buildCurvedPath`, whose guard was
  `if (!Array.isArray(points) || points.length < 3) return pointsToPath(points)`
  — character for character the same condition `pointsToPath` itself returned
  `""` for on its first line. It could only ever return `""`, so its
  path-building body and the `round3` helper that served it went with it; the
  guard now returns `""` directly.
  **`usePreviewDerivedData.js`'s largest group of uncovered branches cannot
  fire.** `activePreviewProfile` spreads `JOHN_DOE_PREVIEW_PROFILE` and then
  overrides every field with `personal.x || JOHN_DOE_PREVIEW_PROFILE.x`, so every
  field is non-empty for any input — including all-null. The `String(x ?? "")`
  block that builds `previewPersonalTargets`, what the personal chapter types,
  guards those same values again, and none of its fallbacks can fire. The
  invariant that makes them dead is pinned by a test, so if someone removes a
  guard from `activePreviewProfile` the suite says so. Its other uncovered arms
  were `||`, `?:` and `if` fallbacks on the derived week and dashboard figures,
  each guarding something the week plan's construction already guarantees (one
  entry per weekday, every field filled, at least five training days, the goal
  always met). Each was traced, proved dead by arithmetic and as a deliberate
  survivor on all seven weekdays, and deleted; the fifteen in the
  `String(x ?? "")` block are what is left.
  The locale block (`usesImperialUnits`) was the one genuinely reachable part, and it
  is now covered: `navigator.languages`, `navigator.language` and
  `Intl.DateTimeFormat` are all boundaries, stubbed exactly as
  `SettingsView.test.jsx` stubs them. It decides whether the whole walkthrough
  is shown in pounds and feet or kilograms and centimetres. Two notes from
  doing it, both of which cost a run:
- **`new Intl.DateTimeFormat()` needs a constructible stub.** An arrow
  function in `mockImplementation` throws when called with `new`, which
  lands silently in the surrounding `catch` — so every test passes, but via
  the error path rather than the branch it names. Use `function stubbed() {}`.
- **Every fallback in that chain ends at `"US"`.** A test whose locale
  resolves to US therefore cannot tell one fallback from the next, and six
  mutants survived because of it. Pin `navigator.languages[0]` and
  `navigator.language` to _different_ regions, and stub the ambient format
  to a metric one, so each step is distinguishable from the step after it.
  Done, and worth copying from: `SettingsView.jsx`, `WorkoutResultPage.jsx`,
  `MealView.jsx` (which took the five `meal/*` panels with it),
  `useHomeStageFlow.js`, `usePreviewChapterFlow.js`,
  `usePreviewWeekParticleAnimation.js`, `usePreviewDerivedData.js`,
  `WorkoutsView.jsx`, `TipsView.jsx`, `SummaryView.jsx`, `PlansView.jsx`,
  `useDashboardMetrics.js`, both preview chapter components, `App.jsx`,
  `DashboardPage.jsx`, `usePreviewWeekOutline.js`, `PlannerSetupModal.jsx`,
  `HomePersonalStage.jsx`, `useDashboardData.js`, `events.js`, `useBodyModel.js`,
  `DashboardAtAGlance.jsx`, `PreviewStage.jsx`, `PreviewDashboardChapter.jsx`,
  `HomePage.jsx`, `CaloriesView.jsx` and `AuthPage.jsx`.
  `PreviewStage.jsx` (then `PreviewPage.jsx`) had a chapter-body router whose final `else` arm no
  chapter id could reach: `usePreviewDerivedData` builds exactly
  `personal-info`, `generate`, `workout-week` and `dashboard-preview`, and
  the four arms above it handle all of them. That arm rendered a generic grid
  of textareas from `chapter.fields`, which is the only reason those arrays
  existed — every chapter built one and nothing read it. The arm, the arrays
  and the `getPreviewFieldRows` helper that sized their rows are all gone,
  which took the file from 94% / 65% to 97% / 87% by deletion rather than by
  testing. Its remaining uncovered branches are the `: null` the router now
  ends in, and two defensive guards that cannot fire
  (`!previewStageRef.current`, `!document.documentElement`).
  Removing them turned up something worth remembering. A test had been written
  asserting that the visitor's locale "reaches the fields the visitor actually
  reads", against `previewChapters[0].fields` — data nothing rendered.
  **Dead data invites tests that assert on it**, and such a test looks exactly
  like coverage of a real behaviour. That assertion now reads
  `previewFillOrder`, which is the sequence the typing animation walks.
  **There are no animation write-offs left.** All three hooks that were listed
  as untestable are now covered.
