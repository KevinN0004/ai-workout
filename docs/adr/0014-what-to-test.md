# 0014. Choose what to test by what it computes and what it risks

Accepted. First recorded in `CLAUDE.md` on 2026-09-05 (`f40b5ed`); moved here on 2026-11-02.

## Decision

A test stubs only the boundary, such as the database, the session store or the network,
and uses the real function everywhere else. A component is judged by whether it computes
anything, not by its suffix, and what to test next is picked by risk, not by size. A
function stubbed at every call site gets a test of its own.

## Background

**A function being stubbed is not a function being tested.** `openAqRequest`
was 79 lines that never executed once — 53 uncovered branches, the largest
single gap on the server — because `airQualityRoutes.test.js` stubs it as its
network boundary. Stubbing it at every call site is what made it invisible:
the routes above it were at 100%, so nothing in the coverage table pointed
here. It is the request layer for the surface where the null-pm2.5-as-AQI-0
bug shipped. It is now covered in `externalRequests.test.js`, alongside the wger
and MealDB wrappers.
When a test stubs a named function of this repo's own, check whether anything
else exercises it.

**Prefer logic to markup — but a `*View.jsx` is not automatically markup.**
`units.js`, `app/plans.js`, `tips/recommendationUtils.js`, `useOptimisticLogs.js`,
`useApiClient.js` and `app/events.js` are all well covered — pure functions,
state machines, the request layer and every user action. That part holds.
What did **not** hold is the corollary `CLAUDE.md` used to draw, that a view
component is therefore more lines for less risk. Five of them were tested in
2026-09 and each carried real derivation the rest of the tree does not:
`SettingsView` infers the measurement system from the visitor's locale (0% → 89%),
`WorkoutResultPage` transposes the plan table and derives every row label from the
line text (0% → 100% statements, 97% branches), `MealView` picks the recommendation
track from the goal text and the portion note from the calorie band, and took its
five `meal/*` panels with it (0% → 100%), `TipsView` owns two fetches and a
debounced search (0% → 44% branches), `PlansView` owns the saved-exercise paging
(0% → 42%). Judge a component by whether it _computes_ anything, not by its suffix.
A genuinely presentational view really is low value; these five were not.

**The auth path and the external routes are now covered**, and are the worked
examples to copy: `authUserService.js`, `authRoutes.js` and `errorHandler.js`, and
the weather and air-quality routes end to end.
Both suites stub only the boundary — the database, session store and cookie
writers for auth; `fetchOpenMeteo` and `openAqRequest` for the external routes —
and use the real injected function everywhere else, so password hashing is real
argon2 and the AQI maths under test are the ones that ship.

**Pick by risk, not by size.** `middleware/errorHandler.js` was 33 lines at 15% with
0% branch, and it is what masks 5xx detail before it reaches a client.
`registerWgerRoutes.js` is five times the size and a read-only proxy of public
exercise data — it is bottom of this list for a reason.
