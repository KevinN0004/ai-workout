import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createExternalDataService } from "../externalDataService.js";

// Air-quality maths from externalDataService. These decide whether a user is
// told to train outdoors, so a wrong breakpoint is health advice rather than a
// cosmetic bug -- and nothing covered them before.
//
// Built through the real factory rather than reached through index.js's
// __testables bag, which does not expose these two. The alternative was
// widening a production export to make a test possible; the factory already
// offers a seam, so it is used instead. Every dependency below is a stub: the
// functions under test are pure and touch none of them.
const {
  pm25ToUsAqi,
  pm25NowCast,
  nowCastHoursQuery,
  nearestFreshPm25Station,
  aqiBand,
  isSevereWeatherCode,
  isOutdoorFriendlyNow,
  weatherCodeToText,
  buildWorkoutRecommendation
} = createExternalDataService({
  cleanText: (value, maxLen = 120) =>
    typeof value === "string" ? value.trim().slice(0, maxLen) : "",
  toNullableNumber: (value) => (Number.isFinite(Number(value)) ? Number(value) : null),
  readThroughExternalCache: async () => ({}),
  buildExternalCacheKey: () => "",
  metrics: { externalApiFailures: {}, externalApiRetries: {} },
  logger: { info() {}, warn() {}, error() {} },
  toShortText: (value) => String(value ?? ""),
  recordExternalApiLatency: () => {},
  externalApiRetries: 0,
  externalApiRetryBaseDelayMs: 0
});

describe("pm25ToUsAqi", () => {
  test("returns null rather than a number for absent input", () => {
    expect(pm25ToUsAqi(null)).toBeNull();
    expect(pm25ToUsAqi(undefined)).toBeNull();
    expect(pm25ToUsAqi("")).toBeNull();
  });

  test("returns null for values that are not usable concentrations", () => {
    expect(pm25ToUsAqi("smoggy")).toBeNull();
    expect(pm25ToUsAqi(Number.NaN)).toBeNull();
    expect(pm25ToUsAqi(Number.POSITIVE_INFINITY)).toBeNull();
    expect(pm25ToUsAqi(-1)).toBeNull();
  });

  test("keeps a measured zero, given as a number or a numeric string", () => {
    expect(pm25ToUsAqi(0)).toBe(0);
    expect(pm25ToUsAqi("0")).toBe(0);
  });

  // The EPA's 2024 breakpoints. Each pair is (concentration, published AQI) at
  // the edge of a band, which is where an off-by-one in the table would show.
  test.each([
    [0, 0],
    [9.0, 50],
    [9.1, 51],
    [35.4, 100],
    [35.5, 101],
    [55.4, 150],
    [55.5, 151],
    [125.4, 200],
    [125.5, 201],
    [225.4, 300],
    [225.5, 301],
    [325.4, 500]
  ])("maps %s ug/m3 to AQI %s", (pm25, expected) => {
    expect(pm25ToUsAqi(pm25)).toBe(expected);
  });

  // An unrounded reading between two bands' published edges. Truncating to one
  // decimal, as the EPA does, puts it at the lower band's top.
  test.each([
    [9.05, 50],
    [35.45, 100],
    [55.45, 150],
    [125.45, 200],
    [225.45, 300]
  ])("scores %s ug/m3, between two bands, as AQI %s", (pm25, expected) => {
    expect(pm25ToUsAqi(pm25)).toBe(expected);
  });

  test("interpolates within a band rather than snapping to its edges", () => {
    // Midpoint of the first band: 4.5 ug/m3 sits halfway to AQI 50.
    expect(pm25ToUsAqi(4.5)).toBe(25);
  });

  test("extends the top band's slope past its last breakpoint", () => {
    // 425.3 is one band-width (99.9 ug/m3) past 325.4, so it scores one
    // band-height (199) past 500, and still reads as hazardous.
    expect(pm25ToUsAqi(425.3)).toBe(699);
    expect(aqiBand(pm25ToUsAqi(425.3)).level).toBe("Hazardous");
  });

  test("rises monotonically across the whole range", () => {
    const samples = [0, 5, 9, 20, 35, 50, 80, 125, 200, 230, 325, 400];
    const values = samples.map(pm25ToUsAqi);
    values.forEach((value, index) => {
      if (index === 0) return;
      expect(value).toBeGreaterThanOrEqual(values[index - 1]);
    });
  });
});

