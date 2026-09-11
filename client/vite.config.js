import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000"
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    globals: true,
    coverage: {
      provider: "v8",
      // Everything under src is measured. Only the tests and their setup are
      // excluded -- narrowing this further would report a better number rather
      // than a truer one.
      include: ["src/**"],
      exclude: ["**/*.test.{js,jsx}", "src/test/**"],
      reporter: ["text", "html"],
      // A ratchet, not a target. These are the numbers this suite actually
      // produced on 2026-09-10, floored to whole percent -- so they never fail
      // a green tree, and they fail the moment coverage slips. Raise them when
      // coverage rises; never lower them to make a build pass.
      //
      // Aspirational values would block every PR from day one, which is how
      // coverage gates get deleted instead of met.
      // One decimal, floored from the measured value. These suites are
      // deterministic -- no randomness, no timing-dependent branches -- so a
      // tenth of a point is a safe margin, and whole percent would have let
      // this increment's gain evaporate without tripping anything.
      thresholds: {
        statements: 87.8,
        branches: 71.8,
        functions: 74.6,
        lines: 89.3
      }
    }
  }
});
