# e2e

Playwright suites: the only tests that run the client and the server together. Everything else tests one side of the wire. The client suite mocks `fetch` and the server suite drives Express with supertest, so a defect in the wiring between them passes both.

| Suite                | Covers                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke.spec.js`      | Sign up, log a workout that survives a reload, change the password without being signed out, delete the account                                                                                                                                                                                                                                           |
| `plan.spec.js`       | The planner's four steps generate a rule-built plan, which the plan hub shows, and a day of it is logged with its pre-filled sets, which survive a reload into Logs                                                                                                                                                                                       |
| `a11y.spec.js`       | axe scans that must find zero violations: login, signup, the dashboard, an open modal, keyboard-only modal dismissal, keyboard focus held inside an open modal and the menu drawer, each step of the planner and its link contrast, modal and drawer buttons the phone bottom bar must not cover, the settings forms and every state of the account panel |
| `deployable.spec.js` | The Express-served app: renders with no CSP violations, loads its fonts, reaches its own API, serves client routes while still 404ing unknown `/api` paths, caches correctly                                                                                                                                                                              |

`npx playwright test --list` lists every test, by project.

## Running

The suites test the built bundle, so build first:

```bash
npm -w client run build
npm run test:e2e        # or npm run test:e2e:ui for Playwright's UI mode
```

`playwright.config.js` starts both servers itself: the API on 5000 and `vite preview` on 4173. It has two projects:

- **`chromium`** runs the smoke, plan and accessibility suites against the preview origin.
- **`deployable`** points the browser at the Express origin instead. Only there are the real security headers and CSP in force; `vite preview` has neither.

## Things to know

- **Postgres must be running.** Each run creates its own accounts (`e2e-<timestamp>@example.test`, `plan-<timestamp>@example.test`, `a11y-<timestamp>@example.test`) and deletes them at the end. A run that fails midway leaves its account behind.
- **Do not set `NODE_ENV=test`** for the server it starts. The server then loads and exits with no output, which looks exactly like a crash.
- **Geolocation stays denied**, so the dashboard never calls the live weather and air-quality APIs. Plan generation needs no key: the rules build the plan and write its notes, and `playwright.config.js` sets `GEMINI_API_KEY` empty so a key in `server/.env` never reaches Gemini.
- **The server reads `server/.env`, including `REDIS_URL`.** To keep a shared Redis untouched, run with `REDIS_URL=` set in the shell. dotenv leaves a variable that is present but empty alone, so sessions stay in memory.

CI runs these suites in their own `E2E smoke` job, so a flaky browser run cannot muddy the unit signal. Decision records [0005](../docs/adr/0005-testing-across-the-wire.md) and [0006](../docs/adr/0006-accessibility-by-axe.md) record how each suite was verified by mutation.
