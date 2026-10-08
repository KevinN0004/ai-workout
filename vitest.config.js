/**
 * The root Vitest project covers the test files under scripts/ only; `npm test`
 * runs it first, as `test:scripts`. The workspaces have their own configs:
 * client/vite.config.js and server/vitest.config.js.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Matched by filename, so tests in scripts/__tests__/ are found without
    // naming the folder.
    include: ["scripts/**/*.test.mjs"],
    // Tooling scripts run under Node, never in a browser.
    environment: "node"
  }
});
