import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// vite-plugin-pwa's registration module exists only inside a Vite build or dev
// server, so Vitest cannot load it. Every suite gets this stand-in, with no
// new worker waiting; useWorkerUpdate's own test mocks it with its own.
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {}
  })
}));
