import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every suite shares one Postgres database and several call
    // `prisma.appUser.deleteMany({})` in beforeAll/beforeEach. Running test
    // files in parallel lets one suite truncate rows another is mid-request
    // on, which surfaced as intermittent 500s on dashboard write routes.
    // Serialize files so DB state stays owned by one suite at a time.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      // Everything under src is measured. Only the tests themselves and the
      // Prisma client output are excluded -- narrowing this further would
      // report a better number rather than a truer one.
      include: ["src/**"],
      exclude: ["**/*.test.js", "src/generated/**"],
      reporter: ["text", "html"],
      // A ratchet, not a target -- see the note in client/vite.config.js.
      // Measured 2026-09-13, floored one decimal below. Whole-percent floors
      // were used here until postgres.js went from 53% to 100%, a gain of over
      // a point on the totals that a whole-percent floor would have rounded
      // most of away.
      thresholds: {
        statements: 93.6,
        branches: 85.3,
        functions: 95.2,
        lines: 95.0
      }
    }
  }
});
