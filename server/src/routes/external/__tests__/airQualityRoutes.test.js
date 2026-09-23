import { describe, expect, test, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerAirQualityRoutes } from "../registerAirQualityRoutes.js";
import { createExternalDataService } from "../../../services/external/externalDataService.js";
import { createHttpCacheService } from "../../../services/external/httpCacheService.js";
import { isUpstreamFailureStatus } from "../../../services/platform/platformHealthService.js";
import {
  cleanText,
  toNullableNumber
} from "../../../services/dashboard/dashboardDataBuildersService.js";

// GET /api/air-quality/current had no test, while its sibling
// /api/weather/current did. The AQI maths are covered in airQuality.test.js;
// this covers the route around them -- validation, the two upstream calls, how
// readings are joined to sensors, and what a user gets when OpenAQ is down.
//
// Only openAqRequest is stubbed. It is the network boundary; every other
// dependency is the real function the server injects, so the parsing and AQI
// maths under test are the ones that actually run in production.

const stubbed = {
  metrics: { externalApiFailures: {}, externalApiRetries: {} },
  logger: { info() {}, warn() {}, error() {} },
  toShortText: (value) => String(value ?? "")
};

const { extractOpenAqMeasurement, pm25ToUsAqi, aqiBand, openAqParameterLabel, toFiniteNumber } =
  createExternalDataService({
    ...stubbed,
    cleanText,
    toNullableNumber: (value) => (Number.isFinite(Number(value)) ? Number(value) : null),
    readThroughExternalCache: async () => ({}),
    buildExternalCacheKey: () => "",
    recordExternalApiLatency: () => {},
    externalApiRetries: 0,
    externalApiRetryBaseDelayMs: 0
  });

const { mergeCacheStatuses } = createHttpCacheService({
  ...stubbed,
  toPositiveInt: (value, fallback) => (Number.isInteger(value) ? value : fallback),
  maxEntries: 10,
  defaultStaleTtlSec: 60
});

const buildApp = (openAqRequest) => {
  const app = express();
  registerAirQualityRoutes(app, {
    toNullableNumber,
    openAqRequest,
    toFiniteNumber,
    cleanText,
    extractOpenAqMeasurement,
    pm25ToUsAqi,
    aqiBand,
    mergeCacheStatuses,
    openAqParameterLabel,
    isUpstreamFailureStatus
  });
  return app;
};

// A sensor as OpenAQ describes it on the location, and a reading that refers
// back to it by id. The route has to join the two to learn what was measured.
const sensor = (id, name, units = "ug/m3") => ({
  id,
  parameter: { name, units, displayName: openAqParameterLabel(name) }
});

const reading = (sensorsId, value, utc = "2026-03-02T10:00:00Z") => ({
  sensorsId,
  value,
  datetime: { utc }
});

const station = (overrides = {}) => ({
  id: 42,
  name: "Riverside Monitor",
  locality: "Springfield",
  country: { name: "United States" },
  coordinates: { latitude: 40.1, longitude: -75.2 },
  distance: 1200,
  sensors: [sensor(1, "pm25"), sensor(2, "o3", "ppm")],
  ...overrides
});

// Two upstream calls in order: the location lookup, then that location's latest
// readings.
const upstream = ({ locations, latest, locationsCache = "miss", latestCache = "miss" }) =>
  vi
    .fn()
    .mockResolvedValueOnce({ data: { results: locations }, cache: locationsCache })
    .mockResolvedValueOnce({ data: { results: latest }, cache: latestCache });

const get = (app, query = "latitude=40.1&longitude=-75.2") => {
  const path = query ? `/api/air-quality/current?${query}` : "/api/air-quality/current";
  return request(app).get(path);
};