// The NowCast reads the clock, so it is pinned. Only Date is faked: nothing
// here waits on a timer.
const NOW = new Date("2026-03-02T12:10:00Z");

// One OpenAQ hourly mean, ending `hoursAgo` whole hours before 12:00Z.
const hour = (hoursAgo, value) => ({
  value,
  period: { datetimeTo: { utc: new Date(Date.UTC(2026, 2, 2, 12 - hoursAgo)).toISOString() } }
});

// Twelve hourly means, newest first; a null is an hour with no value.
const series = (values) => values.map((value, hoursAgo) => hour(hoursAgo, value));

describe("pm25NowCast", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("of a steady twelve hours is that level", () => {
    expect(pm25NowCast(series(Array(12).fill(20)))).toBe(20);
  });

  // The EPA's published examples, so the method is checked against the EPA's
  // answers rather than only against this file's arithmetic.
  //
  // AirNow's worked example ("The NowCast for PM2.5 and PM10", AirNow-Tech
  // forum, 2016): hour 1 is missing, so it is left out of both sums. The
  // weight is 21 / 69.2 = 0.30, floored to 0.5. NowCast 28.409801, truncated
  // to 28.4 ug/m3; the forum converts that to AQI 87.
  test("gives AirNow's worked example, with a missing hour", () => {
    const hours = series([21, null, 35, 49.2, 48.6, 53.7, 66.2, 69.2, 64.9, 50, 43, 34.9]);

    expect(pm25NowCast(hours)).toBe(28.4);
    expect(pm25ToUsAqi(pm25NowCast(hours))).toBe(87);
  });

  // "Computing the NowCast" (Minnesota Pollution Control Agency, after the
  // EPA's Nowcast-formula sample): 50 80 75 90 82 53 64 74 21 10 16 13, oldest
  // first. The weight is 1 - 80 / 90 = 0.11, floored to 0.5; NowCast 17.4.
  test("gives the EPA sample's 17.4 for falling air", () => {
    const oldestFirst = [50, 80, 75, 90, 82, 53, 64, 74, 21, 10, 16, 13];

    expect(pm25NowCast(series(oldestFirst.toReversed()))).toBe(17.4);
  });

  // Rising air, weight floored at 0.5, so the newest hours dominate. With
  // c = 40, 20 and ten hours of 10, the weight is max(10 / 40, 0.5) = 0.5.
  test("leans on the newest hours when the air is changing", () => {
    const values = [40, 20, ...Array(10).fill(10)];
    const weights = Array.from({ length: 12 }, (_, i) => 0.5 ** i);
    const expected =
      values.reduce((s, v, i) => s + v * weights[i], 0) / weights.reduce((a, b) => a + b);

    expect(pm25NowCast(series(values))).toBe(Math.floor(expected * 10) / 10);
  });

  test("uses the range ratio as the weight when it is above one half", () => {
    // min 30, max 40: w = 0.75, and the mean is 36.756..., so 36.7.
    const w = 0.75;
    const expected = (40 + 30 * w + 40 * w * w) / (1 + w + w * w);

    expect(pm25NowCast(series([40, 30, 40]))).toBe(Math.floor(expected * 10) / 10);
    expect(pm25NowCast(series([40, 30, 40]))).toBe(36.7);
  });

  // The EPA truncates to one decimal: 12.19 is 12.1, never 12.2.
  test("truncates to one decimal rather than rounding", () => {
    expect(pm25NowCast(series(Array(12).fill(12.19)))).toBe(12.1);
  });

  // Twelve 12.1s average to 12.099999999999996 in floating point, which a bare
  // floor would truncate to 12.0, AQI 50 instead of 51.
  test.each([0.1, 0.3, 1.1, 12.1])("of a steady %s is that level, not a tenth less", (level) => {
    expect(pm25NowCast(series(Array(12).fill(level)))).toBe(level);
  });

  test("needs two of the three newest hours", () => {
    expect(pm25NowCast([hour(0, 12), hour(3, 12), hour(4, 12)])).toBeNull();
    expect(pm25NowCast([hour(0, 12), hour(2, 12)])).toBe(12);
    expect(pm25NowCast([hour(1, 12), hour(2, 12)])).toBe(12);
  });

  test("is null for a station that stopped reporting", () => {
    expect(pm25NowCast([hour(4, 12), hour(5, 12), hour(6, 12)])).toBeNull();
  });

  // The newest hour counts while it ended within the last four hours: the
  // clock reads 12:10, so an hour ending at 08:10 is just in, 08:09:59 just out.
  test("takes a newest hour that ended exactly four hours ago, and no older", () => {
    const endingAt = (utc, value) => ({ value, period: { datetimeTo: { utc } } });
    const older = [hour(5, 12), hour(6, 12)];

    expect(pm25NowCast([endingAt("2026-03-02T08:10:00Z", 12), ...older])).toBe(12);
    expect(pm25NowCast([endingAt("2026-03-02T08:09:59Z", 12), ...older])).toBeNull();
  });

  // A thirteenth hour of 5, if read, would set w = 5 / 10 = 0.5 and give 9.9.
  test("reads only the twelve hours up to the newest", () => {
    expect(pm25NowCast([...series(Array(12).fill(10)), hour(12, 5)])).toBe(10);
  });

  test("gives the same answer for hours in any order", () => {
    const hours = series([21, null, 35, 49.2, 48.6, 53.7, 66.2, 69.2, 64.9, 50, 43, 34.9]);

    expect(pm25NowCast(hours.toReversed())).toBe(28.4);
    expect(pm25NowCast([...hours.slice(6), ...hours.slice(0, 6)])).toBe(28.4);
  });

  // Absent is not zero: a null, an empty string or a missing value is a missing
  // hour, which neither counts towards two of three nor pulls the mean to 0.
  test.each([[null], [""], [undefined], ["n/a"]])(
    "reads a %j hour as missing, not as 0",
    (absent) => {
      expect(pm25NowCast([hour(0, 30), hour(1, absent), hour(2, 30)])).toBe(30);
      expect(pm25NowCast([hour(0, 30), hour(1, absent), hour(2, absent)])).toBeNull();
    }
  );

  test("reads an hour with no end time as missing", () => {
    const noEnd = [
      { value: 90 },
      { value: 90, period: null },
      { value: 90, period: {} },
      { value: 90, period: { datetimeTo: { utc: null } } },
      { value: 90, period: { datetimeTo: { utc: "yesterday-ish" } } }
    ];

    expect(pm25NowCast([hour(0, 30), ...noEnd, hour(2, 30)])).toBe(30);
    expect(pm25NowCast([hour(0, 30), ...noEnd])).toBeNull();
  });

  test("keeps a measured zero", () => {
    expect(pm25NowCast([hour(0, 0), hour(1, 0), hour(2, 0)])).toBe(0);
    expect(pm25ToUsAqi(pm25NowCast([hour(0, 0), hour(1, 0), hour(2, 0)]))).toBe(0);
  });

  test("reads a negative hour as a sensor fault, missing", () => {
    expect(pm25NowCast([hour(0, 30), hour(1, -5), hour(2, 30)])).toBe(30);
  });

  test.each([[undefined], [null], ["not a list"], [[]], [[{ value: 10 }]], [[null]]])(
    "is null for %j",
    (hours) => {
      expect(pm25NowCast(hours)).toBeNull();
    }
  );
});

