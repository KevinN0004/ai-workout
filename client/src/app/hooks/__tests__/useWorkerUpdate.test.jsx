/**
 * Pins useWorkerUpdate against the plugin's registration module, mocked at its
 * boundary: `ready` follows the module's needRefresh, and `reload` activates
 * the waiting worker and reloads.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const plugin = vi.hoisted(() => ({ needRefresh: false, updateServiceWorker: null }));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [plugin.needRefresh, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: plugin.updateServiceWorker
  })
}));

import useWorkerUpdate from "../useWorkerUpdate";

describe("useWorkerUpdate", () => {
  beforeEach(() => {
    plugin.needRefresh = false;
    plugin.updateServiceWorker = vi.fn(async () => {});
  });

  test("is not ready while no new worker is waiting", () => {
    const { result } = renderHook(() => useWorkerUpdate());

    expect(result.current.ready).toBe(false);
  });

  test("is ready once a new worker is waiting", () => {
    plugin.needRefresh = true;
    const { result } = renderHook(() => useWorkerUpdate());

    expect(result.current.ready).toBe(true);
  });

  test("reload activates the waiting worker and reloads the page", () => {
    plugin.needRefresh = true;
    const { result } = renderHook(() => useWorkerUpdate());

    result.current.reload();

    expect(plugin.updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
