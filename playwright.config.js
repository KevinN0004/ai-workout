import { defineConfig, devices } from "@playwright/test";

// End-to-end smoke coverage. Everything else in this repo tests one side of the
// wire: the client suite mocks fetch, the server suite drives express with
// supertest. Neither sees the wiring between them -- the CSRF token round trip,
// the session cookie, the Vite proxy, or whether a write is actually readable
// afterwards. That is the whole point of this suite, so it stays small.
//
// It runs against the built bundle via `vite preview`, not the dev server, so a
// failure that only appears in the shipped artifact is in scope.

const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

// The express origin. `vite preview` above is the shipped bundle; this is the
// shipped *server*, which serves that same bundle itself in production. The
// two differ in every response header, so the deployable project needs its own
// base URL rather than the proxy's.
const SERVER_PORT = 5000;
const serverURL = `http://localhost:${SERVER_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // These share one database and one account namespace, so they run in order.
  fullyParallel: false,
  workers: 1,
  // A smoke suite that needs retries to pass is telling you something, but a
  // single CI retry keeps an infrastructure hiccup from blocking a merge.
  retries: process.env.CI ? 1 : 0,
  // Fail the run rather than pass silently if someone leaves a .only behind.
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL,
    trace: "on-first-retry",
    // Geolocation is left denied on purpose. The dashboard asks for coordinates
    // to fetch weather and air quality; denying it keeps the suite off two live
    // upstreams and exercises the app's own "location unavailable" path.
    permissions: []
  },

  // Chromium only. This suite checks wiring, not rendering, so a browser matrix
  // would triple the CI time for very little extra signal. Add one if a
  // browser-specific defect ever actually shows up.
  //
  // Two projects, because they point at two different origins. Everything
  // except deployable.spec.js runs against `vite preview`, which is the
  // shipped bundle but NOT the shipped server -- preview has no helmet, so a
  // response header set by express is invisible to it. `deployable` closes
  // that by pointing a browser at the express origin, which is the thing
  // actually deployed. See e2e/deployable.spec.js.
  projects: [
    {
      name: "chromium",
      testIgnore: /deployable\.spec\.js/,
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "deployable",
      testMatch: /deployable\.spec\.js/,
      use: { ...devices["Desktop Chrome"], baseURL: serverURL }
    }
  ],

  webServer: [
    {
      command: "npm run start -w server",
      url: `${serverURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        // Deliberately NOT NODE_ENV=test. index.js guards its `startServer()`
        // call with `NODE_ENV !== "test" && !VITEST` so the unit suite can
        // import `app` without binding a port -- set it here and the process
        // loads, exports, and exits 0 with no output at all.
        //
        // Without it the env preflight runs, which is the point: it needs
        // DATABASE_URL, and `npm run -w server` is what puts the CWD in
        // server/ so dotenv finds server/.env.
        PORT: String(SERVER_PORT),
        // Both origins: the chromium project reaches the API through the
        // preview proxy, so the server sees no cross-origin request from it,
        // but the deployable project talks to the server directly and its
        // origin has to be allowed. CORS itself is covered by
        // index.cors.test.js.
        CLIENT_ORIGIN: `${baseURL},${serverURL}`,
        LOG_LEVEL: "warn"
      }
    },
    {
      command: "npm run preview -w client",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    }
  ]
});
