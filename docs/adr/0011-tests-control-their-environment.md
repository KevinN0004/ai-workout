# 0011. Tests control their own clock, zone and environment

Accepted. First recorded in `CLAUDE.md` on 2026-09-11 (`c8c867e`); moved here on 2026-11-02.

## Decision

A test whose branches follow the date pins the clock, and a race is staged with deferred
promises. A zone is set inside the process, through `process.env.TZ`. An environment
variable a test clears is set to `""` rather than deleted, because dotenv refills an absent
key on re-import.

## Background

**A coverage figure that changes between runs of identical code is a test bug.**
Until #178 the client's did, from two sources. The next-session walk in
`usePreviewDerivedData.js` reached its rest-day arm only when the real tomorrow was
a rest day, which never happened on a Tuesday or a Sunday. The dashboard loader's
superseded-failure guards (two arms) were reached only when timing lined up, in
roughly one full run in six. It took both misses at once to fail: 3171 of 3388
branches is 93.59%, under the 93.6% floor, which is what CI hit on a Tuesday.
Either one alone stayed above it. Both now have tests, and a sweep of nine dates and
times measures identical coverage, which is what the tight floors in
`client/vite.config.js` rely on. A `TZ` set in the shell does not reach Node here
(see the `TZ` entry below), but the date can be moved: a `NODE_OPTIONS=--import`
preload that shifts `Date` reaches Vitest's workers, and diffing the per-arm JSON
across such a sweep is what found both. Pin the clock in any test whose branches
follow `new Date()`; stage a race
with deferred promises.

**Re-importing a server module does not give you a clean environment.**
`index.js` and `prisma.js` both call `dotenv.config()` at module scope, and
dotenv fills in any key that is _absent_ from `process.env`. So
`delete process.env.CLIENT_ORIGIN` followed by `vi.resetModules()` and a
re-import hands the app whatever the environment file says, not the empty
value the test asked for. This is silent: the CORS suite's "no allowlist
configured" cases were really testing the file's allowlist, and only looked
wrong because `http://localhost:5173` happened to be in it while
`http://127.0.0.1:4173` was not. **Set the variable to an empty string
instead of deleting it** — a present-but-empty key is one dotenv leaves
alone. Restoring afterwards has the mirror-image trap: assigning `undefined`
back to `process.env` stores the string `"undefined"`, so a key that was
absent has to be deleted rather than assigned.
Re-importing is otherwise safe here: `index.js` exports `startServer` rather
than calling it, and `prisma.js` caches its client on `globalThis` outside
production, so no second database client is created.

**A `TZ` set in the shell does not reach Node on this machine; one set inside the
process does.** `TZ=Asia/Tokyo node -e 'console.log(process.env.TZ)'` prints
`undefined` here, inline or exported, and the process keeps the system
zone. A suite re-run under several shell `TZ` values therefore proves nothing —
it is the same zone every time, and the passes are not independent. This
has already produced a false claim in a merged PR description.
Assigning `process.env.TZ` inside the test does work, at once: the hour of
`new Date(0)` reads 9 under `Asia/Tokyo` and 0 under `UTC`. `DashboardPage.test.jsx`
and `MealView.test.jsx` pin a calendar-date test to a zone that way. **Restore it by
assigning the zone captured at load**,
`Intl.DateTimeFormat().resolvedOptions().timeZone`, **not with `delete`**: deleting
it leaves Node on UTC, not on the system zone — the opposite of the dotenv entry
above, where an absent key is deleted.
Beyond that: the system zone (UTC-7) locally and **UTC in
CI** sit on opposite sides of the boundary that matters, so a test
that passes in both is genuinely exercised either side of midnight.
Beyond that, reason arithmetically rather than by running: `new Date("Y-M-D")`
is UTC midnight and `new Date(y, m, d)` is local midnight, and the signed
difference between them **is** the offset — which settles which side of a
comparison every zone falls on without needing to be in one.
