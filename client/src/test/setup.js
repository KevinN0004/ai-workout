import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { markAnswered } from "../app/connection";

// The connection store lives for a whole test file. A test whose request got
// no answer leaves it offline, so each test hands the next an online page.
afterEach(() => {
  markAnswered();
});

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
