import { coordinateQuerySchema, validateQuery } from "./validation.js";

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

      const { data, cache } = await fetchOpenMeteo({
        latitude,
        longitude,
        current:
          "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,is_day"
      });

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
          isDay: Number(current.is_day) === 1,
          weatherCode: toFiniteNumber(current.weather_code),
          weatherText: weatherCodeToText(current.weather_code)
        }
      });
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        return res.json({
          fallback: true,
          service: "open-meteo",
          error: err?.message || "Weather service unavailable.",
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
      return res.status(status).json({ error: err?.message || "Server error." });
    }
  });

  app.get("/api/weather/recommendation", async (req, res) => {
    try {
      const query = validateQuery(req, res, coordinateQuerySchema, {
        message: "Valid latitude and longitude are required."
      });
      if (!query) return;
      const { latitude, longitude } = query;

      const { data, cache } = await fetchOpenMeteo({
        latitude,
        longitude,
        current:
          "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,is_day",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum"
      });

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
          isDay: Number(current.is_day) === 1,
          weatherCode: toFiniteNumber(current.weather_code),
          weatherText: weatherCodeToText(current.weather_code)
        },
        recommendation,
        daily
      });
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        return res.json({
          fallback: true,
          service: "open-meteo",
          error: err?.message || "Weather recommendation unavailable.",
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
      return res.status(status).json({ error: err?.message || "Server error." });
    }
  });
};
