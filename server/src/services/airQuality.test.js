import { describe, expect, test } from "vitest";
import { createExternalDataService } from "./externalDataService.js";

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
  aqiBand,
  isSevereWeatherCode,
  isOutdoorFriendlyNow,
  weatherCodeToText,
  buildWorkoutRecommendation
} =
  createExternalDataService({
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

  // The EPA breakpoints. Each pair is (concentration, published AQI) at the
  // edge of a band, which is where an off-by-one in the table would show.
  test.each([
    [0, 0],
    [12.0, 50],
    [12.1, 51],
    [35.4, 100],
    [35.5, 101],
    [55.4, 150],
    [55.5, 151],
    [150.4, 200],
    [150.5, 201],
    [250.4, 300],
    [250.5, 301],
    [500.4, 500]
  ])("maps %s ug/m3 to AQI %s", (pm25, expected) => {
    expect(pm25ToUsAqi(pm25)).toBe(expected);
  });

  test("interpolates within a band rather than snapping to its edges", () => {
    // Midpoint of the first band: 6.0 ug/m3 sits halfway to AQI 50.
    expect(pm25ToUsAqi(6)).toBe(25);
  });

  test("caps at 500 for concentrations past the top of the table", () => {
    expect(pm25ToUsAqi(9999)).toBe(500);
  });

  test("rises monotonically across the whole range", () => {
    const samples = [0, 5, 12, 20, 35, 50, 80, 150, 200, 260, 400, 500];
    const values = samples.map(pm25ToUsAqi);
    values.forEach((value, index) => {
      if (index === 0) return;
      expect(value).toBeGreaterThanOrEqual(values[index - 1]);
    });
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
