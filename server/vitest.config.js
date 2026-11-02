/**
 * Vitest config for the server suite, read by `npm test` and
 * `npm run test:coverage` in the server workspace.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every suite shares one Postgres database and several call
    // `prisma.appUser.deleteMany({})` in beforeAll/beforeEach. Running test
    // files in parallel lets one suite truncate rows another is mid-request
    // on, which surfaced as intermittent 500s on dashboard write routes.
    // Serialize files so DB state stays owned by one suite at a time.
    fileParallelism: false,
    // Refuses to run against a non-local database. Suites truncate app_users
    // with no `where`, and every relation cascades, so a server/.env pointing
    // at staging or production would lose every account.
    // See the file for why it has no escape hatch.
    setupFiles: ["./vitest.setup.js"],
    coverage: {
      provider: "v8",
      // Everything under src is measured. Only the tests themselves and the
      // Prisma client output are excluded -- narrowing this further would
      // report a better number rather than a truer one.
      include: ["src/**"],
      exclude: ["**/*.test.js", "src/generated/**"],
      reporter: ["text", "html"],
      // A ratchet, not a target -- see the note in client/vite.config.js.
      // Measured 2026-10-29 (95.52 / 89.34 / 96.60 / 96.52), floored one
      // decimal below. Branches read higher in CI than locally (89.74 against
      // 89.34 on 2026-10-29), so the floor follows the local figure, the lower
      // of the two. Locally they also depend on whether client/dist exists: a
      // built client is served, so staticClient.js's no-bundle arm goes
      // unreached and branches read one branch lower. The floor follows that
      // lower reading too, because the gates build before they measure. One
      // decimal rather than whole percent, which would leave up to a point of
      // measured coverage free to slip without tripping anything.
      thresholds: {
        statements: 95.5,
        branches: 89.3,
        functions: 96.6,
        lines: 96.5
      }
    }
  }
});
