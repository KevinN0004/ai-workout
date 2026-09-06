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
      reporter: ["text", "html"]
    }
  }
});
