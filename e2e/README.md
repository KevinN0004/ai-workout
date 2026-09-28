# e2e

Playwright suites: the only tests that run the client and the server together. Everything else tests one side of the wire. The client suite mocks `fetch` and the server suite drives Express with supertest, so a defect in the wiring between them passes both.

| Suite                | Tests | Covers                                                                                                                                                                        |
| -------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke.spec.js`      | 4     | Sign up, log a workout that survives a reload, change the password without being signed out, delete the account                                                               |
| `a11y.spec.js`       | 10    | axe scans that must find zero violations: login, signup, the dashboard, an open modal, keyboard-only modal dismissal, the settings forms and every state of the account panel |
| `deployable.spec.js` | 5     | The Express-served app: renders with no CSP violations, loads its fonts, reaches its own API, serves client routes while still 404ing unknown `/api` paths, caches correctly  |

## Running

The suites test the built bundle, so build first:

```bash
npm -w client run build
npm run test:e2e        # or npm run test:e2e:ui for Playwright's UI mode
```

`playwright.config.js` starts both servers itself: the API on 5000 and `vite preview` on 4173. It has two projects:

- **`chromium`** runs the smoke and accessibility suites against the preview origin.
- **`deployable`** points the browser at the Express origin instead. Only there are the real security headers and CSP in force; `vite preview` has neither.

## Things to know

- **Postgres must be running.** Each run creates its own accounts (`e2e-<timestamp>@example.test`, `a11y-<timestamp>@example.test`) and deletes them at the end. A run that fails midway leaves its account behind.
- **Do not set `NODE_ENV=test`** for the server it starts. The server then loads and exits with no output, which looks exactly like a crash.
- **Geolocation stays denied**, so the dashboard never calls the live weather and air-quality APIs. Plan generation is out of scope, because it needs a real Gemini key.
- **The server reads `server/.env`, including `REDIS_URL`.** To keep a shared Redis untouched, run with `REDIS_URL=` set in the shell. dotenv leaves a variable that is present but empty alone, so sessions stay in memory.

CI runs these suites in their own `E2E smoke` job, so a flaky browser run cannot muddy the unit signal. `CLAUDE.md` records how each suite was verified by mutation.
