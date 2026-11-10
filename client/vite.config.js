/**
 * Vite and Vitest config for the client, read by every script in
 * client/package.json: the dev and preview servers, the build, and the unit
 * suite with its coverage floors.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // The installable shell (docs/specs/2026-11-06-offline-ready-pwa-design.md).
    // The worker precaches the build and answers navigations with index.html,
    // but never an /api path, and caches no API response: the page's
    // localStorage caches own the data. "prompt" leaves activating a new
    // worker to the visitor, through useWorkerUpdate's Reload.
    VitePWA({
      strategies: "generateSW",
      registerType: "prompt",
      // useWorkerUpdate registers the worker; nothing is injected into the page.
      injectRegister: false,
      // workbox.globPatterns already precaches every icon in public/icons, so
      // adding the manifest's icons again would list each one twice.
      includeManifestIcons: false,
      manifest: {
        name: "PATH | Personalized AI Training Hub",
        short_name: "PATH",
        start_url: "/dashboard",
        scope: "/",
        display: "standalone",
        // The page's own black (styles/base.css, body).
        theme_color: "#000000",
        background_color: "#000000",
        icons: [
          { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // The PDF export's chunks (jspdf and the three only it imports), about
        // 760 KiB a new install would otherwise download for a path most
        // sessions never take. Offline, the export reports that it could not
        // prepare the PDF.
        globIgnores: [
          "**/jspdf.es.min-*.js",
          "**/html2canvas-*.js",
          "**/purify.es-*.js",
          "**/index.es-*.js"
        ],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api(\/|$)/],
        cleanupOutdatedCaches: true
      }
    })
  ],

  // ---- Dev server (npm run dev:client) --------------------------------------
  // /api goes to the Express server, so the client calls relative paths in
  // development exactly as it does in production, where one process serves
  // both the bundle and the API.
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000"
    }
  },

  // ---- Preview server (npm run preview, and the E2E suite) ------------------
  // `vite preview` does not inherit `server.proxy`. The E2E suite runs against
  // the built bundle rather than the dev server, so that it exercises the
  // artifact that actually ships -- which needs the same /api proxy.
  preview: {
    port: 4173,
    proxy: {
      "/api": "http://localhost:5000"
    }
  },

  // ---- Tests and coverage (npm run test -w client) --------------------------
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
      //
      // Measured 2026-11-10 (99.23 / 95.70 / 99.43 / 99.66), after exercise
      // swaps (roadmap C4), the same locally and in CI.
      thresholds: {
        statements: 99.2,
        branches: 95.7,
        functions: 99.4,
        lines: 99.6
      }
    }
  }
});