describe("GET /api/air-quality/current", () => {
  describe("request validation", () => {
    test("rejects a request with no coordinates", async () => {
      const openAqRequest = vi.fn();

      const response = await get(buildApp(openAqRequest), "");

      expect(response.status).toBe(400);
      expect(String(response.body?.error)).toMatch(/latitude and longitude/i);
      // Nothing should reach the upstream on a request we can reject ourselves.
      expect(openAqRequest).not.toHaveBeenCalled();
    });

    test("rejects coordinates outside the real world", async () => {
      const openAqRequest = vi.fn();

      const response = await get(buildApp(openAqRequest), "latitude=200&longitude=-75.2");

      expect(response.status).toBe(400);
      expect(openAqRequest).not.toHaveBeenCalled();
    });

    test("rejects a radius outside the accepted range", async () => {
      const openAqRequest = vi.fn();

      const response = await get(
        buildApp(openAqRequest),
        "latitude=40.1&longitude=-75.2&radiusKm=5000"
      );

      expect(response.status).toBe(400);
      expect(openAqRequest).not.toHaveBeenCalled();
    });
  });

  describe("station lookup", () => {
    test("asks for one station within the requested radius, in metres", async () => {
      const openAqRequest = upstream({ locations: [station()], latest: [reading(1, 12)] });

      await get(buildApp(openAqRequest), "latitude=40.1&longitude=-75.2&radiusKm=10");

      expect(openAqRequest).toHaveBeenNthCalledWith(1, "locations", {
        coordinates: "40.1,-75.2",
        radius: 10000,
        limit: 1
      });
    });

    test("defaults to a 25km radius when none is given", async () => {
      const openAqRequest = upstream({ locations: [station()], latest: [reading(1, 12)] });

      await get(buildApp(openAqRequest));

      expect(openAqRequest.mock.calls[0][1].radius).toBe(25000);
    });

    test("requests the latest readings for the station it found", async () => {
      const openAqRequest = upstream({ locations: [station({ id: 77 })], latest: [] });

      await get(buildApp(openAqRequest));

      expect(openAqRequest).toHaveBeenNthCalledWith(2, "locations/77/latest");
    });

    test("returns 404 when no station is nearby", async () => {
      const openAqRequest = vi.fn().mockResolvedValueOnce({ data: { results: [] }, cache: "miss" });

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(404);
      expect(String(response.body?.error)).toMatch(/no nearby air quality station/i);
      // The second upstream call is pointless without a station.
      expect(openAqRequest).toHaveBeenCalledTimes(1);
    });

    test("returns 502 when the station arrives without a usable id", async () => {
      const openAqRequest = vi
        .fn()
        .mockResolvedValueOnce({ data: { results: [station({ id: null })] }, cache: "miss" });

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(502);
      expect(String(response.body?.error)).toMatch(/missing location id/i);
    });
  });

  describe("readings", () => {
    test("joins a reading to its sensor to learn what was measured", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(1, 12.4), reading(2, 0.031)]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(200);
      expect(response.body.pollutants).toEqual([
        {
          code: "pm25",
          label: "PM2.5",
          value: 12.4,
          unit: "ug/m3",
          measuredAt: "2026-03-02T10:00:00Z"
        },
        {
          code: "o3",
          label: "Ozone",
          value: 0.031,
          unit: "ppm",
          measuredAt: "2026-03-02T10:00:00Z"
        }
      ]);
    });

    test("drops a reading whose sensor is not on the station", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(1, 12.4), reading(999, 5)]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.pollutants.map((item) => item.code)).toEqual(["pm25"]);
    });

    test("drops a reading with no value", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(1, null), reading(2, 0.031)]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.pollutants.map((item) => item.code)).toEqual(["o3"]);
    });

    // Stations report the same pollutant from more than one sensor. The first
    // reading wins, so a second sensor cannot overwrite the first.
    test("keeps only the first reading for a repeated pollutant", async () => {
      const openAqRequest = upstream({
        locations: [station({ sensors: [sensor(1, "pm25"), sensor(3, "pm25")] })],
        latest: [reading(1, 12.4), reading(3, 88)]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.pollutants).toHaveLength(1);
      expect(response.body.pollutants[0].value).toBe(12.4);
    });

    test("caps the pollutant list at twelve", async () => {
      const sensors = Array.from({ length: 20 }, (_, index) => sensor(index + 1, `p${index + 1}`));
      const openAqRequest = upstream({
        locations: [station({ sensors })],
        latest: sensors.map((item, index) => reading(item.id, index + 1))
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.pollutants).toHaveLength(12);
    });
  });

  describe("summary", () => {
    test("reports the AQI the EPA table gives for the measured pm2.5", async () => {
      const openAqRequest = upstream({ locations: [station()], latest: [reading(1, 12)] });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.summary.pm25).toBe(12);
      expect(response.body.summary.aqiUs).toBe(pm25ToUsAqi(12));
      expect(response.body.summary.level).toBe(aqiBand(pm25ToUsAqi(12)).level);
      expect(response.body.summary.primaryPollutant).toBe("PM2.5");
    });

    // OpenAQ spells this parameter several ways. All of them are pm2.5 and all
    // of them must drive the AQI, not just the one spelling.
    test.each(["pm25", "pm2.5", "pm2_5", "pm2p5"])("recognises %s as pm2.5", async (code) => {
      const openAqRequest = upstream({
        locations: [station({ sensors: [sensor(1, code)] })],
        latest: [reading(1, 35)]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.summary.pm25).toBe(35);
      expect(response.body.summary.aqiUs).toBe(pm25ToUsAqi(35));
    });

    test("leaves the AQI null when the station reports no pm2.5 at all", async () => {
      const openAqRequest = upstream({
        locations: [station({ sensors: [sensor(2, "o3", "ppm")] })],
        latest: [reading(2, 0.031)]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.summary.pm25).toBeNull();
      expect(response.body.summary.aqiUs).toBeNull();
      // Falls back to naming whatever the station does measure.
      expect(response.body.summary.primaryPollutant).toBe("Ozone");
    });

    // The consequence of the firstFinite fix, stated as health advice rather
    // than as parsing: a sensor that reported nothing must not be rendered as
    // pristine air. Number(null) is 0, and 0 ug/m3 scores AQI 0 -- "Good".
    test("does not report a silent pm2.5 sensor as clean air", async () => {
      const openAqRequest = upstream({
        locations: [station({ sensors: [sensor(1, "pm25")] })],
        latest: [reading(1, null)]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.summary.pm25).toBeNull();
      expect(response.body.summary.aqiUs).toBeNull();
      expect(response.body.summary.aqiUs).not.toBe(0);
    });

    // A measured zero is a real reading and must survive the guard above.
    test("keeps a genuine zero reading", async () => {
      const openAqRequest = upstream({
        locations: [station({ sensors: [sensor(1, "pm25")] })],
        latest: [reading(1, 0)]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.summary.pm25).toBe(0);
      expect(response.body.summary.aqiUs).toBe(0);
    });

    // firstFinite exists to try several payload shapes. A null in the first
    // slot must not stop it reaching the one that has the value.
    test("falls through to a later payload shape when the first is empty", async () => {
      const openAqRequest = upstream({
        locations: [station({ sensors: [sensor(1, "pm25")] })],
        latest: [{ sensorsId: 1, value: null, summary: { value: 35 }, datetime: { utc: "x" } }]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.summary.pm25).toBe(35);
    });

    test("says the pollutant is unknown when there are no readings", async () => {
      const openAqRequest = upstream({ locations: [station()], latest: [] });

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(200);
      expect(response.body.pollutants).toEqual([]);
      expect(response.body.summary.primaryPollutant).toBe("Unknown");
    });
  });

  describe("station details", () => {
    test("reports the station it used", async () => {
      const openAqRequest = upstream({ locations: [station()], latest: [reading(1, 12)] });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.location).toEqual({
        id: 42,
        name: "Riverside Monitor",
        city: "Springfield",
        country: "United States",
        latitude: 40.1,
        longitude: -75.2,
        distanceM: 1200
      });
    });

    test("merges the cache status of both upstream calls", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(1, 12)],
        locationsCache: "hit",
        latestCache: "stale"
      });

      const response = await get(buildApp(openAqRequest));

      // Stale anywhere makes the whole answer stale.
      expect(response.body.cache).toEqual({ status: "stale", locations: "hit", latest: "stale" });
    });
  });

  // The point of this branch: an OpenAQ outage must not surface as an error.
  // The dashboard renders this panel from a 200, so a failing upstream returns
  // a degraded body instead and the rest of the page still works.
  describe("when OpenAQ is down", () => {
    const upstreamError = (status) => {
      const err = new Error("openaq exploded");
      err.status = status;
      return err;
    };

    test.each([500, 502, 503, 504])("answers 200 with a fallback body for a %i", async (status) => {
      const openAqRequest = vi.fn().mockRejectedValue(upstreamError(status));

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(200);
      expect(response.body.fallback).toBe(true);
      expect(response.body.service).toBe("openaq");
    });

    test("advises indoor training rather than guessing", async () => {
      const openAqRequest = vi.fn().mockRejectedValue(upstreamError(503));

      const response = await get(buildApp(openAqRequest));

      expect(response.body.summary.workoutType).toBe("indoor");
      expect(response.body.summary.aqiUs).toBeNull();
      expect(response.body.summary.pm25).toBeNull();
      expect(response.body.summary.level).toBe("Unknown");
      expect(response.body.pollutants).toEqual([]);
    });

    test("echoes the coordinates that were asked for", async () => {
      const openAqRequest = vi.fn().mockRejectedValue(upstreamError(503));

      const response = await get(buildApp(openAqRequest), "latitude=40.1&longitude=-75.2");

      expect(response.body.location.latitude).toBe(40.1);
      expect(response.body.location.longitude).toBe(-75.2);
      expect(response.body.location.id).toBeNull();
    });

    // A failure that is not an upstream outage is a real error and is reported
    // as one, rather than being dressed up as clean air.
    test("reports a non-upstream failure as an error", async () => {
      const err = new Error("boom");
      err.status = 418;
      const openAqRequest = vi.fn().mockRejectedValue(err);

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(418);
      expect(response.body.fallback).toBeUndefined();
    });

    // A thrown network error carries no status, so the handler defaults to 500
    // -- which is itself an upstream status, and so takes the fallback too. That
    // is the right call for this route: a dead socket to OpenAQ is an OpenAQ
    // outage, and the panel should degrade rather than error.
    test("falls back for an error carrying no status at all", async () => {
      const openAqRequest = vi.fn().mockRejectedValue(new Error("socket hang up"));

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(200);
      expect(response.body.fallback).toBe(true);
      // Whatever happens, the upstream's own text must not reach the client.
      expect(JSON.stringify(response.body)).not.toMatch(/socket hang up/);
    });
  });
});
