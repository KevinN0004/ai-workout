import { describe, expect, test, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerWeatherRoutes } from "./registerWeatherRoutes.js";
import { createExternalDataService } from "../../services/externalDataService.js";
import { isUpstreamFailureStatus } from "../../services/platformHealthService.js";
import { cleanText, toNullableNumber } from "../../services/dashboardDataBuildersService.js";

// The two weather routes. Their air-quality sibling went to 100% earlier; these
// were left at 44% statements and 28% branch, on the same health-advice surface
// where two null-handling bugs have already shipped.
//
// Only fetchOpenMeteo is stubbed -- it is the network boundary. Every other
// dependency is the real injected function, so the recommendation under test is
// the one that runs in production.

const { toFiniteNumber, weatherCodeToText, buildWorkoutRecommendation } = createExternalDataService(
  {
    cleanText,
    toNullableNumber: (value) => (Number.isFinite(Number(value)) ? Number(value) : null),
    readThroughExternalCache: async () => ({}),
    buildExternalCacheKey: () => "",
    metrics: { externalApiFailures: {}, externalApiRetries: {} },
    logger: { info() {}, warn() {}, error() {} },
    toShortText: (value) => String(value ?? ""),
    recordExternalApiLatency: () => {},
    externalApiRetries: 0,
    externalApiRetryBaseDelayMs: 0
  }
);

const buildApp = (fetchOpenMeteo) => {
  const app = express();
  registerWeatherRoutes(app, {
    toNullableNumber,
    fetchOpenMeteo,
    toFiniteNumber,
    cleanText,
    weatherCodeToText,
    isUpstreamFailureStatus,
    buildWorkoutRecommendation
  });
  return app;
};

const upstream = (data, cache = "miss") => vi.fn(async () => ({ data, cache }));

// Open-Meteo's own key names. camelCase would silently read undefined and skip
// every gate, so the snake_case here is load-bearing.
const currentPayload = (overrides = {}) => ({
  latitude: 40.1,
  longitude: -75.2,
  timezone: "America/New_York",
  current: {
    time: "2026-03-02T10:00",
    temperature_2m: 18,
    apparent_temperature: 17,
    precipitation: 0,
    weather_code: 1,
    wind_speed_10m: 8,
    relative_humidity_2m: 55,
    is_day: 1,
    ...overrides
  }
});

// Takes current-block overrides in the same position as currentPayload, so the
// two can be driven interchangeably by the shared describe.each below. Daily
// overrides are a separate argument; conflating them silently left the current
// block untouched when I first wrote this.
const withDaily = (currentOverrides = {}, dailyOverrides = {}) => ({
  ...currentPayload(currentOverrides),
  daily: {
    time: ["2026-03-02", "2026-03-03"],
    weather_code: [1, 61],
    temperature_2m_max: [20, 15],
    temperature_2m_min: [9, 7],
    precipitation_sum: [0, 4.2],
    ...dailyOverrides
  }
});

const upstreamError = (status) => {
  const err = new Error("open-meteo exploded");
  if (status !== undefined) err.status = status;
  return err;
};

const get = (app, path, query = "latitude=40.1&longitude=-75.2") =>
  request(app).get(query ? `${path}?${query}` : path);