describe("nowCastHoursQuery", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Twelve hours behind a newest hour that may be four hours old, floored to
  // the hour, so every lookup within one hour asks the same thing and hits the
  // same cache entry.
  test("asks from sixteen hours before the current hour", () => {
    expect(nowCastHoursQuery()).toEqual({ datetime_from: "2026-03-01T20:00:00.000Z", limit: 24 });
  });

  test("asks the same thing all hour", () => {
    const at = (utc) => nowCastHoursQuery(Date.parse(utc));

    expect(at("2026-03-02T12:00:00Z")).toEqual(at("2026-03-02T12:59:59Z"));
    expect(at("2026-03-02T13:00:00Z")).not.toEqual(at("2026-03-02T12:59:59Z"));
  });
});

// OpenAQ's /v3/locations answers in id order, not by distance, and does not
// filter out stations that stopped reporting. These fixtures follow the shape
// of the live answers for New York, Los Angeles and London on 2026-10-27, with
// illustrative positions and the clock pinned at 12:10Z.
const AT = Date.parse("2026-03-02T12:10:00Z");
const hoursBefore = (hours) => new Date(AT - hours * 3600000).toISOString();
const candidate = ({ id, sensors = ["pm25"], last, latitude, longitude, distance = null }) => ({
  id,
  name: `Station ${id}`,
  coordinates: { latitude, longitude },
  distance,
  datetimeLast: { utc: last, local: last },
  sensors: sensors.map((name, i) => ({ id: id * 10 + i, parameter: { name, units: "ug/m3" } }))
});

