import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useDashboardData from "../useDashboardData";

// 322 lines handling the dashboard's own data: cache hydration, the network
// load, and the error text the user actually sees. Untested until now, and the
// most user-facing of the remaining gaps -- a bug here is wrong data on screen
// rather than a wrong animation.

const CACHE_KEY = "dashboard:test-user";
const WEATHER_KEY = "weather:test-user";
const AIR_KEY = "air:test-user";
const user = { id: "u-1", email: "a@b.com" };
// Stable across rerenders: setGoalForm is in the load effect deps, so a fresh
// vi.fn() each render would re-trigger it forever.
const setGoalForm = vi.fn();

// The ambient loads go through navigator.geolocation before they can request
// anything, so most of the failure modes are reached from here rather than
// from fetch. Resolving and rejecting are both callback-style.
const stubGeolocation = ({
  position = { coords: { latitude: 40.1, longitude: -75.2 } },
  error
} = {}) => {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (onSuccess, onError) => {
        if (error) onError(error);
        else onSuccess(position);
      }
    }
  });
};

const jsonResponse = (body, ok = true) => ({
  ok,
  json: async () => body
});

// A response the test releases by hand, so two overlapping requests can be
// made to answer in whichever order the test is about.
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ dashboard }))
    );

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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ dashboard: { goals: {} } }))
    );

    const { result } = render();

    await waitFor(() => expect(result.current.dashLoading).toBe(false));
  });

  test("a superseded failure neither reports nor ends the newer load", async () => {
    // The loader is an effect, so it is superseded by a change of key --
    // switching accounts, say -- rather than by a second call. The old request
    // fails while the new one is still in flight: the catch guard keeps its
    // error off the screen, and the finally guard keeps it from clearing a
    // loading flag that now belongs to the new request. Before this test those
    // guards were reached only when timing happened to line up, which made
    // client coverage vary between runs of the same code.
    const gates = [deferred(), deferred()];
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const gate = gates[Math.min(call, 1)];
        call += 1;
        return gate.promise;
      })
    );
    const props = (dashboardCacheKey) => ({
      user,
      isDashboardRoute: true,
      shouldLoadAmbientData: false,
      dashboardCacheKey,
      weatherCacheKey: "",
      airCacheKey: "",
      setGoalForm
    });
    const { result, rerender } = renderHook((p) => useDashboardData(p), {
      initialProps: props("dashboard:first-account")
    });
    rerender(props("dashboard:second-account"));
    await waitFor(() => expect(call).toBe(2));

    await act(async () => {
      gates[0].resolve(jsonResponse({ error: "Stale failure." }, false));
    });
    expect(result.current.dashError).toBe("");
    expect(result.current.dashLoading).toBe(true);

    await act(async () => {
      gates[1].resolve(jsonResponse({ dashboard: { marker: "second" } }));
    });
    await waitFor(() => expect(result.current.dashLoading).toBe(false));
    expect(result.current.dashboard.marker).toBe("second");
    expect(result.current.dashError).toBe("");
  });

  describe("cache", () => {
    test("shows cached data before the network responds", async () => {
      const cached = { workouts: [{ id: "cached" }], goals: {} };
      window.localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ dashboard: cached, updatedAt: Date.now() })
      );
      // Never resolves, so only the cached value can be on screen.
      vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise(() => {}))
      );

      const { result } = render();

      await waitFor(() => expect(result.current.dashboard).toEqual(cached));
    });

    test("writes the loaded dashboard back to the cache", async () => {
      const dashboard = { workouts: [{ id: "fresh" }], goals: {} };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ dashboard }))
      );

      const { result } = render();

      await waitFor(() => expect(result.current.dashboard).toEqual(dashboard));
      const stored = JSON.parse(window.localStorage.getItem(CACHE_KEY));
      expect(stored.dashboard).toEqual(dashboard);
    });

    test("survives unparseable cached JSON", async () => {
      window.localStorage.setItem(CACHE_KEY, "{not json");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ dashboard: { goals: {} } }))
      );

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
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ error: "boom" }, false))
      );

      const { result } = render();

      await waitFor(() => expect(result.current.dashError).toMatch(/saved data/i));
    });

    test("surfaces the server's message when nothing is cached", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ error: "server exploded" }, false))
      );

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
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("network down");
        })
      );

      const { result } = render();

      await waitFor(() => expect(result.current.dashError).toBe("network down"));
      expect(result.current.dashLoading).toBe(false);
    });
  });

  describe("clearDashboardDataState", () => {
    test("drops the dashboard and its error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ dashboard: { goals: {} } }))
      );

      const { result } = render();
      await waitFor(() => expect(result.current.dashboard).toBeTruthy());

      result.current.clearDashboardDataState();

      await waitFor(() => expect(result.current.dashboard).toBeNull());
      expect(result.current.dashError).toBe("");
    });

    test("drops the ambient data too", async () => {
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ recommendation: {} }))
      );
      const { result } = render({ weatherCacheKey: WEATHER_KEY });

      await act(async () => result.current.loadWeatherRecommendation());
      await waitFor(() => expect(result.current.weatherData).toBeTruthy());

      act(() => result.current.clearDashboardDataState());

      await waitFor(() => expect(result.current.weatherData).toBeNull());
      expect(result.current.weatherLastUpdatedAt).toBeNull();
      expect(result.current.weatherError).toBe("");
      expect(result.current.airQualityData).toBeNull();
    });
  });
});