describe.each([
  ["/api/weather/current", currentPayload],
  ["/api/weather/recommendation", withDaily]
])("%s", (path, payload) => {
  describe("request validation", () => {
    test("rejects a request with no coordinates", async () => {
      const fetchOpenMeteo = vi.fn();

      const response = await get(buildApp(fetchOpenMeteo), path, "");

      expect(response.status).toBe(400);
      expect(String(response.body?.error)).toMatch(/latitude and longitude/i);
      expect(fetchOpenMeteo).not.toHaveBeenCalled();
    });

    test.each([
      ["latitude past the pole", "latitude=91&longitude=0"],
      ["longitude past the meridian", "latitude=0&longitude=181"],
      ["a non-numeric latitude", "latitude=north&longitude=0"]
    ])("rejects %s", async (_label, query) => {
      const fetchOpenMeteo = vi.fn();

      const response = await get(buildApp(fetchOpenMeteo), path, query);

      expect(response.status).toBe(400);
      expect(fetchOpenMeteo).not.toHaveBeenCalled();
    });

    test("accepts the extremes of the range", async () => {
      const fetchOpenMeteo = upstream(payload());

      const response = await get(buildApp(fetchOpenMeteo), path, "latitude=-90&longitude=180");

      expect(response.status).toBe(200);
    });
  });

  describe("the upstream request", () => {
    test("passes the coordinates through", async () => {
      const fetchOpenMeteo = upstream(payload());

      await get(buildApp(fetchOpenMeteo), path);

      expect(fetchOpenMeteo.mock.calls[0][0]).toMatchObject({ latitude: 40.1, longitude: -75.2 });
    });

    // The variable list is what the response is built from; dropping one turns
    // a field null without any other signal.
    test("asks for every current variable it reports", async () => {
      const fetchOpenMeteo = upstream(payload());

      await get(buildApp(fetchOpenMeteo), path);

      const asked = String(fetchOpenMeteo.mock.calls[0][0].current).split(",");
      expect(asked).toEqual(
        expect.arrayContaining([
          "temperature_2m",
          "apparent_temperature",
          "precipitation",
          "weather_code",
          "wind_speed_10m",
          "relative_humidity_2m",
          "is_day"
        ])
      );
    });
  });

  describe("the current reading", () => {
    test("maps the upstream keys onto the response", async () => {
      const response = await get(buildApp(upstream(payload())), path);

      expect(response.status).toBe(200);
      expect(response.body.current).toMatchObject({
        time: "2026-03-02T10:00",
        temperatureC: 18,
        apparentTemperatureC: 17,
        precipitationMm: 0,
        windSpeedKmh: 8,
        humidityPct: 55,
        weatherCode: 1,
        weatherText: "Partly cloudy",
        isDay: true
      });
    });

    test("reports the location the upstream answered for", async () => {
      const response = await get(buildApp(upstream(payload())), path);

      expect(response.body.location).toEqual({
        latitude: 40.1,
        longitude: -75.2,
        timezone: "America/New_York"
      });
    });

    test("passes the cache status through", async () => {
      const response = await get(buildApp(upstream(payload(), "hit")), path);

      expect(response.body.cache).toBe("hit");
    });

    test("reads is_day as a flag rather than a number", async () => {
      const day = await get(buildApp(upstream(payload({ is_day: 1 }))), path);
      const night = await get(buildApp(upstream(payload({ is_day: 0 }))), path);

      expect(day.body.current.isDay).toBe(true);
      expect(night.body.current.isDay).toBe(false);
    });

    // The check is `Number(is_day) === 1`, not a truthiness test, and 1 and 0
    // cannot tell those apart. A value that is present but is not the flag is
    // still an answer, and it is not daytime.
    test.each([
      ["2", 2],
      ["a string", "yes"]
    ])("does not read %s as daytime", async (_label, value) => {
      const response = await get(buildApp(upstream(payload({ is_day: value }))), path);

      expect(response.body.current.isDay).toBe(false);
    });

    // Absent is not night. `Number(null)` is 0 and `0 === 1` is false, so a
    // payload carrying no daylight reading used to publish a confident "night"
    // -- while `weatherCode` beside it correctly reported null, and the
    // upstream-failure branch of this same route already reported isDay: null.
    // The field now agrees with its siblings and with itself.
    test.each([
      ["null", null],
      ["absent", undefined],
      ["an empty string", ""]
    ])("reports %s as unknown rather than as night", async (_label, value) => {
      const response = await get(buildApp(upstream(payload({ is_day: value }))), path);

      expect(response.body.current.isDay).toBeNull();
    });

    test("survives an upstream answer with no current block at all", async () => {
      const response = await get(buildApp(upstream({ latitude: 40.1, longitude: -75.2 })), path);

      expect(response.status).toBe(200);
      expect(response.body.current.temperatureC).toBeNull();
      expect(response.body.current.weatherText).toBe("Unknown");
    });

    // The bug this file was written to look for. weatherCode goes through
    // toFiniteNumber and comes back null, but weatherText was built from the
    // raw value -- and Number(null) is 0, which is "Clear sky". The two fields
    // in one response disagreed, and the text is the half a user reads.
    describe("a missing weather code", () => {
      test.each([
        ["null", null],
        ["an empty string", ""],
        ["absent", undefined]
      ])("reads as unknown when the code is %s", async (_label, code) => {
        const response = await get(buildApp(upstream(payload({ weather_code: code }))), path);

        expect(response.body.current.weatherCode).toBeNull();
        expect(response.body.current.weatherText).toBe("Unknown");
      });

      test("does not disagree with itself", async () => {
        const response = await get(buildApp(upstream(payload({ weather_code: null }))), path);

        // A null code and a text of "Clear sky" cannot both be true.
        expect(response.body.current.weatherText).not.toBe("Clear sky");
      });

      test("still names a real clear sky", async () => {
        const response = await get(buildApp(upstream(payload({ weather_code: 0 }))), path);

        expect(response.body.current.weatherCode).toBe(0);
        expect(response.body.current.weatherText).toBe("Clear sky");
      });
    });

    test("does not turn a missing temperature into freezing", async () => {
      const response = await get(buildApp(upstream(payload({ temperature_2m: null }))), path);

      expect(response.body.current.temperatureC).toBeNull();
    });
  });

  // An upstream outage answers 200 with a degraded body so the dashboard panel
  // keeps rendering, the same contract the air-quality route has.
  describe("when Open-Meteo is down", () => {
    test.each([500, 502, 503, 504])("answers 200 with a fallback body for a %i", async (status) => {
      const fetchOpenMeteo = vi.fn().mockRejectedValue(upstreamError(status));

      const response = await get(buildApp(fetchOpenMeteo), path);

      expect(response.status).toBe(200);
      expect(response.body.fallback).toBe(true);
      expect(response.body.service).toBe("open-meteo");
    });

    test("reports nothing rather than guessing", async () => {
      const fetchOpenMeteo = vi.fn().mockRejectedValue(upstreamError(503));

      const response = await get(buildApp(fetchOpenMeteo), path);

      expect(response.body.current).toMatchObject({
        temperatureC: null,
        apparentTemperatureC: null,
        precipitationMm: null,
        windSpeedKmh: null,
        humidityPct: null,
        weatherCode: null,
        isDay: null,
        weatherText: "Unknown"
      });
    });

    test("echoes the coordinates that were asked for", async () => {
      const fetchOpenMeteo = vi.fn().mockRejectedValue(upstreamError(503));

      const response = await get(buildApp(fetchOpenMeteo), path);

      expect(response.body.location.latitude).toBe(40.1);
      expect(response.body.location.longitude).toBe(-75.2);
    });

    // A thrown network error carries no status and defaults to 500, which is
    // itself an upstream status, so it degrades rather than erroring.
    test("falls back for an error carrying no status", async () => {
      const fetchOpenMeteo = vi.fn().mockRejectedValue(upstreamError(undefined));

      const response = await get(buildApp(fetchOpenMeteo), path);

      expect(response.status).toBe(200);
      expect(response.body.fallback).toBe(true);
      expect(JSON.stringify(response.body)).not.toMatch(/exploded/);
    });

    test("reports a non-upstream failure as an error instead", async () => {
      const fetchOpenMeteo = vi.fn().mockRejectedValue(upstreamError(418));

      const response = await get(buildApp(fetchOpenMeteo), path);

      expect(response.status).toBe(418);
      expect(response.body.fallback).toBeUndefined();
    });
  });
});

