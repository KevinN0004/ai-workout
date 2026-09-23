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
      // them when coverage rises; never lower them to make a build pass. The
      // measured values and their dates are recorded in CLAUDE.md.
      //
      // Aspirational values would block every PR from day one, which is how
      // coverage gates get deleted instead of met. Whole percent was tried
      // first and let a sub-point gain evaporate without tripping anything;
      // these suites are deterministic -- no randomness, no timing-dependent
      // branches -- so a tenth of a point is a safe margin.
      thresholds: {
        statements: 98.6,
        branches: 93.6,
        functions: 98.7,
        lines: 99.3
      }
    }
  }
});