// The weather and air-quality half of the hook, which was the uncovered part.
// Both go through the browser's geolocation before they can ask the server, so
// most of what can go wrong happens before the request does.
describe("ambient data", () => {
  const geoError = (code) => ({ code, message: `geo ${code}` });

  const ambient = (overrides = {}) =>
    render({ weatherCacheKey: WEATHER_KEY, airCacheKey: AIR_KEY, ...overrides });

  describe("locating the user", () => {
    test("asks the server for the coordinates it was given", async () => {
      stubGeolocation();
      const fetchMock = vi.fn(async () => jsonResponse({ recommendation: {} }));
      vi.stubGlobal("fetch", fetchMock);
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      const url = fetchMock.mock.calls.find(([u]) => u.includes("/api/weather"))[0];
      expect(url).toContain("latitude=40.1");
      expect(url).toContain("longitude=-75.2");
    });

    // The browser reports why it refused, and each reason means something
    // different to a user: one is fixable in settings, one is not.
    test.each([
      [1, /permission was denied/i],
      [2, /unavailable/i],
      [3, /timed out/i],
      [99, /unable to access location/i]
    ])("turns geolocation error code %i into its own message", async (code, pattern) => {
      stubGeolocation({ error: geoError(code) });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({}))
      );
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      await waitFor(() => expect(result.current.weatherError).toMatch(pattern));
    });

    test("says so when the browser has no geolocation at all", async () => {
      vi.stubGlobal("navigator", {});
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({}))
      );
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      await waitFor(() => expect(result.current.weatherError).toMatch(/not available/i));
    });

    test("rejects coordinates that are not numbers", async () => {
      stubGeolocation({ position: { coords: { latitude: "north", longitude: null } } });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({}))
      );
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      await waitFor(() =>
        expect(result.current.weatherError).toMatch(/determine location coordinates/i)
      );
    });

    test("does not call the server when locating fails", async () => {
      stubGeolocation({ error: geoError(1) });
      const fetchMock = vi.fn(async () => jsonResponse({}));
      vi.stubGlobal("fetch", fetchMock);
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      expect(fetchMock.mock.calls.filter(([u]) => u.includes("/api/weather"))).toHaveLength(0);
    });
  });

  describe("loading weather", () => {
    test("stores the recommendation and stamps when it arrived", async () => {
      stubGeolocation();
      const recommendation = { workoutType: "outdoor" };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ recommendation }))
      );
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      await waitFor(() => expect(result.current.weatherData).toEqual({ recommendation }));
      expect(typeof result.current.weatherLastUpdatedAt).toBe("number");
    });

    test("writes it to the cache for the next visit", async () => {
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ recommendation: {} }))
      );
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      await waitFor(() => expect(result.current.weatherData).toBeTruthy());
      const stored = JSON.parse(window.localStorage.getItem(WEATHER_KEY));
      expect(stored.data).toEqual({ recommendation: {} });
    });

    test("clears the loading flag when it settles", async () => {
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({}))
      );
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      await waitFor(() => expect(result.current.weatherLoading).toBe(false));
    });

    test("surfaces the server's message when the request is refused", async () => {
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ error: "Upstream is down." }, false))
      );
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      await waitFor(() => expect(result.current.weatherError).toBe("Upstream is down."));
    });

    // Once something is on screen, "unable to load" would be wrong -- the user
    // is looking at a real, if older, reading.
    // The hook also loads /api/dashboard, so a call-ordered mock hands the
    // first response to whichever request happens to go first. Keyed on the
    // url instead.
    test("says the reading is stale rather than missing when it already has one", async () => {
      stubGeolocation();
      let weatherFails = false;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) => {
          if (!String(url).includes("/api/weather")) return jsonResponse({ dashboard: {} });
          return weatherFails
            ? jsonResponse({ error: "Upstream is down." }, false)
            : jsonResponse({ recommendation: {} });
        })
      );
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());
      await waitFor(() => expect(result.current.weatherData).toBeTruthy());

      weatherFails = true;
      await act(async () => result.current.loadWeatherRecommendation());

      await waitFor(() => expect(result.current.weatherError).toMatch(/last update/i));
      // The old reading stays on screen.
      expect(result.current.weatherData).toBeTruthy();
    });

    // The mirror of the air-quality block below: these two loaders carry
    // near-identical response handling, and each had the half the other was
    // missing. Weather had its geolocation codes covered but not its response
    // errors; air quality had the reverse.
    test("surfaces the server's own message when nothing is cached", async () => {
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
          String(url).includes("/api/weather")
            ? jsonResponse({ error: "Upstream refused." }, false)
            : jsonResponse({})
        )
      );
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      await waitFor(() => expect(result.current.weatherError).toBe("Upstream refused."));
    });

    test("falls back to a generic message when the error body carries none", async () => {
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
          String(url).includes("/api/weather") ? jsonResponse({}, false) : jsonResponse({})
        )
      );
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      await waitFor(() =>
        expect(result.current.weatherError).toMatch(/unable to load weather recommendation/i)
      );
    });

    test("falls back when the error body cannot be read at all", async () => {
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
          String(url).includes("/api/weather")
            ? {
                ok: false,
                json: async () => {
                  throw new Error("not json");
                }
              }
            : jsonResponse({})
        )
      );
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      await waitFor(() =>
        expect(result.current.weatherError).toMatch(/unable to load weather recommendation/i)
      );
    });

    test("a null body is stored as no reading rather than as an empty one", async () => {
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(null))
      );
      const { result } = ambient();

      await act(async () => result.current.loadWeatherRecommendation());

      await waitFor(() => expect(result.current.weatherLastUpdatedAt).toBeTruthy());
      expect(result.current.weatherData).toBeNull();
    });
  });

  // Each loader stamps its request and checks the stamp before writing, so a
  // slow first answer cannot land on top of a fast second one. A visitor who
  // taps refresh twice would otherwise watch the newer reading be replaced by
  // the older.
  describe("overlapping requests", () => {
    test.each([
      ["weather", "loadWeatherRecommendation", "/api/weather", "weatherData"],
      ["air quality", "loadAirQuality", "/api/air-quality", "airQualityData"]
    ])("a superseded %s response is discarded", async (_label, method, path, key) => {
      stubGeolocation();
      const gates = [deferred(), deferred()];
      let call = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) => {
          if (!String(url).includes(path)) return jsonResponse({});
          const gate = gates[Math.min(call, 1)];
          call += 1;
          return gate.promise;
        })
      );
      const { result } = ambient();

      let first;
      let second;
      await act(async () => {
        first = result.current[method]();
        second = result.current[method]();
      });

      // The second request answers first, then the stale first one arrives.
      gates[1].resolve(jsonResponse({ marker: "second" }));
      gates[0].resolve(jsonResponse({ marker: "first" }));
      await act(async () => {
        await Promise.all([first, second]);
      });

      await waitFor(() => expect(result.current[key]).toBeTruthy());
      expect(result.current[key].marker).toBe("second");
    });

    test.each([
      ["weather", "loadWeatherRecommendation", "/api/weather", "weatherData", "weatherError"],
      ["air quality", "loadAirQuality", "/api/air-quality", "airQualityData", "airQualityError"]
    ])(
      "a superseded %s failure does not report over a fresh success",
      async (_label, method, path, dataKey, errorKey) => {
        // The guard in the catch block, not the one in the success path. A
        // slow request that fails after a newer one succeeded would otherwise
        // put an error banner over a reading that is perfectly good.
        stubGeolocation();
        const gates = [deferred(), deferred()];
        let call = 0;
        vi.stubGlobal(
          "fetch",
          vi.fn(async (url) => {
            if (!String(url).includes(path)) return jsonResponse({});
            const gate = gates[Math.min(call, 1)];
            call += 1;
            return gate.promise;
          })
        );
        const { result } = ambient();

        let first;
        let second;
        await act(async () => {
          first = result.current[method]();
          second = result.current[method]();
        });

        gates[1].resolve(jsonResponse({ marker: "second" }));
        gates[0].resolve(jsonResponse({ error: "Stale failure." }, false));
        await act(async () => {
          await Promise.all([first, second]);
        });

        await waitFor(() => expect(result.current[dataKey]).toBeTruthy());
        expect(result.current[dataKey].marker).toBe("second");
        expect(result.current[errorKey]).toBe("");
      }
    );
  });

  describe("loading air quality", () => {
    test("stores the reading", async () => {
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ summary: { aqiUs: 42 } }))
      );
      const { result } = ambient();

      await act(async () => result.current.loadAirQuality());

      await waitFor(() => expect(result.current.airQualityData).toBeTruthy());
      expect(typeof result.current.airQualityLastUpdatedAt).toBe("number");
    });

    test("reports a geolocation refusal the same way weather does", async () => {
      stubGeolocation({ error: geoError(1) });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({}))
      );
      const { result } = ambient();

      await act(async () => result.current.loadAirQuality());

      await waitFor(() => expect(result.current.airQualityError).toMatch(/permission was denied/i));
    });

    test("says the reading is stale rather than missing when it already has one", async () => {
      stubGeolocation();
      let airFails = false;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) => {
          if (!String(url).includes("/api/air-quality")) return jsonResponse({ dashboard: {} });
          return airFails
            ? jsonResponse({ error: "Upstream is down." }, false)
            : jsonResponse({ summary: {} });
        })
      );
      const { result } = ambient();

      await act(async () => result.current.loadAirQuality());
      await waitFor(() => expect(result.current.airQualityData).toBeTruthy());

      airFails = true;
      await act(async () => result.current.loadAirQuality());

      await waitFor(() => expect(result.current.airQualityError).toMatch(/last update/i));
    });

    // Weather and air quality each carry their own copy of the geolocation
    // error handling -- the same four codes, the same four messages, written
    // out twice. Only the weather copy was covered, so the two could drift
    // apart without anything noticing. These drive the air-quality copy
    // directly and then assert the pair agree.
    test.each([
      [1, /permission was denied/i],
      [2, /unavailable/i],
      [3, /timed out/i],
      [99, /unable to access location/i]
    ])("turns geolocation error code %i into its own message", async (code, pattern) => {
      stubGeolocation({ error: geoError(code) });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({}))
      );
      const { result } = ambient();

      await act(async () => result.current.loadAirQuality());

      await waitFor(() => expect(result.current.airQualityError).toMatch(pattern));
    });

    test.each([[1], [2], [3], [99]])(
      "code %i reads identically whichever reading asked for the location",
      async (code) => {
        // The visitor is refused once and told twice; two wordings for one
        // refusal reads as two separate faults.
        stubGeolocation({ error: geoError(code) });
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => jsonResponse({}))
        );
        const { result } = ambient();

        await act(async () => result.current.loadWeatherRecommendation());
        await act(async () => result.current.loadAirQuality());

        await waitFor(() => expect(result.current.airQualityError).toBeTruthy());
        expect(result.current.airQualityError).toBe(result.current.weatherError);
      }
    );

    test("says so when the browser has no geolocation at all", async () => {
      vi.stubGlobal("navigator", {});
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({}))
      );
      const { result } = ambient();

      await act(async () => result.current.loadAirQuality());

      await waitFor(() =>
        expect(result.current.airQualityError).toMatch(/not available in this browser/i)
      );
    });

    test("and still says so once a reading is already on screen", async () => {
      // With no reading, the dedicated GEO_NOT_AVAILABLE branch and the
      // general fallback produce the same sentence, so the branch cannot be
      // told apart. With a reading present the fallback would instead say the
      // data is stale -- which is wrong, since nothing was refreshed and
      // nothing will be until the browser gains geolocation.
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ summary: { aqiUs: 42 } }))
      );
      const { result } = ambient();

      await act(async () => result.current.loadAirQuality());
      await waitFor(() => expect(result.current.airQualityData).toBeTruthy());

      vi.stubGlobal("navigator", {});
      await act(async () => result.current.loadAirQuality());

      await waitFor(() =>
        expect(result.current.airQualityError).toMatch(/not available in this browser/i)
      );
      expect(result.current.airQualityError).not.toMatch(/last update/i);
    });

    test("surfaces the server's own message when nothing is cached", async () => {
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
          String(url).includes("/api/air-quality")
            ? jsonResponse({ error: "Sensor offline." }, false)
            : jsonResponse({})
        )
      );
      const { result } = ambient();

      await act(async () => result.current.loadAirQuality());

      await waitFor(() => expect(result.current.airQualityError).toBe("Sensor offline."));
    });

    test("falls back to a generic message when the error body carries none", async () => {
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
          String(url).includes("/api/air-quality") ? jsonResponse({}, false) : jsonResponse({})
        )
      );
      const { result } = ambient();

      await act(async () => result.current.loadAirQuality());

      await waitFor(() =>
        expect(result.current.airQualityError).toMatch(/unable to load air quality/i)
      );
    });

    test("falls back when the error body cannot be read at all", async () => {
      // A proxy timeout returns an error status with an HTML body.
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
          String(url).includes("/api/air-quality")
            ? {
                ok: false,
                json: async () => {
                  throw new Error("not json");
                }
              }
            : jsonResponse({})
        )
      );
      const { result } = ambient();

      await act(async () => result.current.loadAirQuality());

      await waitFor(() =>
        expect(result.current.airQualityError).toMatch(/unable to load air quality/i)
      );
    });

    test("a null body is stored as no reading rather than as an empty one", async () => {
      stubGeolocation();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(null))
      );
      const { result } = ambient();

      await act(async () => result.current.loadAirQuality());

      await waitFor(() => expect(result.current.airQualityLastUpdatedAt).toBeTruthy());
      expect(result.current.airQualityData).toBeNull();
    });
  });

  describe("cached readings", () => {
    test("shows a cached weather reading before anything is requested", async () => {
      const cached = { recommendation: { workoutType: "indoor" } };
      window.localStorage.setItem(WEATHER_KEY, JSON.stringify({ data: cached, updatedAt: 1234 }));
      vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise(() => {}))
      );

      const { result } = ambient();

      await waitFor(() => expect(result.current.weatherData).toEqual(cached));
      expect(result.current.weatherLastUpdatedAt).toBe(1234);
    });

    test("shows a cached air quality reading too", async () => {
      const cached = { summary: { aqiUs: 42 } };
      window.localStorage.setItem(AIR_KEY, JSON.stringify({ data: cached, updatedAt: 1234 }));
      vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise(() => {}))
      );

      const { result } = ambient();

      await waitFor(() => expect(result.current.airQualityData).toEqual(cached));
    });

    test("ignores an unparseable cached reading", async () => {
      window.localStorage.setItem(WEATHER_KEY, "{not json");
      vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise(() => {}))
      );

      const { result } = ambient();

      await waitFor(() => expect(result.current.weatherData).toBeNull());
      expect(result.current.weatherError).toBe("");
    });
  });

  describe("loading on arrival", () => {
    test("fetches both readings when the dashboard opens", async () => {
      stubGeolocation();
      const fetchMock = vi.fn(async () => jsonResponse({}));
      vi.stubGlobal("fetch", fetchMock);

      ambient({ shouldLoadAmbientData: true });

      await waitFor(() =>
        expect(fetchMock.mock.calls.some(([u]) => u.includes("/api/weather"))).toBe(true)
      );
      await waitFor(() =>
        expect(fetchMock.mock.calls.some(([u]) => u.includes("/api/air-quality"))).toBe(true)
      );
    });

    test("does not fetch when ambient data was not asked for", async () => {
      stubGeolocation();
      const fetchMock = vi.fn(async () => jsonResponse({ dashboard: {} }));
      vi.stubGlobal("fetch", fetchMock);

      ambient({ shouldLoadAmbientData: false });

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchMock.mock.calls.some(([u]) => u.includes("/api/weather"))).toBe(false);
    });

    test("does not fetch away from the dashboard", async () => {
      stubGeolocation();
      const fetchMock = vi.fn(async () => jsonResponse({}));
      vi.stubGlobal("fetch", fetchMock);

      ambient({ shouldLoadAmbientData: true, isDashboardRoute: false });

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fetchMock.mock.calls.some(([u]) => u.includes("/api/weather"))).toBe(false);
    });

    test("does not fetch without a signed-in user", async () => {
      stubGeolocation();
      const fetchMock = vi.fn(async () => jsonResponse({}));
      vi.stubGlobal("fetch", fetchMock);

      ambient({ shouldLoadAmbientData: true, user: null });

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // The auto-load is guarded by `if (!weatherDataRef.current)`, but on a cold
    // mount that ref is still null when the guard runs: the effect syncing it
    // is declared first and sees the initial null, the cache-hydration effects
    // set state further down, and the auto-load effect reads the ref in the
    // same pass. So a cached reading does not prevent the request, and the user
    // is prompted for their location anyway. Recorded as it behaves.
    test("still refetches on a cold mount even with a cached reading", async () => {
      window.localStorage.setItem(
        WEATHER_KEY,
        JSON.stringify({ data: { recommendation: {} }, updatedAt: 1 })
      );
      stubGeolocation();
      const fetchMock = vi.fn(async () => jsonResponse({}));
      vi.stubGlobal("fetch", fetchMock);

      const { result } = ambient({ shouldLoadAmbientData: true });
      await waitFor(() => expect(result.current.weatherData).toBeTruthy());

      await waitFor(() =>
        expect(fetchMock.mock.calls.some(([u]) => u.includes("/api/weather"))).toBe(true)
      );
    });

    // The guard is not dead, though: it is written for the case where the user
    // leaves the dashboard and comes back without the hook unmounting. The
    // once-per-visit flag is cleared on the way out, and by then the ref does
    // hold the reading loaded earlier.
    test("does not refetch when returning to the dashboard in the same session", async () => {
      stubGeolocation();
      const fetchMock = vi.fn(async () => jsonResponse({ recommendation: {} }));
      vi.stubGlobal("fetch", fetchMock);

      const { result, rerender } = renderHook((props) => useDashboardData(props), {
        initialProps: {
          user,
          isDashboardRoute: true,
          shouldLoadAmbientData: true,
          dashboardCacheKey: CACHE_KEY,
          weatherCacheKey: WEATHER_KEY,
          airCacheKey: AIR_KEY,
          setGoalForm
        }
      });
      await waitFor(() => expect(result.current.weatherData).toBeTruthy());
      const afterFirst = fetchMock.mock.calls.filter(([u]) =>
        String(u).includes("/api/weather")
      ).length;

      // Leave, which clears the once-per-visit flag, then come back.
      rerender({
        user,
        isDashboardRoute: false,
        shouldLoadAmbientData: true,
        dashboardCacheKey: CACHE_KEY,
        weatherCacheKey: WEATHER_KEY,
        airCacheKey: AIR_KEY,
        setGoalForm
      });
      rerender({
        user,
        isDashboardRoute: true,
        shouldLoadAmbientData: true,
        dashboardCacheKey: CACHE_KEY,
        weatherCacheKey: WEATHER_KEY,
        airCacheKey: AIR_KEY,
        setGoalForm
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      const afterReturn = fetchMock.mock.calls.filter(([u]) =>
        String(u).includes("/api/weather")
      ).length;
      expect(afterReturn).toBe(afterFirst);
    });
  });
});