// Only on /api/weather/recommendation.
describe("/api/weather/recommendation", () => {
  const path = "/api/weather/recommendation";

  test("asks for the daily variables too", async () => {
    const fetchOpenMeteo = upstream(withDaily());

    await get(buildApp(fetchOpenMeteo), path);

    const asked = String(fetchOpenMeteo.mock.calls[0][0].daily).split(",");
    expect(asked).toEqual(
      expect.arrayContaining([
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum"
      ])
    );
  });

  test("builds one forecast entry per day", async () => {
    const response = await get(buildApp(upstream(withDaily())), path);

    expect(response.body.daily).toEqual([
      {
        date: "2026-03-02",
        weatherCode: 1,
        weatherText: "Partly cloudy",
        tempMaxC: 20,
        tempMinC: 9,
        precipitationMm: 0
      },
      {
        date: "2026-03-03",
        weatherCode: 61,
        weatherText: "Rain",
        tempMaxC: 15,
        tempMinC: 7,
        precipitationMm: 4.2
      }
    ]);
  });

  // The forecast arrays are parallel to `time`, and a shorter one is how a
  // day ends up described by the next day's numbers.
  test("keeps a day whose other arrays are short rather than shifting them", async () => {
    const response = await get(
      buildApp(upstream(withDaily({}, { temperature_2m_max: [20], weather_code: [1] }))),
      path
    );

    expect(response.body.daily).toHaveLength(2);
    expect(response.body.daily[1].tempMaxC).toBeNull();
    expect(response.body.daily[1].weatherText).toBe("Unknown");
  });

  test("returns no forecast when the upstream sends no daily block", async () => {
    const response = await get(buildApp(upstream(currentPayload())), path);

    expect(response.status).toBe(200);
    expect(response.body.daily).toEqual([]);
  });

  test("returns no forecast when daily.time is not a list", async () => {
    const response = await get(
      buildApp(upstream({ ...currentPayload(), daily: { time: "2026-03-02" } })),
      path
    );

    expect(response.body.daily).toEqual([]);
  });

  describe("the recommendation", () => {
    test("advises outdoor training in mild, calm, dry weather", async () => {
      const response = await get(buildApp(upstream(withDaily())), path);

      expect(response.body.recommendation.workoutType).toBe("outdoor");
    });

    test.each([
      ["a thunderstorm", { weather_code: 95 }],
      ["freezing", { temperature_2m: 2 }],
      ["heat", { temperature_2m: 35 }],
      ["high wind", { wind_speed_10m: 33 }],
      ["rain", { precipitation: 1.2 }]
    ])("advises indoor training in %s", async (_label, patch) => {
      const response = await get(buildApp(upstream(withDaily(patch))), path);

      expect(response.body.recommendation.workoutType).toBe("indoor");
      expect(response.body.recommendation.reasons.length).toBeGreaterThan(0);
    });

    // A payload carrying no readings must not be read as a fine day.
    test("does not recommend outdoor training on the strength of nulls", async () => {
      const empty = withDaily({
        temperature_2m: null,
        apparent_temperature: null,
        precipitation: null,
        weather_code: null,
        wind_speed_10m: null,
        relative_humidity_2m: null,
        is_day: null
      });

      const response = await get(buildApp(upstream(empty)), path);

      expect(response.body.recommendation.weatherText).toBe("Unknown");
      expect(response.body.current.weatherText).toBe("Unknown");
    });
  });

  test("recommends indoor training when the upstream is down", async () => {
    const fetchOpenMeteo = vi.fn().mockRejectedValue(upstreamError(503));

    const response = await get(buildApp(fetchOpenMeteo), path);

    expect(response.body.recommendation.workoutType).toBe("indoor");
    expect(response.body.recommendation.weatherText).toBe("Unknown");
    expect(response.body.daily).toEqual([]);
  });
});
