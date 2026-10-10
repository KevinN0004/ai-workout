/**
 * Vite and Vitest config for the client, read by every script in
 * client/package.json: the dev and preview servers, the build, and the unit
 * suite with its coverage floors.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // ---- Dev server (npm run dev:client) -------------------------------------
  // /api goes to the Express server, so the client calls relative paths in
  // development exactly as it does in production, where one process serves
  // both the bundle and the API.
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000"
    }
  },

  // ---- Preview server (npm run preview, and the E2E suite) -----------------
  // `vite preview` does not inherit `server.proxy`. The E2E suite runs against
  // the built bundle rather than the dev server, so that it exercises the
  // artifact that actually ships -- which needs the same /api proxy.
  preview: {
    port: 4173,
    proxy: {
      "/api": "http://localhost:5000"
    }
  },

  // ---- Tests and coverage (npm run test -w client) -------------------------
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    // Suites may use describe / test / expect without importing them.
    globals: true,
    coverage: {
      provider: "v8",
      // Everything under src is measured. Only the tests and their setup are
      // excluded -- narrowing this further would report a better number rather
      // than a truer one.
      include: ["src/**"],
      exclude: ["**/*.test.{js,jsx}", "src/test/**"],
      reporter: ["text", "html"],
      // A ratchet, not a target: each floor is the measured value floored to
      // one decimal, so a green tree never fails and a real slip does. Raise
      // them when coverage rises; never lower them to make a build pass.
      // Re-measure with `npm run test:coverage -w client` before changing them.
      //
      // Aspirational values would block every PR from day one, which is how
      // coverage gates get deleted instead of met. Whole-percent floors would
      // let a sub-point gain evaporate without tripping anything.
      //
      // Floors this tight are safe only because the suite measures the same on
      // every run. A branch arm reached only on some weekdays, or only when a
      // race happens to resolve one way, makes coverage depend on the day and
      // the scheduler, and a floor one decimal below the measurement then fails
      // CI on the runs that miss it. So a test whose branches follow
      // `new Date()` pins the clock (`vi.setSystemTime`), and a race is staged
      // with deferred promises rather than left to the scheduler.
      //
      // How much a floor tolerates is whatever truncation leaves, and that can
      // be nothing: when a measurement sits just above its floor, one new
      // uncovered statement anywhere in src fails CI. Cover it; do not lower
      // the floor.
      thresholds: {
        statements: 98.7,
        branches: 93.7,
        functions: 98.7,
        lines: 99.3
      }
    }
  }
});
