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
      // Measured 2026-09-28 (94.32 / 86.67 / 95.47 / 95.67), floored one
      // decimal below. Branches read 87.10 in CI and 86.67 locally, so the
      // floor follows the lower of the two. One decimal rather than whole
      // percent, which would leave up to a point of measured coverage free to
      // slip without tripping anything.
      thresholds: {
        statements: 94.3,
        branches: 86.6,
        functions: 95.4,
        lines: 95.6
      }
    }
  }
});
