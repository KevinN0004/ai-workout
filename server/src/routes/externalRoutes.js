export const registerExternalRoutes = (app, deps) => {
  const {
    toNullableNumber,
    fetchOpenMeteo,
    toFiniteNumber,
    cleanText,
    weatherCodeToText,
    isUpstreamFailureStatus,
    buildWorkoutRecommendation,
    openAqRequest,
    extractOpenAqMeasurement,
    pm25ToUsAqi,
    aqiBand,
    mergeCacheStatuses,
    openAqParameterLabel,
    wgerRequest,
    mapWgerExercise,
    parseMultiNumberQuery,
    wgerDefaultLanguage,
    mealDbRequest,
    mapMealDbMeal
  } = deps;

  app.get("/api/weather/current", async (req, res) => {
    try {
      const latitude = toNullableNumber(req.query.latitude, -90, 90);
      const longitude = toNullableNumber(req.query.longitude, -180, 180);
      if (latitude === null || longitude === null) {
        return res.status(400).json({ error: "Valid latitude and longitude are required." });
      }

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
      const latitude = toNullableNumber(req.query.latitude, -90, 90);
      const longitude = toNullableNumber(req.query.longitude, -180, 180);
      if (latitude === null || longitude === null) {
        return res.status(400).json({ error: "Valid latitude and longitude are required." });
      }

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

  app.get("/api/air-quality/current", async (req, res) => {
    try {
      const latitude = toNullableNumber(req.query.latitude, -90, 90);
      const longitude = toNullableNumber(req.query.longitude, -180, 180);
      if (latitude === null || longitude === null) {
        return res.status(400).json({ error: "Valid latitude and longitude are required." });
      }

      const radiusKm = toNullableNumber(req.query.radiusKm, 1, 100) ?? 25;
      const locationResponse = await openAqRequest("locations", {
        coordinates: `${latitude},${longitude}`,
        radius: Math.round(radiusKm * 1000),
        limit: 1
      });
      const locationData = locationResponse.data;
      const location = Array.isArray(locationData?.results) ? locationData.results[0] : null;
      if (!location) {
        return res.status(404).json({ error: "No nearby air quality station found." });
      }

      const locationId = toNullableNumber(location?.id, 1, 1000000000);
      if (locationId === null) {
        return res.status(502).json({ error: "OpenAQ response missing location id." });
      }

      const latestResponse = await openAqRequest(`locations/${Math.trunc(locationId)}/latest`);
      const latestData = latestResponse.data;
      const rawReadings = Array.isArray(latestData?.results) ? latestData.results : [];
      const sensorMap = new Map(
        (Array.isArray(location?.sensors) ? location.sensors : []).map((sensor) => [
          String(sensor?.id),
          sensor
        ])
      );
      const byCode = new Map();
      for (const entry of rawReadings) {
        const linkedSensor = sensorMap.get(String(entry?.sensorsId));
        const parsed = extractOpenAqMeasurement({
          ...entry,
          sensor: linkedSensor || entry?.sensor
        });
        if (!parsed.code || parsed.value === null) continue;
        if (!byCode.has(parsed.code)) byCode.set(parsed.code, parsed);
      }
      const pollutants = Array.from(byCode.values()).slice(0, 12);

      const pm25Reading =
        pollutants.find((item) => ["pm25", "pm2.5", "pm2_5", "pm2p5"].includes(item.code)) || null;
      const pm25 = pm25Reading?.value ?? null;
      const aqiUs = pm25ToUsAqi(pm25);
      const recommendation = aqiBand(aqiUs);

      res.json({
        cache: {
          status: mergeCacheStatuses(locationResponse.cache, latestResponse.cache),
          locations: locationResponse.cache,
          latest: latestResponse.cache
        },
        location: {
          id: toFiniteNumber(location?.id),
          name: cleanText(location?.name, 120),
          city: cleanText(location?.city || location?.locality, 120),
          country: cleanText(location?.country?.name || location?.country?.code || "", 80),
          latitude: toFiniteNumber(location?.coordinates?.latitude),
          longitude: toFiniteNumber(location?.coordinates?.longitude),
          distanceM: toFiniteNumber(location?.distance)
        },
        summary: {
          level: recommendation.level,
          workoutType: recommendation.workoutType,
          guidance: recommendation.guidance,
          primaryPollutant:
            pm25Reading?.label ||
            pollutants[0]?.label ||
            openAqParameterLabel(pollutants[0]?.code) ||
            "Unknown",
          pm25,
          aqiUs
        },
        pollutants: pollutants.map((item) => ({
          code: item.code,
          label: item.label || openAqParameterLabel(item.code),
          value: item.value,
          unit: item.unit,
          measuredAt: item.measuredAt
        }))
      });
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        return res.json({
          fallback: true,
          service: "openaq",
          error: err?.message || "Air quality service unavailable.",
          location: {
            id: null,
            name: "",
            city: "",
            country: "",
            latitude: toNullableNumber(req.query.latitude, -90, 90),
            longitude: toNullableNumber(req.query.longitude, -180, 180)
          },
          summary: {
            aqiUs: null,
            pm25: null,
            level: "Unknown",
            workoutType: "indoor",
            guidance: "Air quality data is unavailable. Prefer indoor training."
          },
          pollutants: []
        });
      }
      return res.status(status).json({ error: err?.message || "Server error." });
    }
  });

  app.get("/api/wger/meta", async (req, res) => {
    try {
      const [categoriesResponse, musclesResponse, equipmentResponse] = await Promise.all([
        wgerRequest("exercisecategory/", { query: { limit: 200 } }),
        wgerRequest("muscle/", { query: { limit: 200 } }),
        wgerRequest("equipment/", { query: { limit: 200 } })
      ]);
      const categoriesData = categoriesResponse.data;
      const musclesData = musclesResponse.data;
      const equipmentData = equipmentResponse.data;

      const categories = (Array.isArray(categoriesData?.results) ? categoriesData.results : []).map(
        (item) => ({
          id: item?.id ?? null,
          name: cleanText(item?.name, 120)
        })
      );
      const muscles = (Array.isArray(musclesData?.results) ? musclesData.results : []).map(
        (item) => ({
          id: item?.id ?? null,
          name: cleanText(item?.name_en || item?.name, 120)
        })
      );
      const equipment = (Array.isArray(equipmentData?.results) ? equipmentData.results : []).map(
        (item) => ({
          id: item?.id ?? null,
          name: cleanText(item?.name, 120)
        })
      );

      res.json({
        cache: {
          status: mergeCacheStatuses(
            categoriesResponse.cache,
            musclesResponse.cache,
            equipmentResponse.cache
          ),
          categories: categoriesResponse.cache,
          muscles: musclesResponse.cache,
          equipment: equipmentResponse.cache
        },
        categories,
        muscles,
        equipment
      });
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        return res.json({
          fallback: true,
          service: "wger",
          error: err?.message || "Exercise metadata unavailable.",
          categories: [],
          muscles: [],
          equipment: []
        });
      }
      return res.status(status).json({ error: err?.message || "Server error." });
    }
  });

  app.get("/api/wger/exercises", async (req, res) => {
    try {
      const limit = toNullableNumber(req.query.limit, 1, 80) ?? 15;
      const offset = toNullableNumber(req.query.offset, 0, 5000) ?? 0;
      const language = toNullableNumber(req.query.language, 1, 100) ?? wgerDefaultLanguage;
      const categories = parseMultiNumberQuery(req.query.category, 1, 10000);
      const muscles = parseMultiNumberQuery(req.query.muscle, 1, 10000);
      const equipment = parseMultiNumberQuery(req.query.equipment, 1, 10000);
      const q = cleanText(req.query.q, 120).toLowerCase();
      const upstreamLimit = q ? Math.min(Math.max(limit * 4, 100), 200) : limit;

      const query = {
        limit: upstreamLimit,
        offset,
        language
      };
      if (categories.length) query.category = categories;
      if (muscles.length) query.muscles = muscles;
      if (equipment.length) query.equipment = equipment;

      const { data, cache } = await wgerRequest("exerciseinfo/", { query });
      const exercises = (Array.isArray(data?.results) ? data.results : [])
        .map((item) => mapWgerExercise(item, language))
        .filter((item) => {
          if (!q) return true;
          const haystack = [
            item.name,
            item.description,
            item.category?.name,
            ...(Array.isArray(item.muscles) ? item.muscles.map((m) => m.name) : [])
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
        .slice(0, limit);

      res.json({
        cache,
        count: q ? exercises.length : toFiniteNumber(data?.count) ?? exercises.length,
        next: cleanText(data?.next, 300),
        previous: cleanText(data?.previous, 300),
        limit,
        offset,
        language,
        exercises
      });
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        const limit = toNullableNumber(req.query.limit, 1, 80) ?? 15;
        const offset = toNullableNumber(req.query.offset, 0, 5000) ?? 0;
        const language = toNullableNumber(req.query.language, 1, 100) ?? wgerDefaultLanguage;
        return res.json({
          fallback: true,
          service: "wger",
          error: err?.message || "Exercise search unavailable.",
          count: 0,
          next: "",
          previous: "",
          limit,
          offset,
          language,
          exercises: []
        });
      }
      return res.status(status).json({ error: err?.message || "Server error." });
    }
  });

  app.get("/api/wger/exercises/:id", async (req, res) => {
    try {
      const id = toNullableNumber(req.params.id, 1, 1000000);
      if (id === null) {
        return res.status(400).json({ error: "Valid exercise id is required." });
      }
      const language = toNullableNumber(req.query.language, 1, 100) ?? wgerDefaultLanguage;
      let response = await wgerRequest("exerciseinfo/", {
        query: {
          id: Math.trunc(id),
          language
        }
      });
      let data = response.data;
      const cacheStatuses = [response.cache];
      let source = Array.isArray(data?.results) ? data.results[0] : null;
      if (!source) {
        response = await wgerRequest("exerciseinfo/", {
          query: {
            id: Math.trunc(id)
          }
        });
        data = response.data;
        cacheStatuses.push(response.cache);
        source = Array.isArray(data?.results) ? data.results[0] : null;
      }
      if (!source) return res.status(404).json({ error: "Exercise not found." });
      res.json({
        cache: {
          status: mergeCacheStatuses(...cacheStatuses),
          attempts: cacheStatuses
        },
        exercise: mapWgerExercise(source, language)
      });
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        return res.json({
          fallback: true,
          service: "wger",
          error: err?.message || "Exercise details unavailable.",
          exercise: null
        });
      }
      return res.status(status).json({ error: err?.message || "Server error." });
    }
  });

  app.get("/api/mealdb/search", async (req, res) => {
    try {
      const query = cleanText(req.query.query ?? req.query.q, 100);
      if (!query) {
        return res.status(400).json({ error: "Query is required." });
      }
      const limit = toNullableNumber(req.query.limit, 1, 20) ?? 8;

      const { data, cache } = await mealDbRequest("search.php", { s: query });
      const meals = (Array.isArray(data?.meals) ? data.meals : [])
        .map((item) => mapMealDbMeal(item))
        .filter((item) => item.id && item.title)
        .slice(0, limit);

      res.json({ cache, query, count: meals.length, meals });
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        const query = cleanText(req.query.query ?? req.query.q, 100);
        return res.json({
          fallback: true,
          service: "mealdb",
          error: err?.message || "Meal search unavailable.",
          query,
          count: 0,
          meals: []
        });
      }
      return res.status(status).json({ error: err?.message || "Server error." });
    }
  });
};

