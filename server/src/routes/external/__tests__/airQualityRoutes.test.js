import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
// this covers the route around them -- validation, the three upstream calls,
// how readings are joined to sensors, which hours the NowCast is scored from,
// and what a user gets when OpenAQ is down.
//
// Only openAqRequest is stubbed. It is the network boundary; every other
// dependency is the real function the server injects, so the parsing and AQI
// maths under test are the ones that actually run in production.

const stubbed = {
  metrics: { externalApiFailures: {}, externalApiRetries: {} },
  logger: { info() {}, warn() {}, error() {} },
  toShortText: (value) => String(value ?? "")
};

const {
  extractOpenAqMeasurement,
  pm25ToUsAqi,
  pm25NowCast,
  nowCastHoursQuery,
  rankFreshPm25Stations,
  isFreshReading,
  openAqResultsTruncated,
  projectOpenAqStations,
  openAqReturnedCount,
  isPm25Code,
  aqiBand,
  openAqParameterLabel,
  toFiniteNumber
} = createExternalDataService({
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

const buildApp = (openAqRequest, { requestId, logger = stubbed.logger } = {}) => {
  const app = express();
  app.use((req, _res, next) => {
    if (requestId) req.requestId = requestId;
    next();
  });
  registerAirQualityRoutes(app, {
    toNullableNumber,
    openAqRequest,
    toFiniteNumber,
    cleanText,
    logger,
    extractOpenAqMeasurement,
    pm25ToUsAqi,
    pm25NowCast,
    nowCastHoursQuery,
    rankFreshPm25Stations,
    isFreshReading,
    openAqResultsTruncated,
    projectOpenAqStations,
    openAqReturnedCount,
    isPm25Code,
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
  // Ten minutes before the pinned clock: a station reporting now.
  datetimeLast: { utc: "2026-03-02T12:00:00Z", local: "2026-03-02T07:00:00-05:00" },
  sensors: [sensor(1, "pm25"), sensor(2, "o3", "ppm")],
  ...overrides
});

// A station that last reported `hoursAgo` hours before the pinned 12:10Z.
const reportedAgo = (hoursAgo) => ({
  utc: new Date(Date.parse("2026-03-02T12:10:00Z") - hoursAgo * 3600000).toISOString()
});

// One OpenAQ hourly mean, ending `hoursAgo` whole hours before 12:00Z. The
// clock is pinned at 12:10Z below, so hour 0 is ten minutes old.
const hour = (hoursAgo, value) => ({
  value,
  period: { datetimeTo: { utc: new Date(Date.UTC(2026, 2, 2, 12 - hoursAgo)).toISOString() } }
});

// Three steady hours of `value`: the fewest a NowCast of that value needs.
const steadyHours = (value) => [hour(0, value), hour(1, value), hour(2, value)];

// Three upstream calls in order: the location lookup, that location's latest
// readings, then the PM2.5 sensor's hourly means.
const upstream = ({
  locations,
  latest,
  hours = [],
  locationsCache = "miss",
  latestCache = "miss",
  hoursCache = "miss"
}) =>
  vi
    .fn()
    .mockResolvedValueOnce({ data: { results: locations }, cache: locationsCache })
    .mockResolvedValueOnce({ data: { results: latest }, cache: latestCache })
    .mockResolvedValueOnce({ data: { results: hours }, cache: hoursCache });

const get = (app, query = "latitude=40.1&longitude=-75.2") => {
  const path = query ? `/api/air-quality/current?${query}` : "/api/air-quality/current";
  return request(app).get(path);
};

describe("GET /api/air-quality/current", () => {
  // The NowCast reads the clock. Only Date is faked, because supertest and
  // express rely on real timers.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-02T12:10:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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
    // OpenAQ lists stations in id order and cannot sort them by distance, so
    // the route asks for every PM2.5 station (parameter 2) in one page of up to
    // 1,000, OpenAQ's page maximum, and chooses among them itself.
    test("asks for every PM2.5 station within the requested radius, in metres", async () => {
      const openAqRequest = upstream({ locations: [station()], latest: [reading(1, 12)] });

      await get(buildApp(openAqRequest), "latitude=40.1&longitude=-75.2&radiusKm=10");

      expect(openAqRequest).toHaveBeenNthCalledWith(
        1,
        "locations",
        { coordinates: "40.1,-75.2", radius: 10000, parameters_id: 2, limit: 1000 },
        { project: expect.any(Function) }
      );
    });

    // That page is cached for every point asked about (383,705 bytes live for
    // Los Angeles), so the station list is cached trimmed to the fields read;
    // /latest and the hours are small and cached whole.
    test("caches the station list trimmed, and the other calls whole", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(1, 12)],
        hours: steadyHours(12)
      });

      await get(buildApp(openAqRequest));

      // The projection the route passes is projectOpenAqStations ranking from
      // the point asked about, which is part of the cache key.
      const { project } = openAqRequest.mock.calls[0][2];
      const twelve = Array.from({ length: 12 }, (_, i) =>
        station({
          id: 100 + i,
          distance: null,
          coordinates: { latitude: 40.1 + i / 100, longitude: -75.2 }
        })
      );
      const answer = { meta: { found: 12 }, results: twelve.toReversed() };
      expect(project(answer)).toEqual(
        projectOpenAqStations(answer, { latitude: 40.1, longitude: -75.2 })
      );
      expect(project(answer).results.map((item) => item.id)).toEqual([
        100, 101, 102, 103, 104, 105, 106, 107, 108, 109
      ]);
      expect(project(answer).meta).toEqual({ found: 12, returned: 12 });
      expect(openAqRequest.mock.calls[1]).toHaveLength(1);
      expect(openAqRequest.mock.calls[2]).toHaveLength(2);
    });

    // Only the nearest ten fresh stations are cached; a list cached before the
    // cap, whole or filtered with more than ten, must give the same answer.
    test("answers the same from a capped list as from a longer one cached before", async () => {
      const point = { latitude: 40.1, longitude: -75.2 };
      // Fourteen fresh PM2.5 stations; the nearest (id 1, 300 m) reads a stale
      // PM2.5 value, so the walk goes on to the second (id 2).
      const fourteen = Array.from({ length: 14 }, (_, i) =>
        station({
          id: i + 1,
          name: `Station ${i + 1}`,
          distance: 300 + i * 500,
          sensors: [sensor((i + 1) * 10, "pm25"), sensor((i + 1) * 10 + 1, "o3", "ppm")]
        })
      );
      const whole = { meta: { found: 14 }, results: fourteen.toReversed() };
      const filteredUncapped = { meta: { found: 14, returned: 14 }, results: fourteen };
      const capped = projectOpenAqStations(whole, point);
      expect(capped.results).toHaveLength(10);

      const answerFrom = async (data) => {
        const openAqRequest = vi
          .fn()
          .mockResolvedValueOnce({ data, cache: "hit" })
          .mockResolvedValueOnce({
            data: { results: [reading(10, 9, "2026-01-10T08:00:00Z")] },
            cache: "miss"
          })
          .mockResolvedValueOnce({
            data: { results: [reading(20, 12), reading(21, 0.03)] },
            cache: "miss"
          })
          .mockResolvedValueOnce({ data: { results: steadyHours(12) }, cache: "miss" });
        const response = await get(buildApp(openAqRequest));
        expect(openAqRequest).toHaveBeenNthCalledWith(3, "locations/2/latest");
        return response.text;
      };

      const fromWhole = await answerFrom(whole);
      expect(await answerFrom(filteredUncapped)).toBe(fromWhole);
      expect(await answerFrom(capped)).toBe(fromWhole);
      expect(JSON.parse(fromWhole).location).toMatchObject({ id: 2, distanceM: 800 });
    });

    // A list cached before the trim holds every field; one cached after holds
    // only the projection. Both must give the same answer.
    test("answers the same from a trimmed station list as from a full one", async () => {
      const full = [
        station({
          id: 154,
          distance: 2509,
          timezone: "Europe/London",
          provider: { id: 1, name: "AirNow" },
          owner: { id: 2, name: "Defra" },
          licenses: [{ id: 3, name: "OGL" }],
          bounds: [0, 0, 0, 0],
          datetimeFirst: { utc: "2016-01-01T00:00:00Z" },
          sensors: [
            { id: 246, name: "pm25 µg/m³", parameter: { id: 2, name: "pm25", units: "ug/m3" } }
          ]
        }),
        station({
          id: 151,
          name: "Tower Hamlets",
          distance: 6150,
          country: { id: 79, code: "GB", name: "United Kingdom" },
          sensors: [
            { id: 1510, parameter: { id: 2, name: "pm25", units: "ug/m3", displayName: "PM2.5" } },
            { id: 1511, parameter: { id: 10, name: "o3", units: "ppm", displayName: "Ozone" } }
          ]
        })
      ];
      const answerFrom = async (locationData) => {
        const openAqRequest = vi
          .fn()
          .mockResolvedValueOnce({ data: locationData, cache: "hit" })
          .mockResolvedValueOnce({
            data: { results: [reading(246, 10, "2026-01-10T08:00:00Z")] },
            cache: "miss"
          })
          .mockResolvedValueOnce({
            data: { results: [reading(1510, 12), reading(1511, 0.03)] },
            cache: "miss"
          })
          .mockResolvedValueOnce({ data: { results: steadyHours(12) }, cache: "miss" });
        return (await get(buildApp(openAqRequest))).body;
      };

      // A third station, stale: dropped by the projection, passed over by the
      // ranking of the full list.
      full.push(station({ id: 9, distance: 10, datetimeLast: { utc: "2017-06-15T10:00:00Z" } }));
      const upstreamAnswer = { meta: { found: 3 }, results: full };

      const fromFull = await answerFrom(upstreamAnswer);
      const fromTrimmed = await answerFrom(
        projectOpenAqStations(upstreamAnswer, { latitude: 40.1, longitude: -75.2 })
      );

      expect(fromTrimmed).toEqual(fromFull);
      expect(fromFull.location).toMatchObject({
        id: 151,
        name: "Tower Hamlets",
        country: "United Kingdom"
      });
      expect(fromFull.pollutants.map((item) => [item.label, item.unit])).toEqual([
        ["PM2.5", "ug/m3"],
        ["Ozone", "ppm"]
      ]);
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

    test("carries the request id on that 502", async () => {
      const openAqRequest = vi
        .fn()
        .mockResolvedValueOnce({ data: { results: [station({ id: null })] }, cache: "miss" });

      const response = await get(buildApp(openAqRequest, { requestId: "req-aq-1" }));

      expect(response.status).toBe(502);
      expect(response.body.requestId).toBe("req-aq-1");
    });
  });

  // A station's datetimeLast covers all its sensors, so a fresh station can
  // carry a PM2.5 sensor that stopped long ago: live on 2026-10-27, London's
  // nearest fresh station, 154 Westminster - Marylebone Road, reported 2.2 h
  // before, but its PM2.5 reading was dated 2026-09-10. The route asks /latest
  // of the nearest candidates in turn, at most three, and takes the first whose
  // PM2.5 reading is itself fresh.
  describe("the walk over candidates", () => {
    const pm25Station = (id, distance, sensorId) =>
      station({ id, name: `Station ${id}`, distance, sensors: [sensor(sensorId, "pm25")] });

    // The calls in order: the station list, each /latest asked in turn (an
    // Error entry rejects), then the hours when given.
    const walk = ({ locations, meta, locationsCache = "miss", latests = [], hours }) => {
      const openAqRequest = vi
        .fn()
        .mockResolvedValueOnce({ data: { meta, results: locations }, cache: locationsCache });
      for (const latest of latests) {
        if (latest instanceof Error) openAqRequest.mockRejectedValueOnce(latest);
        else openAqRequest.mockResolvedValueOnce({ data: { results: latest }, cache: "miss" });
      }
      if (hours) openAqRequest.mockResolvedValueOnce({ data: { results: hours }, cache: "miss" });
      return openAqRequest;
    };
    const failure = (status) => Object.assign(new Error("openaq exploded"), { status });
    const STALE = "2026-01-10T08:00:00Z";

    test("passes over a station whose PM2.5 reading is stale (London)", async () => {
      const openAqRequest = walk({
        locations: [pm25Station(154, 2509, 246), pm25Station(151, 6150, 1510)],
        latests: [[reading(246, 10, STALE)], [reading(1510, 12, "2026-03-02T11:00:00Z")]],
        hours: steadyHours(12)
      });

      const { body } = await get(buildApp(openAqRequest));

      expect(openAqRequest).toHaveBeenNthCalledWith(2, "locations/154/latest");
      expect(openAqRequest).toHaveBeenNthCalledWith(3, "locations/151/latest");
      expect(openAqRequest).toHaveBeenNthCalledWith(4, "sensors/1510/hours", nowCastHoursQuery());
      expect(openAqRequest).toHaveBeenCalledTimes(4);
      expect(body.location).toMatchObject({ id: 151, distanceM: 6150 });
      expect(body.summary.pm25).toBe(12);
      expect(body.summary.aqiUs).toBe(pm25ToUsAqi(12));
    });

    // Absent is stale: a PM2.5 reading that does not say when it was taken is
    // not trusted to be current.
    test.each([
      ["no datetime", undefined],
      ["a null utc", { utc: null }],
      ["an empty datetime", {}],
      ["an unparseable utc", { utc: "x" }]
    ])("passes over a PM2.5 reading with %s", async (_label, datetime) => {
      const undated = { sensorsId: 11, value: 30, datetime };
      const openAqRequest = walk({
        locations: [pm25Station(1, 100, 11), pm25Station(2, 900, 21)],
        latests: [[undated], [reading(21, 12)]],
        hours: steadyHours(12)
      });

      const { body } = await get(buildApp(openAqRequest));

      expect(body.location.id).toBe(2);
      expect(body.summary.pm25).toBe(12);
    });

    test("passes over a station whose latest readings carry no PM2.5", async () => {
      const openAqRequest = walk({
        locations: [station({ id: 1, distance: 100 }), pm25Station(2, 900, 21)],
        latests: [[reading(2, 0.03)], [reading(21, 12)]],
        hours: steadyHours(12)
      });

      const { body } = await get(buildApp(openAqRequest));

      expect(body.location.id).toBe(2);
    });

    test("reads Unknown, asking no hours, when all three PM2.5 readings are stale", async () => {
      const openAqRequest = walk({
        locations: [pm25Station(1, 100, 11), pm25Station(2, 200, 21), pm25Station(3, 300, 31)],
        latests: [[reading(11, 9, STALE)], [reading(21, 9, STALE)], [reading(31, 9, STALE)]]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(200);
      expect(openAqRequest).toHaveBeenCalledTimes(4);
      expect(response.body.fallback).toBeUndefined();
      expect(response.body.location.id).toBeNull();
      expect(response.body.cache).toEqual({
        status: "miss",
        locations: "miss",
        latest: null,
        hours: null
      });
      expect(response.body.summary).toMatchObject({ level: "Unknown", pm25: null, aqiUs: null });
      expect(response.body.pollutants).toEqual([]);
    });

    // Three keeps a lookup to at most five OpenAQ calls (list, three /latest,
    // hours), twelve uncached lookups a minute under OpenAQ's 60 a minute.
    test("asks /latest of three candidates at most, never a fourth", async () => {
      const openAqRequest = walk({
        locations: [
          pm25Station(1, 100, 11),
          pm25Station(2, 200, 21),
          pm25Station(3, 300, 31),
          pm25Station(4, 400, 41)
        ],
        latests: [
          [reading(11, 9, STALE)],
          [reading(21, 9, STALE)],
          [reading(31, 9, STALE)],
          [reading(41, 12)]
        ]
      });

      const { body } = await get(buildApp(openAqRequest));

      expect(openAqRequest).toHaveBeenCalledTimes(4);
      expect(openAqRequest).not.toHaveBeenCalledWith("locations/4/latest");
      expect(body.summary.level).toBe("Unknown");
    });

    // A failed /latest is a miss: one station's error does not stop the walk.
    test("goes on to the next candidate when a /latest request fails", async () => {
      const openAqRequest = walk({
        locations: [pm25Station(1, 100, 11), pm25Station(2, 200, 21)],
        latests: [failure(503), [reading(21, 12)]],
        hours: steadyHours(12)
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(200);
      expect(response.body.fallback).toBeUndefined();
      expect(response.body.location.id).toBe(2);
      expect(response.body.summary.aqiUs).toBe(pm25ToUsAqi(12));
    });

    test("reads Unknown when one /latest fails and the others are stale", async () => {
      const openAqRequest = walk({
        locations: [pm25Station(1, 100, 11), pm25Station(2, 200, 21)],
        latests: [failure(503), [reading(21, 9, STALE)]]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(200);
      expect(response.body.fallback).toBeUndefined();
      expect(response.body.summary.level).toBe("Unknown");
    });

    // When no /latest answered at all, nothing said the stations were stale:
    // it is an outage, answered as the outage fallback (or the error, for a
    // status that is not an outage) exactly as before.
    test("answers the outage fallback when every /latest request fails", async () => {
      const openAqRequest = walk({
        locations: [pm25Station(1, 100, 11), pm25Station(2, 200, 21)],
        latests: [failure(503), failure(502)]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(200);
      expect(response.body.fallback).toBe(true);
      expect(openAqRequest).toHaveBeenCalledTimes(3);
    });

    test("answers a rate-limit error when every /latest request is refused", async () => {
      const openAqRequest = walk({
        locations: [pm25Station(1, 100, 11)],
        latests: [failure(429)]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(429);
    });

    // Nothing can be asked about a station with no usable id, so it costs no
    // call and the walk goes on.
    test("skips a candidate with no usable id without asking about it", async () => {
      const openAqRequest = walk({
        locations: [station({ id: null, distance: 50 }), pm25Station(2, 200, 21)],
        latests: [[reading(21, 12)]],
        hours: steadyHours(12)
      });

      const { body } = await get(buildApp(openAqRequest));

      expect(openAqRequest).toHaveBeenNthCalledWith(2, "locations/2/latest");
      expect(body.location.id).toBe(2);
    });

    // Live on 2026-10-27, meta.found read ">100" for Los Angeles and London at
    // a limit of 100. A list cut short can miss the nearest station, so it is
    // logged, once per answer fetched from OpenAQ rather than per cached read.
    test("warns once when OpenAQ says it holds more stations than it sent", async () => {
      const logger = { info() {}, warn: vi.fn(), error() {} };
      const openAqRequest = walk({
        locations: [pm25Station(1, 100, 11)],
        meta: { found: ">1000" },
        latests: [[reading(11, 12)]],
        hours: steadyHours(12)
      });

      const response = await get(buildApp(openAqRequest, { logger }));

      expect(response.status).toBe(200);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "openaq_locations_truncated",
          found: ">1000",
          returned: 1
        })
      );
    });

    // The cached list has its stale stations dropped, so its length is not what
    // OpenAQ sent; the count the projection recorded is.
    test("judges the list by the count OpenAQ sent, not by the stations kept", async () => {
      const logger = { info() {}, warn: vi.fn(), error() {} };
      const openAqRequest = walk({
        locations: [pm25Station(1, 100, 11)],
        meta: { found: ">1000", returned: 1000 },
        latests: [[reading(11, 12)]],
        hours: steadyHours(12)
      });

      await get(buildApp(openAqRequest, { logger }));

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ found: ">1000", returned: 1000 })
      );
    });

    test.each([
      ["a cached list", { found: ">1000" }, "hit"],
      ["a complete list", { found: 1 }, "miss"],
      ["no count", undefined, "miss"],
      // 287 sent, 286 of them stale and dropped: complete, though only one is kept.
      ["a complete list with stale stations dropped", { found: 287, returned: 287 }, "miss"]
    ])("does not warn for %s", async (_label, meta, locationsCache) => {
      const logger = { info() {}, warn: vi.fn(), error() {} };
      const openAqRequest = walk({
        locations: [pm25Station(1, 100, 11)],
        meta,
        locationsCache,
        latests: [[reading(11, 12)]],
        hours: steadyHours(12)
      });

      await get(buildApp(openAqRequest, { logger }));

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  // Shapes from the live answers for three cities on 2026-10-27: OpenAQ's list
  // is in id order and keeps stations that stopped reporting long ago.
  describe("station choice", () => {
    test("reads from the nearest PM2.5 station still reporting (New York)", async () => {
      const nyc = [
        station({ id: 384, name: "CCNY", distance: 600, datetimeLast: reportedAgo(23.5) }),
        station({ id: 625, name: "Queens", distance: 15700, datetimeLast: reportedAgo(1.5) }),
        station({ id: 626, name: "Midtown", distance: 3300, datetimeLast: reportedAgo(1.5) }),
        station({ id: 628, name: "Brooklyn", distance: 8200, datetimeLast: reportedAgo(1.5) })
      ];
      const openAqRequest = upstream({
        locations: nyc,
        latest: [reading(1, 12)],
        hours: steadyHours(12)
      });

      const { body } = await get(buildApp(openAqRequest));

      expect(openAqRequest).toHaveBeenNthCalledWith(2, "locations/626/latest");
      expect(body.location).toMatchObject({ id: 626, name: "Midtown", distanceM: 3300 });
      expect(body.summary.aqiUs).toBe(pm25ToUsAqi(12));
    });

    test("takes the live station after a dead one (London)", async () => {
      const london = [
        station({
          id: 137,
          name: "Harrow",
          distance: 16300,
          datetimeLast: { utc: "2023-08-01T00:00:00Z" }
        }),
        station({ id: 151, name: "Tower Hamlets", distance: 6150, datetimeLast: reportedAgo(3.5) })
      ];
      const openAqRequest = upstream({ locations: london, latest: [reading(1, 30)] });

      const { body } = await get(buildApp(openAqRequest));

      expect(openAqRequest).toHaveBeenNthCalledWith(2, "locations/151/latest");
      expect(body.location.name).toBe("Tower Hamlets");
    });

    test("reports the distance it worked out when OpenAQ gives none", async () => {
      const openAqRequest = upstream({
        locations: [station({ distance: null, coordinates: { latitude: 41.1, longitude: -75.2 } })],
        latest: [reading(1, 12)]
      });

      const { body } = await get(buildApp(openAqRequest));

      // One degree of latitude north of the requested 40.1, -75.2.
      expect(body.location.distanceM).toBe(111195);
    });

    // Los Angeles: every station listed stopped years ago. Nothing is read, and
    // the answer is Unknown, never a number from a dead sensor.
    test("reads Unknown, asking nothing more, when no station is reporting (Los Angeles)", async () => {
      const la = [
        station({ id: 1575, datetimeLast: { utc: "2017-06-15T10:00:00Z" } }),
        station({
          id: 1576,
          sensors: [sensor(2, "o3", "ppm")],
          datetimeLast: { utc: "2016-01-01T00:00:00Z" }
        })
      ];
      const openAqRequest = upstream({
        locations: la,
        latest: [reading(1, 12)],
        locationsCache: "hit"
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(200);
      expect(openAqRequest).toHaveBeenCalledTimes(1);
      expect(response.body).toEqual({
        cache: { status: "hit", locations: "hit", latest: null, hours: null },
        location: {
          id: null,
          name: "",
          city: "",
          country: "",
          latitude: 40.1,
          longitude: -75.2,
          distanceM: null
        },
        summary: {
          level: "Unknown",
          workoutType: "indoor",
          guidance: aqiBand(null).guidance,
          primaryPollutant: "Unknown",
          pm25: null,
          pm25NowCast: null,
          aqiUs: null
        },
        pollutants: []
      });
    });

    // The station list is cached with its stale stations already dropped, so
    // Los Angeles' list comes back from the cache empty but counted. That is
    // still "stations listed, none reporting": the same 200 Unknown, byte for
    // byte, as the full list cached before the drop, and never the 404.
    test("answers an all-stale list the same whether cached whole or filtered", async () => {
      const la = {
        meta: { found: 2 },
        results: [
          station({ id: 1575, datetimeLast: { utc: "2017-06-15T10:00:00Z" } }),
          station({ id: 1576, datetimeLast: { utc: "2016-01-01T00:00:00Z" } })
        ]
      };
      const answerFrom = async (data) => {
        const openAqRequest = vi.fn().mockResolvedValueOnce({ data, cache: "hit" });
        const response = await get(buildApp(openAqRequest));
        expect(openAqRequest).toHaveBeenCalledTimes(1);
        return response;
      };
      const filtered = projectOpenAqStations(la, { latitude: 40.1, longitude: -75.2 });

      expect(filtered).toEqual({ meta: { found: 2, returned: 2 }, results: [] });
      const fromWhole = await answerFrom(la);
      const fromFiltered = await answerFrom(filtered);

      expect(fromFiltered.status).toBe(200);
      expect(fromFiltered.status).toBe(fromWhole.status);
      expect(fromFiltered.text).toBe(fromWhole.text);
      expect(fromFiltered.body.summary.level).toBe("Unknown");
    });

    test("still answers 404 when OpenAQ listed no station at all", async () => {
      const openAqRequest = vi.fn().mockResolvedValueOnce({
        data: { meta: { found: 0, returned: 0 }, results: [] },
        cache: "miss"
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(404);
      expect(String(response.body?.error)).toMatch(/no nearby air quality station/i);
      expect(openAqRequest).toHaveBeenCalledTimes(1);
    });

    test("reads Unknown when the only fresh station measures no PM2.5", async () => {
      const openAqRequest = upstream({
        locations: [station({ sensors: [sensor(2, "o3", "ppm")] })],
        latest: [reading(2, 0.031)]
      });

      const { body } = await get(buildApp(openAqRequest));

      expect(openAqRequest).toHaveBeenCalledTimes(1);
      // A deliberate answer, not the outage fallback.
      expect(body.fallback).toBeUndefined();
      expect(body.summary.level).toBe("Unknown");
      expect(body.pollutants).toEqual([]);
    });

    test("reads a station that does not say when it last reported as stale", async () => {
      const openAqRequest = upstream({
        locations: [station({ datetimeLast: null })],
        latest: [reading(1, 12)]
      });

      const { body } = await get(buildApp(openAqRequest));

      expect(openAqRequest).toHaveBeenCalledTimes(1);
      expect(body.fallback).toBeUndefined();
      expect(body.summary.aqiUs).toBeNull();
      expect(body.location.id).toBeNull();
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
        latest: [reading(1, 12.4), reading(2, null)]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.pollutants.map((item) => item.code)).toEqual(["pm25"]);
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
      const sensors = Array.from({ length: 20 }, (_, index) =>
        sensor(index + 1, index === 0 ? "pm25" : `p${index + 1}`)
      );
      const openAqRequest = upstream({
        locations: [station({ sensors })],
        latest: sensors.map((item, index) => reading(item.id, index + 1))
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.pollutants).toHaveLength(12);
    });
  });

  describe("summary", () => {
    test("reports the AQI the EPA table gives for the pm2.5 NowCast", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(1, 12)],
        hours: steadyHours(12)
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.summary.pm25).toBe(12);
      expect(response.body.summary.pm25NowCast).toBe(12);
      expect(response.body.summary.aqiUs).toBe(pm25ToUsAqi(12));
      expect(response.body.summary.level).toBe(aqiBand(pm25ToUsAqi(12)).level);
      expect(response.body.summary.primaryPollutant).toBe("PM2.5");
    });

    // OpenAQ spells this parameter several ways. All of them are pm2.5 and all
    // of them must drive the AQI, not just the one spelling.
    test.each(["pm25", "pm2.5", "pm2_5", "pm2p5"])("recognises %s as pm2.5", async (code) => {
      const openAqRequest = upstream({
        locations: [station({ sensors: [sensor(1, code)] })],
        latest: [reading(1, 35)],
        hours: steadyHours(35)
      });

      const response = await get(buildApp(openAqRequest));

      expect(openAqRequest).toHaveBeenNthCalledWith(3, "sensors/1/hours", nowCastHoursQuery());
      expect(response.body.summary.pm25).toBe(35);
      expect(response.body.summary.pm25NowCast).toBe(35);
      expect(response.body.summary.aqiUs).toBe(pm25ToUsAqi(35));
    });

    test("asks for the PM2.5 sensor's hourly means", async () => {
      const openAqRequest = upstream({
        locations: [station({ sensors: [sensor(2, "o3", "ppm"), sensor(7, "pm25")] })],
        latest: [reading(2, 0.03), reading(7, 12)]
      });

      await get(buildApp(openAqRequest));

      expect(openAqRequest).toHaveBeenCalledTimes(3);
      expect(openAqRequest).toHaveBeenNthCalledWith(3, "sensors/7/hours", {
        datetime_from: "2026-03-01T20:00:00.000Z",
        limit: 24
      });
    });

    test("scores the NowCast, not the latest reading", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(1, 5)],
        hours: steadyHours(60)
      });

      const { body } = await get(buildApp(openAqRequest));

      expect(body.summary.pm25).toBe(5);
      expect(body.summary.pm25NowCast).toBe(60);
      expect(body.summary.aqiUs).toBe(pm25ToUsAqi(60));
      expect(body.summary.level).toBe(aqiBand(pm25ToUsAqi(60)).level);
    });

    // Decision 5: a NowCast the method says is not valid reads Unknown, as a
    // station with no PM2.5 does, rather than falling back to the instant value.
    test("reads Unknown when there are too few recent hours", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(1, 5)],
        hours: [hour(0, 60)]
      });

      const { body } = await get(buildApp(openAqRequest));

      expect(body.summary.pm25).toBe(5);
      expect(body.summary.pm25NowCast).toBeNull();
      expect(body.summary.aqiUs).toBeNull();
      expect(body.summary.level).toBe("Unknown");
      expect(body.summary.workoutType).toBe("indoor");
    });

    // Absent is not zero, through the route: three hours with no value are
    // three missing hours, not three hours of clean air.
    test.each([[null], [""], [undefined]])(
      "reads Unknown, not AQI 0, for hours of %j",
      async (absent) => {
        const openAqRequest = upstream({
          locations: [station()],
          latest: [reading(1, 5)],
          hours: steadyHours(absent)
        });

        const { body } = await get(buildApp(openAqRequest));

        expect(body.summary.pm25NowCast).toBeNull();
        expect(body.summary.aqiUs).toBeNull();
        expect(body.summary.level).toBe("Unknown");
      }
    );

    test.each([
      ["no results list", { data: {}, cache: "miss" }],
      ["no data", { cache: "miss" }],
      ["nothing at all", undefined]
    ])("reads Unknown when the hourly answer has %s", async (_name, answer) => {
      const openAqRequest = vi
        .fn()
        .mockResolvedValueOnce({ data: { results: [station()] }, cache: "miss" })
        .mockResolvedValueOnce({ data: { results: [reading(1, 5)] }, cache: "miss" })
        .mockResolvedValueOnce(answer);

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(200);
      expect(response.body.summary.aqiUs).toBeNull();
      expect(response.body.summary.level).toBe("Unknown");
      expect(response.body.summary.pm25).toBe(5);
    });

    // The station and its other readings did arrive, so a failed hourly
    // request degrades this one number rather than the whole answer.
    test("reads Unknown, and still answers, when the hourly request fails", async () => {
      const openAqRequest = vi
        .fn()
        .mockResolvedValueOnce({ data: { results: [station()] }, cache: "miss" })
        .mockResolvedValueOnce({
          data: { results: [reading(1, 5), reading(2, 0.03)] },
          cache: "miss"
        })
        .mockRejectedValueOnce(Object.assign(new Error("openaq exploded"), { status: 502 }));

      const response = await get(buildApp(openAqRequest));

      expect(response.status).toBe(200);
      expect(response.body.fallback).toBeUndefined();
      expect(response.body.summary.level).toBe("Unknown");
      expect(response.body.summary.aqiUs).toBeNull();
      expect(response.body.summary.pm25).toBe(5);
      expect(response.body.pollutants).toHaveLength(2);
      expect(response.body.cache.hours).toBeNull();
    });

    // A station is chosen for its PM2.5 sensor, but its latest readings can
    // still lack one; then there is no sensor to ask hours of.
    test("asks for no hours when the latest readings carry no PM2.5", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(2, 0.03)]
      });

      await get(buildApp(openAqRequest));

      expect(openAqRequest).toHaveBeenCalledTimes(2);
    });

    // A reading can carry its sensor inline rather than by id. Then it says it
    // is PM2.5 but not which sensor, so there is nothing to ask hours of.
    test("asks for no hours when the PM2.5 reading names no sensor id", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [
          {
            value: 12,
            sensor: sensor(undefined, "pm25"),
            datetime: { utc: "2026-03-02T11:00:00Z" }
          }
        ]
      });

      const { body } = await get(buildApp(openAqRequest));

      expect(openAqRequest).toHaveBeenCalledTimes(2);
      expect(body.summary.pm25).toBe(12);
      expect(body.summary.aqiUs).toBeNull();
      expect(body.summary.level).toBe("Unknown");
    });

    test("does not list the sensor id among the pollutants", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(1, 12)],
        hours: steadyHours(12)
      });

      const { body } = await get(buildApp(openAqRequest));

      expect(Object.keys(body.pollutants[0]).sort()).toEqual(
        ["code", "label", "measuredAt", "unit", "value"].sort()
      );
    });

    // With no PM2.5 reading the station is a miss, so its ozone is not
    // reported either: there is no station to speak for.
    test("leaves the AQI null when the latest readings carry no pm2.5", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(2, 0.031)]
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.summary.pm25).toBeNull();
      expect(response.body.summary.aqiUs).toBeNull();
      expect(response.body.summary.primaryPollutant).toBe("Unknown");
      expect(response.body.pollutants).toEqual([]);
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

    // A measured zero is a real reading and must survive the guard above, in
    // the latest reading and in the hours the NowCast is scored from.
    test("keeps a genuine zero reading", async () => {
      const openAqRequest = upstream({
        locations: [station({ sensors: [sensor(1, "pm25")] })],
        latest: [reading(1, 0)],
        hours: steadyHours(0)
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.summary.pm25).toBe(0);
      expect(response.body.summary.pm25NowCast).toBe(0);
      expect(response.body.summary.aqiUs).toBe(0);
      expect(response.body.summary.level).toBe("Good");
    });

    // firstFinite exists to try several payload shapes. A null in the first
    // slot must not stop it reaching the one that has the value.
    test("falls through to a later payload shape when the first is empty", async () => {
      const openAqRequest = upstream({
        locations: [station({ sensors: [sensor(1, "pm25")] })],
        latest: [
          {
            sensorsId: 1,
            value: null,
            summary: { value: 35 },
            datetime: { utc: "2026-03-02T11:00:00Z" }
          }
        ]
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

    test("merges the cache status of all three upstream calls", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(1, 12)],
        locationsCache: "hit",
        latestCache: "stale",
        hoursCache: "hit"
      });

      const response = await get(buildApp(openAqRequest));

      // Stale anywhere makes the whole answer stale.
      expect(response.body.cache).toEqual({
        status: "stale",
        locations: "hit",
        latest: "stale",
        hours: "hit"
      });
    });

    test("counts a stale hourly answer in the merged status", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [reading(1, 12)],
        locationsCache: "hit",
        latestCache: "hit",
        hoursCache: "stale"
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.cache).toEqual({
        status: "stale",
        locations: "hit",
        latest: "hit",
        hours: "stale"
      });
    });

    // A fresh PM2.5 reading that names no sensor id: the station is read, but
    // there is no sensor to ask hours of.
    test("reports no hourly cache status when no hours were asked for", async () => {
      const openAqRequest = upstream({
        locations: [station()],
        latest: [
          {
            value: 12,
            sensor: sensor(undefined, "pm25"),
            datetime: { utc: "2026-03-02T11:00:00Z" }
          }
        ],
        locationsCache: "hit",
        latestCache: "hit"
      });

      const response = await get(buildApp(openAqRequest));

      expect(response.body.cache).toEqual({
        status: "hit",
        locations: "hit",
        latest: "hit",
        hours: null
      });
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
      expect(response.body.summary).toHaveProperty("pm25NowCast", null);
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