describe("nearestFreshPm25Station", () => {
  const NYC = { latitude: 40.7128, longitude: -74.006 };
  const LA = { latitude: 34.0522, longitude: -118.2437 };
  const LONDON = { latitude: 51.5074, longitude: -0.1278 };
  const pick = (locations, origin = NYC, nowMs = AT) =>
    nearestFreshPm25Station(locations, origin, nowMs);

  // New York: the first PM2.5 station OpenAQ lists, and the nearest, stopped
  // 23.5 hours ago; three others reported 1.5 hours ago.
  test("passes over a nearer station that stopped reporting (New York)", () => {
    const nyc = [
      candidate({ id: 384, last: hoursBefore(23.5), latitude: 40.715, longitude: -74.0 }),
      candidate({ id: 625, last: hoursBefore(1.5), latitude: 40.736, longitude: -73.822 }),
      candidate({ id: 626, last: hoursBefore(1.5), latitude: 40.74, longitude: -73.99 }),
      candidate({ id: 628, last: hoursBefore(1.5), latitude: 40.64, longitude: -74.02 })
    ];

    expect(pick(nyc)).toEqual({ station: nyc[2], distanceM: 3311 });
  });

  // Los Angeles: every station listed stopped years ago.
  test("finds nothing when every station is stale (Los Angeles)", () => {
    const la = [
      candidate({ id: 1575, last: "2017-06-15T10:00:00Z", latitude: 34.06, longitude: -118.23 }),
      candidate({
        id: 1576,
        sensors: ["o3"],
        last: "2016-01-01T00:00:00Z",
        latitude: 34.1,
        longitude: -118.2
      }),
      candidate({
        id: 1580,
        sensors: ["no2"],
        last: "2018-03-01T00:00:00Z",
        latitude: 34.0,
        longitude: -118.3
      })
    ];

    expect(pick(la, LA)).toBeNull();
  });

  // London: the first PM2.5 station listed went quiet in 2023.
  test("takes the live station after a dead one (London)", () => {
    const london = [
      candidate({ id: 137, last: "2023-08-01T00:00:00Z", latitude: 51.5774, longitude: -0.3345 }),
      candidate({ id: 151, last: hoursBefore(3.5), latitude: 51.5225, longitude: -0.0423 })
    ];

    expect(pick(london, LONDON)).toEqual({ station: london[1], distanceM: 6150 });
  });

  test("ranks by OpenAQ's distance when it gives one, not by list order", () => {
    const far = candidate({ id: 1, last: hoursBefore(1), distance: 9000 });
    const near = candidate({ id: 2, last: hoursBefore(1), distance: 2500 });

    expect(pick([far, near])).toEqual({ station: near, distanceM: 2500 });
  });

  test("passes over a station with no PM2.5 sensor, however near and fresh", () => {
    const ozone = candidate({
      id: 1,
      sensors: ["o3", "no2"],
      last: hoursBefore(0.5),
      distance: 10
    });
    const pm = candidate({ id: 2, sensors: ["o3", "pm25"], last: hoursBefore(1), distance: 5000 });

    expect(pick([ozone, pm])?.station).toBe(pm);
    expect(pick([ozone])).toBeNull();
    expect(pick([candidate({ id: 3, sensors: [], last: hoursBefore(1), distance: 1 })])).toBeNull();
  });

  test.each(["pm25", "pm2.5", "pm2_5", "pm2p5", "PM2.5"])("counts a %s sensor as PM2.5", (name) => {
    const station = candidate({ id: 1, sensors: [name], last: hoursBefore(1), distance: 100 });

    expect(pick([station])?.station).toBe(station);
  });

  // Absent is stale, never fresh: a station that does not say when it last
  // reported is not trusted to be reporting now.
  test.each([
    ["no datetimeLast", (s) => delete s.datetimeLast],
    ["a null datetimeLast", (s) => (s.datetimeLast = null)],
    ["an empty datetimeLast", (s) => (s.datetimeLast = {})],
    ["a null utc", (s) => (s.datetimeLast = { utc: null, local: null })],
    ["an empty utc", (s) => (s.datetimeLast = { utc: "" })],
    ["an unparseable utc", (s) => (s.datetimeLast = { utc: "recently" })]
  ])("reads %s as stale", (_label, strip) => {
    const unknown = candidate({ id: 1, last: hoursBefore(0), distance: 100 });
    strip(unknown);
    const fresh = candidate({ id: 2, last: hoursBefore(2), distance: 9000 });

    expect(pick([unknown, fresh])?.station).toBe(fresh);
    expect(pick([unknown])).toBeNull();
  });

  // The same four hours NowCast allows its newest hour: at 12:10, a station
  // last reporting at 08:10 is just fresh, 08:09:59 just stale.
  test("keeps a station that reported exactly four hours ago, and no older", () => {
    const at = (utc) => [candidate({ id: 1, last: utc, distance: 100 })];

    expect(pick(at("2026-03-02T08:10:00Z"))).not.toBeNull();
    expect(pick(at("2026-03-02T08:09:59Z"))).toBeNull();
  });

  test("works out the distance from the station's position when OpenAQ gives none", () => {
    const station = candidate({ id: 1, last: hoursBefore(1), latitude: 41, longitude: -75 });

    // One degree of latitude on a sphere of the Earth's mean radius.
    expect(pick([station], { latitude: 40, longitude: -75 })).toEqual({
      station,
      distanceM: 111195
    });
  });

  // Absent is not zero: a missing distance must not rank as 0 metres, nearest
  // of all. Each of these falls back to the station's position instead.
  test.each([[null], [""], [undefined], ["near"], [-5]])(
    "reads a %j distance as unknown, not as 0",
    (distance) => {
      const unsure = candidate({ id: 1, last: hoursBefore(1), latitude: 40.8, longitude: -74.006 });
      unsure.distance = distance;
      const measured = candidate({ id: 2, last: hoursBefore(1), distance: 5000 });

      expect(pick([unsure, measured])?.station).toBe(measured);
    }
  );

  // A position of null, null must not read as 0, 0. From (0.05, 0.05) the
  // point 0, 0 is 7.9 km away, nearer than the 16.7 km station beside it.
  test.each([
    ["null coordinates", { latitude: null, longitude: null }],
    ["empty coordinates", { latitude: "", longitude: "" }],
    ["no coordinates", undefined],
    ["coordinates off the globe", { latitude: 200, longitude: 0 }],
    ["half a position", { latitude: 0, longitude: null }]
  ])("sorts a station with %s after every station with a position", (_label, coordinates) => {
    const origin = { latitude: 0.05, longitude: 0.05 };
    const lost = candidate({ id: 1, last: hoursBefore(1) });
    lost.coordinates = coordinates;
    const placed = candidate({ id: 2, last: hoursBefore(1), latitude: 0.2, longitude: 0.05 });

    expect(pick([lost, placed], origin)).toEqual({ station: placed, distanceM: 16679 });
    expect(pick([placed, lost], origin)).toEqual({ station: placed, distanceM: 16679 });
    // Alone, it is still a fresh PM2.5 station, with no distance to report.
    expect(pick([lost], origin)).toEqual({ station: lost, distanceM: null });
  });

  test("sorts every station after one with a position when the origin has none", () => {
    const station = candidate({ id: 1, last: hoursBefore(1), latitude: 40, longitude: -75 });

    expect(pick([station], { latitude: null, longitude: null })).toEqual({
      station,
      distanceM: null
    });
  });

  // Equal distances: the station that reported more recently wins, and then
  // the order OpenAQ listed them in.
  test("breaks a tie in distance by the more recent report, then by list order", () => {
    const older = candidate({ id: 1, last: hoursBefore(3), distance: 4000 });
    const newer = candidate({ id: 2, last: hoursBefore(1), distance: 4000 });
    const twin = candidate({ id: 3, last: hoursBefore(1), distance: 4000 });

    expect(pick([older, newer])?.station).toBe(newer);
    expect(pick([newer, older])?.station).toBe(newer);
    expect(pick([twin, newer])?.station).toBe(twin);
  });

  test.each([[undefined], [null], ["not a list"], [[]], [[null]], [[{}]]])(
    "is null for %j",
    (locations) => {
      expect(pick(locations)).toBeNull();
    }
  );

  test("reads the clock when no time is given", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AT);
    try {
      const station = candidate({ id: 1, last: hoursBefore(1), distance: 100 });

      expect(nearestFreshPm25Station([station], NYC)?.station).toBe(station);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("aqiBand", () => {
  test("treats missing or unusable input as unknown, and keeps training indoors", () => {
    [null, undefined, "", "bad", Number.NaN].forEach((input) => {
      const band = aqiBand(input);
      expect(band.level).toBe("Unknown");
      expect(band.workoutType).toBe("indoor");
    });
  });

  // Outdoor is only advised up to 100. Above that the recommendation flips,
  // which is the property that actually matters to a user.
  test.each([
    [0, "Good", "outdoor"],
    [50, "Good", "outdoor"],
    [51, "Moderate", "outdoor"],
    [100, "Moderate", "outdoor"],
    [101, "Unhealthy for sensitive groups", "indoor"],
    [150, "Unhealthy for sensitive groups", "indoor"],
    [151, "Unhealthy", "indoor"],
    [200, "Unhealthy", "indoor"],
    [201, "Very unhealthy", "indoor"],
    [300, "Very unhealthy", "indoor"],
    [301, "Hazardous", "indoor"],
    [900, "Hazardous", "indoor"]
  ])("AQI %s is %s and advises %s", (aqi, level, workoutType) => {
    const band = aqiBand(aqi);
    expect(band.level).toBe(level);
    expect(band.workoutType).toBe(workoutType);
  });

  test("never advises outdoor training above the moderate threshold", () => {
    for (let aqi = 101; aqi <= 500; aqi += 7) {
      expect(aqiBand(aqi).workoutType).toBe("indoor");
    }
  });

  test("always returns guidance text to show the user", () => {
    [null, 0, 75, 175, 400].forEach((aqi) => {
      expect(typeof aqiBand(aqi).guidance).toBe("string");
      expect(aqiBand(aqi).guidance.length).toBeGreaterThan(0);
    });
  });
});

describe("weather safety helpers", () => {
  test("isSevereWeatherCode flags thunderstorm and heavy-precipitation codes", () => {
    // 95-99 are thunderstorm codes in the WMO table Open-Meteo uses.
    expect(isSevereWeatherCode(95)).toBe(true);
    expect(isSevereWeatherCode(99)).toBe(true);
    // 0 is clear sky.
    expect(isSevereWeatherCode(0)).toBe(false);
  });

  test("isSevereWeatherCode does not throw on junk", () => {
    expect(() => isSevereWeatherCode(null)).not.toThrow();
    expect(() => isSevereWeatherCode("storm")).not.toThrow();
    expect(() => isSevereWeatherCode(undefined)).not.toThrow();
  });

  // Field names are the Open-Meteo snake_case keys, not camelCase. Passing
  // camelCase silently reads undefined and every gate is skipped, so these
  // tests double as a guard on the key names the parser expects.
  test("isOutdoorFriendlyNow rejects severe weather even in pleasant temperatures", () => {
    expect(isOutdoorFriendlyNow({ temperature_2m: 20, weather_code: 95 })).toBe(false);
    expect(isOutdoorFriendlyNow({ temperature_2m: 20, weather_code: 96 })).toBe(false);
    expect(isOutdoorFriendlyNow({ temperature_2m: 20, weather_code: 99 })).toBe(false);
  });

  test("isOutdoorFriendlyNow accepts a mild, calm, dry reading", () => {
    expect(
      isOutdoorFriendlyNow({
        temperature_2m: 18,
        wind_speed_10m: 8,
        precipitation: 0,
        weather_code: 0
      })
    ).toBe(true);
  });

  test.each([
    ["too cold", { temperature_2m: 2 }],
    ["too hot", { temperature_2m: 35 }],
    ["too windy", { wind_speed_10m: 33 }],
    ["raining", { precipitation: 1.0 }]
  ])("isOutdoorFriendlyNow rejects a reading that is %s", (_label, reading) => {
    expect(isOutdoorFriendlyNow(reading)).toBe(false);
  });

  test.each([
    ["at the cold limit", { temperature_2m: 3 }],
    ["at the hot limit", { temperature_2m: 34 }],
    ["at the wind limit", { wind_speed_10m: 32 }],
    ["just under raining", { precipitation: 0.9 }]
  ])("isOutdoorFriendlyNow still accepts a reading %s", (_label, reading) => {
    expect(isOutdoorFriendlyNow(reading)).toBe(true);
  });

  test("isOutdoorFriendlyNow tolerates an empty or partial reading", () => {
    expect(isOutdoorFriendlyNow()).toBe(true);
    expect(isOutdoorFriendlyNow({})).toBe(true);
    expect(() => isOutdoorFriendlyNow({ temperature_2m: "warm" })).not.toThrow();
  });

  // Open-Meteo omits a variable it has no value for on some models and sends an
  // explicit null on others. Both mean the same thing -- no reading -- so both
  // have to answer the same way. Every gate in the function is written as
  // `value !== null && ...`, which says the intent plainly.
  describe("a missing reading is missing however it arrives", () => {
    test.each([
      ["temperature", "temperature_2m"],
      ["wind", "wind_speed_10m"],
      ["precipitation", "precipitation"],
      ["weather code", "weather_code"]
    ])("an explicit null %s reads the same as an absent one", (_label, key) => {
      expect(isOutdoorFriendlyNow({ [key]: null })).toBe(isOutdoorFriendlyNow({}));
    });

    // The whole-payload case, which is what a degraded upstream actually sends.
    test("a reading of nothing but nulls is not treated as freezing", () => {
      expect(
        isOutdoorFriendlyNow({
          temperature_2m: null,
          wind_speed_10m: null,
          precipitation: null,
          weather_code: null
        })
      ).toBe(true);
    });

    // An empty string is the other way upstreams spell "no value", and
    // Number("") is 0 just as Number(null) is.
    test("an empty-string temperature is not treated as freezing", () => {
      expect(isOutdoorFriendlyNow({ temperature_2m: "" })).toBe(true);
    });

    // Guarding the fix from the other side: a real zero still means zero, and
    // 0C is genuinely below the cold limit.
    test("a measured zero is still a measurement", () => {
      expect(isOutdoorFriendlyNow({ temperature_2m: 0 })).toBe(false);
      expect(isOutdoorFriendlyNow({ precipitation: 0 })).toBe(true);
    });
  });
});

describe("buildWorkoutRecommendation", () => {
  // buildWorkoutRecommendation opens with `weatherCode === null ? "Unknown"`,
  // so the author plainly meant a missing code to read as unknown. Weather code
  // 0 is "Clear sky", and Number(null) is 0, so that branch could not fire for
  // the input it was written for: a null code reported clear skies.
  test("calls a missing weather code unknown rather than clear sky", () => {
    expect(buildWorkoutRecommendation({ weather_code: null }).weatherText).toBe("Unknown");
    expect(buildWorkoutRecommendation({}).weatherText).toBe("Unknown");
  });

  test("still names a real clear-sky code", () => {
    expect(buildWorkoutRecommendation({ weather_code: 0 }).weatherText).toBe("Clear sky");
  });

  // buildWorkoutRecommendation guards the null itself, so it was fixed by that
  // guard alone. weatherCodeToText still coerced with Number() internally, and
  // the weather routes call it with the raw upstream value rather than through
  // toFiniteNumber -- so the same "null is Clear sky" reading survived there
  // after it had been fixed here. These pin the helper directly.
  describe("weatherCodeToText", () => {
    test.each([
      ["null", null],
      ["undefined", undefined],
      ["an empty string", ""]
    ])("calls %s unknown rather than clear sky", (_label, code) => {
      expect(weatherCodeToText(code)).toBe("Unknown");
    });

    test("still reads a real code 0 as clear sky", () => {
      expect(weatherCodeToText(0)).toBe("Clear sky");
      expect(weatherCodeToText("0")).toBe("Clear sky");
    });

    test.each([
      [3, "Partly cloudy"],
      [45, "Fog"],
      [51, "Drizzle"],
      [61, "Rain"],
      [71, "Snow"],
      [95, "Thunderstorm"]
    ])("maps code %i to %s", (code, text) => {
      expect(weatherCodeToText(code)).toBe(text);
    });

    test("calls an unrecognised code unknown", () => {
      expect(weatherCodeToText(4242)).toBe("Unknown");
      expect(weatherCodeToText("sunny")).toBe("Unknown");
    });
  });

  // The same null-is-zero read put a "too cold" reason on a payload that
  // carried no temperature at all.
  test("gives no temperature reason when no temperature was reported", () => {
    const reasons = buildWorkoutRecommendation({ temperature_2m: null }).reasons;
    expect(reasons.join(" ")).not.toMatch(/temperature/i);
  });

  test("still gives a temperature reason for a real cold reading", () => {
    const reasons = buildWorkoutRecommendation({ temperature_2m: 2 }).reasons;
    expect(reasons.join(" ")).toMatch(/temperature/i);
  });
});
