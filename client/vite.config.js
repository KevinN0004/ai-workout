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
      reporter: ["text", "html"]
    }
  }
});
