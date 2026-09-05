import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useDashboardData from "./useDashboardData";

// 322 lines handling the dashboard's own data: cache hydration, the network
// load, and the error text the user actually sees. Untested until now, and the
// most user-facing of the remaining gaps -- a bug here is wrong data on screen
// rather than a wrong animation.

const CACHE_KEY = "dashboard:test-user";
const user = { id: "u-1", email: "a@b.com" };

const jsonResponse = (body, ok = true) => ({
  ok,
  json: async () => body
});

// Props are built once per render() call, not once per React render. setGoalForm
// is in the load effect's dependency array, so handing it a fresh vi.fn() on
// every render re-triggers the effect forever and each pass cancels the last --
// loading never clears and no error is ever recorded.
const render = (overrides = {}) => {
  const props = {
    user,
    isDashboardRoute: true,
    shouldLoadAmbientData: false,
    dashboardCacheKey: CACHE_KEY,
    weatherCacheKey: "",
    airCacheKey: "",
    setGoalForm: vi.fn(),
    ...overrides
  };
  return renderHook(() => useDashboardData(props));
};

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useDashboardData", () => {
  test("loads the dashboard on a dashboard route", async () => {
    const dashboard = { workouts: [{ id: "w1" }], goals: {} };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ dashboard })));

    const { result } = render();

    await waitFor(() => expect(result.current.dashboard).toEqual(dashboard));
    expect(result.current.dashError).toBe("");
  });

  test("does not fetch without a signed-in user", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ dashboard: {} }));
    vi.stubGlobal("fetch", fetchMock);

    render({ user: null });

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  test("does not fetch away from a dashboard route", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ dashboard: {} }));
    vi.stubGlobal("fetch", fetchMock);

    render({ isDashboardRoute: false });

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  test("clears loading once the request settles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ dashboard: { goals: {} } })));

    const { result } = render();

    await waitFor(() => expect(result.current.dashLoading).toBe(false));
  });

  describe("cache", () => {
    test("shows cached data before the network responds", async () => {
      const cached = { workouts: [{ id: "cached" }], goals: {} };
      window.localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ dashboard: cached, updatedAt: Date.now() })
      );
      // Never resolves, so only the cached value can be on screen.
      vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

      const { result } = render();

      await waitFor(() => expect(result.current.dashboard).toEqual(cached));
    });

    test("writes the loaded dashboard back to the cache", async () => {
      const dashboard = { workouts: [{ id: "fresh" }], goals: {} };
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ dashboard })));

      const { result } = render();

      await waitFor(() => expect(result.current.dashboard).toEqual(dashboard));
      const stored = JSON.parse(window.localStorage.getItem(CACHE_KEY));
      expect(stored.dashboard).toEqual(dashboard);
    });

    test("survives unparseable cached JSON", async () => {
      window.localStorage.setItem(CACHE_KEY, "{not json");
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ dashboard: { goals: {} } })));

      const { result } = render();

      await waitFor(() => expect(result.current.dashLoading).toBe(false));
      expect(result.current.dashError).toBe("");
    });
  });

  describe("errors", () => {
    // The distinction that matters: with cached data on screen, telling the
    // user "unable to load" would be wrong -- they are looking at something.
    test("says data is stale when a cached dashboard is showing", async () => {
      window.localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ dashboard: { workouts: [], goals: {} }, updatedAt: Date.now() })
      );
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "boom" }, false)));

      const { result } = render();

      await waitFor(() => expect(result.current.dashError).toMatch(/saved data/i));
    });

    test("surfaces the server's message when nothing is cached", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "server exploded" }, false)));

      const { result } = render();

      await waitFor(() => expect(result.current.dashError).toBe("server exploded"));
    });

    test("falls back to a generic message when the error body is unreadable", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          json: async () => {
            throw new Error("not json");
          }
        }))
      );

      const { result } = render();

      await waitFor(() => expect(result.current.dashError).toMatch(/unable to load dashboard/i));
    });

    test("reports a rejected request rather than hanging", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => {
        throw new Error("network down");
      }));

      const { result } = render();

      await waitFor(() => expect(result.current.dashError).toBe("network down"));
      expect(result.current.dashLoading).toBe(false);
    });
  });

  describe("clearDashboardDataState", () => {
    test("drops the dashboard and its error", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ dashboard: { goals: {} } })));

      const { result } = render();
      await waitFor(() => expect(result.current.dashboard).toBeTruthy());

      result.current.clearDashboardDataState();

      await waitFor(() => expect(result.current.dashboard).toBeNull());
      expect(result.current.dashError).toBe("");
    });
  });
});
