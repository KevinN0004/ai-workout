/**
 * The Open-Meteo routes: current conditions, and current conditions with a
 * training recommendation and a daily forecast. Registered by externalRoutes.js.
 */
import { coordinateQuerySchema, validateQuery } from "./validation.js";
import { sendErrorResponse } from "../../services/http/errorResponseService.js";

// `is_day` is a 0/1 flag rather than a measurement, so it does not go through
// `toFiniteNumber` -- but it needs the same absent guard for the same reason.
// `Number(null)` is 0 and `0 === 1` is false, so without the guard a payload
// whose readings are all null would report a confident "night" beside a null
// `weatherCode`, and disagree with the fallback branch, which reports
// `isDay: null`.
//
// A value that is present but is not the flag (2, "yes") is still an answer,
// and it is still not daytime.
const toDayFlag = (value) => {
  if (value === null || value === undefined || value === "") return null;
  return Number(value) === 1;
};

/**
 * Registers GET /api/weather/current and GET /api/weather/recommendation. Every
 * numeric reading goes through `toFiniteNumber`, and `isDay` through `toDayFlag`,
 * so a reading Open-Meteo leaves out comes back null rather than 0.
 */
export const registerWeatherRoutes = (app, deps) => {
  const {
    toNullableNumber,
    fetchOpenMeteo,
    toFiniteNumber,
    cleanText,
    weatherCodeToText,
    isUpstreamFailureStatus,
    buildWorkoutRecommendation
  } = deps;

  app.get("/api/weather/current", async (req, res) => {
    try {
      const query = validateQuery(req, res, coordinateQuerySchema, {
        message: "Valid latitude and longitude are required."
      });
      if (!query) return;
      const { latitude, longitude } = query;

      // Load the current conditions only.
      const { data, cache } = await fetchOpenMeteo({
        latitude,
        longitude,
        current:
          "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,is_day"
      });

      // Rename Open-Meteo's fields to this API's, whose names carry the units
      // (temperatureC, windSpeedKmh).
      const current = data?.current || {};
      res.json({
        cache,
        location: {
          latitude: toFiniteNumber(data?.latitude),
          longitude: toFiniteNumber(data?.longitude),
          timezone: cleanText(data?.timezone, 80)
        },
        current: {
          time: cleanText(current.time, 40),
          temperatureC: toFiniteNumber(current.temperature_2m),
          apparentTemperatureC: toFiniteNumber(current.apparent_temperature),
          precipitationMm: toFiniteNumber(current.precipitation),
          windSpeedKmh: toFiniteNumber(current.wind_speed_10m),
          humidityPct: toFiniteNumber(current.relative_humidity_2m),
          isDay: toDayFlag(current.is_day),
          weatherCode: toFiniteNumber(current.weather_code),
          weatherText: weatherCodeToText(current.weather_code)
        }
      });
    } catch (err) {
      // An outage (any status isUpstreamFailureStatus accepts; an error with no
      // status counts as 500) answers 200 with every reading null.
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        return res.json({
          fallback: true,
          service: "open-meteo",
          error: "Weather service unavailable.",
          location: {
            latitude: toNullableNumber(req.query.latitude, -90, 90),
            longitude: toNullableNumber(req.query.longitude, -180, 180),
            timezone: ""
          },
          current: {
            time: "",
            temperatureC: null,
            apparentTemperatureC: null,
            precipitationMm: null,
            windSpeedKmh: null,
            humidityPct: null,
            isDay: null,
            weatherCode: null,
            weatherText: "Unknown"
          }
        });
      }
      return sendErrorResponse(req, res, err, status);
    }
  });

  app.get("/api/weather/recommendation", async (req, res) => {
    try {
      const query = validateQuery(req, res, coordinateQuerySchema, {
        message: "Valid latitude and longitude are required."
      });
      if (!query) return;
      const { latitude, longitude } = query;

      // Load the current conditions and the daily forecast in one request.
      const { data, cache } = await fetchOpenMeteo({
        latitude,
        longitude,
        current:
          "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,is_day",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum"
      });

      // Compute the recommendation from the current conditions, and one row per
      // forecast day from Open-Meteo's parallel daily arrays.
      const current = data?.current || {};
      const recommendation = buildWorkoutRecommendation(current);
      const days = Array.isArray(data?.daily?.time) ? data.daily.time.length : 0;
      const daily = [];
      for (let i = 0; i < days; i += 1) {
        daily.push({
          date: cleanText(data.daily.time[i], 20),
          weatherCode: toFiniteNumber(data.daily.weather_code?.[i]),
          weatherText: weatherCodeToText(data.daily.weather_code?.[i]),
          tempMaxC: toFiniteNumber(data.daily.temperature_2m_max?.[i]),
          tempMinC: toFiniteNumber(data.daily.temperature_2m_min?.[i]),
          precipitationMm: toFiniteNumber(data.daily.precipitation_sum?.[i])
        });
      }

      res.json({
        cache,
        location: {
          latitude: toFiniteNumber(data?.latitude),
          longitude: toFiniteNumber(data?.longitude),
          timezone: cleanText(data?.timezone, 80)
        },
        current: {
          time: cleanText(current.time, 40),
          temperatureC: toFiniteNumber(current.temperature_2m),
          apparentTemperatureC: toFiniteNumber(current.apparent_temperature),
          precipitationMm: toFiniteNumber(current.precipitation),
          windSpeedKmh: toFiniteNumber(current.wind_speed_10m),
          humidityPct: toFiniteNumber(current.relative_humidity_2m),
          isDay: toDayFlag(current.is_day),
          weatherCode: toFiniteNumber(current.weather_code),
          weatherText: weatherCodeToText(current.weather_code)
        },
        recommendation,
        daily
      });
    } catch (err) {
      // An outage (any status isUpstreamFailureStatus accepts; an error with no
      // status counts as 500) answers 200 with every reading null, no forecast,
      // and a recommendation to train indoors.
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        return res.json({
          fallback: true,
          service: "open-meteo",
          error: "Weather recommendation unavailable.",
          location: {
            latitude: toNullableNumber(req.query.latitude, -90, 90),
            longitude: toNullableNumber(req.query.longitude, -180, 180),
            timezone: ""
          },
          current: {
            time: "",
            temperatureC: null,
            apparentTemperatureC: null,
            precipitationMm: null,
            windSpeedKmh: null,
            humidityPct: null,
            isDay: null,
            weatherCode: null,
            weatherText: "Unknown"
          },
          recommendation: {
            workoutType: "indoor",
            summary: "Weather service is unavailable. Indoor session is recommended.",
            reasons: ["Weather data unavailable."],
            weatherText: "Unknown"
          },
          daily: []
        });
      }
      return sendErrorResponse(req, res, err, status);
    }
  });
};
