# 0005. Test across the wire with contract tests and a small E2E suite

Accepted. First recorded in `CLAUDE.md` on 2026-09-17 (`6e1c368`); moved here on 2026-11-02.

## Decision

Client tests import server modules to assert the contract between the two sides. The
Playwright suite, the only thing that runs both halves together, stays tiny. It runs
against the built bundle, and its `deployable` project points a browser at the express
origin, the only one where the headers the server sets are visible.

## Background

**A client test can import server modules directly, and the contract tests do.** The
running app cannot reach across the wire, but Vitest can resolve a relative
`server/src/...` path from a client test, so a contract between the two sides can be
asserted without a browser or a database. `app/__tests__/constants.test.js` pins the
option lists against the server's `allowed*Values`, and
`app/__tests__/profileContract.test.js` walks a form draft through
`personalToProfile` → `profileBodySchema` → `buildProfile` → `profileToPersonal`
and back. Both were verified to catch divergence the owning side's own suite
misses: narrowing the server's height range to 100-170 makes a 178cm profile
store `null`, and the server's tests never try 178. A third,
`__tests__/serverBounds.contract.test.jsx`, renders every form that posts a number and
holds each input's range to the schema the server validates it with. Keep such imports
to test files — confirmed they do not reach the bundle.

**Otherwise the E2E suite is the only thing that runs both halves together.**
Everything else tests one side of the wire — the client suite mocks `fetch`, the
server suite drives express with supertest — so a defect in the wiring between
them passes both. It is deliberately tiny: sign up, log a workout, reload, confirm it
survived. Five things are worth knowing before touching it:

- **It runs against the built bundle** via `vite preview` on 4173, not the dev
  server, so `npm -w client run build` has to happen first. `vite preview` does
  not inherit `server.proxy`, which is why `client/vite.config.js` carries a
  separate `preview.proxy`.
- **There are two projects, and the split is load-bearing.** `vite preview` is
  the shipped _bundle_ but not the shipped _server_: it has no helmet, so no
  response header express sets is visible through it, and it proxies only
  `/api`. So the `deployable` project points a browser at the express origin
  (5000) instead, which is what actually deploys; everything else runs under
  `chromium` against the preview origin. The server's `CLIENT_ORIGIN` names only
  the preview origin, so the `deployable` project also proves that `corsPolicy.js`
  allows the server's own origin without it being listed. Adding 5000 back to that
  list would pass every test and remove the proof. Its server is not production,
  so the own origin counts only because `localhost:5000` is loopback: outside
  production a non-loopback own origin is refused, which shuts out DNS rebinding.

  This exists because its absence shipped a blank page. `default-src 'none'`
  was correct while the process served JSON only; once `staticClient.js` began
  serving the SPA, the CSP blocked the bundle's own script and stylesheet.
  **Every check passed** — `/api/ready` answered 200, and the CI container job
  smoke-tests the deployable with `curl | grep 'id="root"'`, which cannot
  enforce CSP. Only a browser on that origin can see it.

  Mutation-tested rather than trusted: reverting `script-src` is caught by
  three of its five tests, dropping `font-src` by exactly one, and each caching
  mutation by exactly one. `server/src/__tests__/index.securityHeaders.test.js` is the
  cheap companion guard, but a well-formed header can still be wrong — the
  browser project is the one that proves the page runs.

  Since the offline-ready PWA (roadmap C1), the built bundle carries a service
  worker, and `vite preview` serves it too. The `chromium` project sets
  `serviceWorkers: "block"`, so its specs keep every request on the network,
  where they and `page.route` see it. The worker's specs run in `deployable`,
  the only project whose CSP has to allow the manifest: the worker installs and
  controls the page, the manifest is served as one, an `/api` navigation still
  reaches the server, and a reload with the context offline is answered from
  the worker's cache. `context.setOffline` does cut the page's network there:
  a fetch the worker does not answer fails. Removing `/api` from the worker's
  `navigateFallbackDenylist` is caught by the `/api` test. Switching
  `registerType` to `"autoUpdate"` is caught by nothing: only a second deploy
  under an open page shows it, which the suite cannot stage.

  `offline.spec.js` runs in `deployable` too, because its reload with no
  network is answered by the worker. It logs a workout offline, sees it kept
  as not sent yet, reloads with no network, and reconnects; the workout
  reaches the server exactly once, counted in the Logs view's workout list,
  because the dashboard's glance line names the latest workout as well.

- **Do not set `NODE_ENV=test` for the server it starts.** `index.js` guards its
  `startServer()` call with `NODE_ENV !== "test" && !VITEST` so the unit suite
  can import `app` without binding a port. Set it and the process loads, exports,
  and exits 0 with no output at all — which reads exactly like a crash.
- **Geolocation is left denied**, so the dashboard takes its own "location
  unavailable" path instead of reaching the live weather and air-quality
  upstreams. Plan generation was out of scope while it needed a real Gemini
  key. Since rule-based plans (#329 to #336) it needs none, and `plan.spec.js`
  covers it: `playwright.config.js` sets `GEMINI_API_KEY` empty, so a key in
  `server/.env` never reaches Gemini and the notes are the rule-written ones.
  Its account is `plan-<timestamp>@example.test`, deleted in `afterAll`.
  `session.spec.js` (roadmap B6) generates the same plan to start a day of it
  as an in-gym session; its account is `session-<timestamp>@example.test`,
  deleted in `afterAll` too.
- **Each run creates an account** (`e2e-<timestamp>@example.test`) and now
  deletes it before the file ends. `smoke.spec.js` deletes it as its last
  test, the thing under test; `a11y.spec.js` deletes its own account
  (`a11y-<timestamp>@example.test`) in `afterAll` instead, because its two
  account scans stop at the delete confirmation reveal so axe can see that
  state, rather than submitting it. A run that fails before reaching that
  step still leaves the row behind — harmless in CI, but it accumulates in a
  local database.

It has its own CI job rather than living in `test`, so a flaky browser run
cannot muddy the unit signal. It was verified by mutation rather than trusted:
removing the client's CSRF header, and making the workout route answer 200
without writing, are both caught — and both pass every other suite in the repo.
