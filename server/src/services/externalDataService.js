export const createExternalDataService = ({
  cleanText,
  toNullableNumber,
  readThroughExternalCache,
  buildExternalCacheKey,
  metrics,
  logger,
  toShortText,
  recordExternalApiLatency,
  externalApiRetries,
  externalApiRetryBaseDelayMs,
  openMeteoBaseUrl,
  openMeteoTimeoutMs,
  openMeteoCacheTtlSec,
  openAqBaseUrl,
  openAqApiKey,
  openAqTimeoutMs,
  openAqCacheTtlSec,
  wgerBaseUrl,
  wgerApiToken,
  wgerDefaultLanguage,
  wgerTimeoutMs,
  wgerCacheTtlSec,
  mealDbBaseUrl,
  mealDbTimeoutMs,
  mealDbCacheTtlSec
}) => {
  const toFiniteNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const weatherCodeToText = (code) => {
    const value = Number(code);
    if (value === 0) return "Clear sky";
    if ([1, 2, 3].includes(value)) return "Partly cloudy";
    if ([45, 48].includes(value)) return "Fog";
    if ([51, 53, 55, 56, 57].includes(value)) return "Drizzle";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return "Rain";
    if ([71, 73, 75, 77, 85, 86].includes(value)) return "Snow";
    if ([95, 96, 99].includes(value)) return "Thunderstorm";
    return "Unknown";
  };

  const isSevereWeatherCode = (code) => [95, 96, 99].includes(Number(code));

  const isOutdoorFriendlyNow = (current = {}) => {
    const temperature = toFiniteNumber(current.temperature_2m);
    const wind = toFiniteNumber(current.wind_speed_10m);
    const precipitation = toFiniteNumber(current.precipitation);
    const weatherCode = toFiniteNumber(current.weather_code);

    if (weatherCode !== null && isSevereWeatherCode(weatherCode)) return false;
    if (temperature !== null && (temperature < 3 || temperature > 34)) return false;
    if (wind !== null && wind > 32) return false;
    if (precipitation !== null && precipitation >= 1.0) return false;
    return true;
  };

  const buildWorkoutRecommendation = (current = {}) => {
    const reasons = [];
    const weatherCode = toFiniteNumber(current.weather_code);
    const weatherText = weatherCode === null ? "Unknown" : weatherCodeToText(weatherCode);
    const temperature = toFiniteNumber(current.temperature_2m);
    const wind = toFiniteNumber(current.wind_speed_10m);
    const precipitation = toFiniteNumber(current.precipitation);
    const outdoorFriendly = isOutdoorFriendlyNow(current);

    if (temperature !== null && (temperature < 8 || temperature > 30)) {
      reasons.push("Temperature is outside a comfortable outdoor training range.");
    }
    if (wind !== null && wind > 25) {
      reasons.push("Wind is high, which can make runs and cycling harder.");
    }
    if (precipitation !== null && precipitation >= 0.5) {
      reasons.push("Precipitation is present.");
    }
    if (weatherCode !== null && isSevereWeatherCode(weatherCode)) {
      reasons.push("Storm conditions detected.");
    }
    if (!reasons.length) {
      reasons.push("Weather looks suitable for outdoor training.");
    }

    return {
      workoutType: outdoorFriendly ? "outdoor" : "indoor",
      summary: outdoorFriendly
        ? "Outdoor session is recommended today."
        : "Indoor session is recommended today.",
      reasons,
      weatherText
    };
  };

  const delayMs = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const isRetriableExternalError = (err) => {
    const status = Number(err?.status);
    if (err?.name === "AbortError") return true;
    if (!Number.isInteger(status)) return true;
    return status >= 500;
  };

  const runExternalRequestWithRetry = async (serviceName, requestFn) => {
    let attempt = 0;
    let lastError = null;
    while (attempt <= externalApiRetries) {
      const startedAt = Date.now();
      try {
        const result = await requestFn();
        recordExternalApiLatency(serviceName, Date.now() - startedAt);
        return result;
      } catch (err) {
        recordExternalApiLatency(serviceName, Date.now() - startedAt);
        lastError = err;
        const canRetry = attempt < externalApiRetries && isRetriableExternalError(err);
        if (!canRetry) break;
        metrics.externalApiRetries[serviceName] =
          (metrics.externalApiRetries[serviceName] || 0) + 1;
        const waitTime = externalApiRetryBaseDelayMs * 2 ** attempt;
        logger.warn({
          event: "external_api_retry",
          service: serviceName,
          attempt: attempt + 1,
          waitTimeMs: waitTime,
          status: Number.isInteger(err?.status) ? err.status : null,
          message: toShortText(err?.message, 220)
        });
        await delayMs(waitTime);
        attempt += 1;
      }
    }
    metrics.externalApiFailures[serviceName] = (metrics.externalApiFailures[serviceName] || 0) + 1;
    throw lastError || new Error("External request failed.");
  };

  const fetchOpenMeteo = async (query) => {
    const cacheKey = buildExternalCacheKey("openMeteo", {
      baseUrl: openMeteoBaseUrl,
      query
    });
    return readThroughExternalCache({
      serviceName: "openMeteo",
      cacheKey,
      ttlSec: openMeteoCacheTtlSec,
      requestFn: async () =>
        runExternalRequestWithRetry("openMeteo", async () => {
          if (typeof fetch !== "function") {
            const err = new Error("This Node runtime does not support fetch.");
            err.status = 500;
            throw err;
          }

          const url = new URL(openMeteoBaseUrl);
          for (const [key, value] of Object.entries(query || {})) {
            if (value === undefined || value === null || value === "") continue;
            url.searchParams.set(key, String(value));
          }
          url.searchParams.set("timezone", "auto");

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), openMeteoTimeoutMs);
          try {
            const response = await fetch(url, { signal: controller.signal });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              const err = new Error(cleanText(data?.reason || "Open-Meteo request failed.", 200));
              err.status = response.status >= 500 ? 502 : response.status;
              throw err;
            }
            return data;
          } catch (err) {
            if (err?.name === "AbortError") {
              const timeoutErr = new Error("Open-Meteo request timed out.");
              timeoutErr.status = 504;
              throw timeoutErr;
            }
            throw err;
          } finally {
            clearTimeout(timeout);
          }
        })
    });
  };

  const openAqRequest = async (endpoint, query = {}) => {
    const cacheKey = buildExternalCacheKey("openAq", {
      baseUrl: openAqBaseUrl,
      endpoint,
      query
    });
    return readThroughExternalCache({
      serviceName: "openAq",
      cacheKey,
      ttlSec: openAqCacheTtlSec,
      requestFn: async () =>
        runExternalRequestWithRetry("openAq", async () => {
          if (!openAqApiKey) {
            const err = new Error("OpenAQ API key is not configured. Set OPENAQ_API_KEY.");
            err.status = 503;
            throw err;
          }
          if (typeof fetch !== "function") {
            const err = new Error("This Node runtime does not support fetch.");
            err.status = 500;
            throw err;
          }

          const base = openAqBaseUrl.replace(/\/+$/, "");
          const path = String(endpoint || "").replace(/^\/+/, "");
          const url = new URL(`${base}/${path}`);
          for (const [key, value] of Object.entries(query || {})) {
            if (value === undefined || value === null || value === "") continue;
            url.searchParams.set(key, String(value));
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), openAqTimeoutMs);
          try {
            const response = await fetch(url, {
              headers: {
                "X-API-Key": openAqApiKey
              },
              signal: controller.signal
            });
            const rawBody = await response.text();
            let data = {};
            try {
              data = rawBody ? JSON.parse(rawBody) : {};
            } catch {
              data = rawBody;
            }
            if (!response.ok) {
              const stringBody = cleanText(typeof data === "string" ? data : "", 220);
              const firstError =
                Array.isArray(data) && data.length
                  ? cleanText(data[0]?.msg || data[0]?.message || data[0]?.detail, 220)
                  : "";
              const err = new Error(
                cleanText(
                  firstError ||
                    (typeof data === "object" && data
                      ? data?.message || data?.detail || data?.error
                      : "") ||
                    stringBody ||
                    "OpenAQ request failed.",
                  220
                )
              );
              err.status = response.status >= 500 ? 502 : response.status;
              throw err;
            }
            return data;
          } catch (err) {
            if (err?.name === "AbortError") {
              const timeoutErr = new Error("OpenAQ request timed out.");
              timeoutErr.status = 504;
              throw timeoutErr;
            }
            throw err;
          } finally {
            clearTimeout(timeout);
          }
        })
    });
  };

  const openAqParameterLabel = (code = "") => {
    const key = cleanText(code, 40).toLowerCase();
    const labels = {
      pm25: "PM2.5",
      "pm2.5": "PM2.5",
      pm10: "PM10",
      o3: "Ozone",
      no2: "Nitrogen dioxide",
      so2: "Sulfur dioxide",
      co: "Carbon monoxide"
    };
    return labels[key] || (key ? key.toUpperCase() : "");
  };

  // Skips absent candidates before converting, because Number(null) and
  // Number("") are both 0. Without this the first candidate being null ends the
  // search at 0 -- so a pm2.5 sensor reporting no reading was published as
  // 0 ug/m3, which scores AQI 0 and tells the user the air is clean. It also
  // defeated the point of the fallback chain, which is to try the later shapes.
  // A real 0 is still a measurement and is returned as one.
  const firstFinite = (values) => {
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      const num = toFiniteNumber(value);
      if (num !== null) return num;
    }
    return null;
  };

  const firstClean = (values, maxLen = 80) => {
    for (const value of values) {
      const text = cleanText(value, maxLen);
      if (text) return text;
    }
    return "";
  };

  const extractOpenAqMeasurement = (item = {}) => {
    const parameterObj =
      item?.parameter ||
      item?.sensor?.parameter ||
      item?.sensors?.[0]?.parameter ||
      item?.measurement?.parameter ||
      {};
    const code = cleanText(
      parameterObj?.name || item?.parameter || item?.name || item?.sensorName,
      40
    ).toLowerCase();
    const value = firstFinite([
      item?.value,
      item?.summary?.value,
      item?.latest?.value,
      item?.measurement?.value,
      item?.measurements?.[0]?.value
    ]);
    const unit = firstClean(
      [
        item?.unit,
        parameterObj?.units,
        parameterObj?.unit,
        item?.summary?.unit,
        item?.latest?.unit
      ],
      24
    );
    const measuredAt = firstClean(
      [
        item?.datetime?.utc,
        item?.datetime?.local,
        item?.date?.utc,
        item?.date?.local,
        item?.latest?.datetime?.utc,
        item?.latest?.datetime?.local
      ],
      50
    );
    const label =
      firstClean(
        [parameterObj?.displayName, parameterObj?.display_name, parameterObj?.name],
        80
      ) || openAqParameterLabel(code);

    return { code, label, value, unit, measuredAt };
  };

  const pm25ToUsAqi = (pm25) => {
    if (pm25 === null || pm25 === undefined || pm25 === "") return null;
    const value = Number(pm25);
    if (!Number.isFinite(value) || value < 0) return null;
    const points = [
      { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
      { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
      { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
      { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
      { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
      { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500 }
    ];
    for (const point of points) {
      if (value < point.cLow || value > point.cHigh) continue;
      const ratio = (value - point.cLow) / (point.cHigh - point.cLow || 1);
      return Math.round(point.iLow + ratio * (point.iHigh - point.iLow));
    }
    return 500;
  };

  const aqiBand = (aqi) => {
    if (aqi === null || aqi === undefined || aqi === "") {
      return {
        level: "Unknown",
        workoutType: "indoor",
        guidance: "Air quality data is limited. Prefer flexible indoor options."
      };
    }
    const value = Number(aqi);
    if (!Number.isFinite(value)) {
      return {
        level: "Unknown",
        workoutType: "indoor",
        guidance: "Air quality data is limited. Prefer flexible indoor options."
      };
    }
    if (value <= 50) {
      return {
        level: "Good",
        workoutType: "outdoor",
        guidance: "Air quality is good for outdoor sessions."
      };
    }
    if (value <= 100) {
      return {
        level: "Moderate",
        workoutType: "outdoor",
        guidance: "Outdoor training is usually fine; sensitive groups should monitor symptoms."
      };
    }
    if (value <= 150) {
      return {
        level: "Unhealthy for sensitive groups",
        workoutType: "indoor",
        guidance: "Reduce outdoor intensity, especially for cardio-heavy sessions."
      };
    }
    if (value <= 200) {
      return {
        level: "Unhealthy",
        workoutType: "indoor",
        guidance: "Indoor sessions are recommended today."
      };
    }
    if (value <= 300) {
      return {
        level: "Very unhealthy",
        workoutType: "indoor",
        guidance: "Avoid outdoor exertion and prioritize indoor training."
      };
    }
    return {
      level: "Hazardous",
      workoutType: "indoor",
      guidance: "Avoid outdoor training."
    };
  };

  const normalizePlainText = (value, maxLen = 500) => {
    if (typeof value !== "string") return "";
    const stripped = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return stripped.slice(0, maxLen);
  };

  const parseMultiNumberQuery = (input, min, max, maxItems = 8) => {
    if (input === undefined || input === null || input === "") return [];
    const list = Array.isArray(input) ? input : String(input).split(",");
    const values = [];
    for (const raw of list) {
      const num = toNullableNumber(String(raw).trim(), min, max);
      if (num === null) continue;
      values.push(Math.trunc(num));
      if (values.length >= maxItems) break;
    }
    return values;
  };

  const wgerRequest = async (endpoint, options = {}) => {
    const query = options?.query || {};
    const cacheKey = buildExternalCacheKey("wger", {
      baseUrl: wgerBaseUrl,
      endpoint,
      query
    });
    return readThroughExternalCache({
      serviceName: "wger",
      cacheKey,
      ttlSec: wgerCacheTtlSec,
      requestFn: async () =>
        runExternalRequestWithRetry("wger", async () => {
          if (typeof fetch !== "function") {
            const err = new Error("This Node runtime does not support fetch.");
            err.status = 500;
            throw err;
          }

          const base = wgerBaseUrl.replace(/\/+$/, "");
          const path = String(endpoint || "").replace(/^\/+/, "");
          const url = new URL(`${base}/${path}`);

          for (const [key, value] of Object.entries(query || {})) {
            if (value === undefined || value === null || value === "") continue;
            if (Array.isArray(value)) {
              for (const item of value) {
                if (item === undefined || item === null || item === "") continue;
                url.searchParams.append(key, String(item));
              }
              continue;
            }
            url.searchParams.set(key, String(value));
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), wgerTimeoutMs);
          try {
            const response = await fetch(url, {
              headers: wgerApiToken ? { Authorization: `Token ${wgerApiToken}` } : undefined,
              signal: controller.signal
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              const message = cleanText(
                data?.detail || data?.reason || data?.message || "Wger request failed.",
                220
              );
              const err = new Error(message);
              err.status = response.status >= 500 ? 502 : response.status;
              throw err;
            }
            return data;
          } catch (err) {
            if (err?.name === "AbortError") {
              const timeoutErr = new Error("Wger request timed out.");
              timeoutErr.status = 504;
              throw timeoutErr;
            }
            throw err;
          } finally {
            clearTimeout(timeout);
          }
        })
    });
  };

  const mealDbRequest = async (endpoint, query = {}) => {
    const cacheKey = buildExternalCacheKey("mealDb", {
      baseUrl: mealDbBaseUrl,
      endpoint,
      query
    });
    return readThroughExternalCache({
      serviceName: "mealDb",
      cacheKey,
      ttlSec: mealDbCacheTtlSec,
      requestFn: async () =>
        runExternalRequestWithRetry("mealDb", async () => {
          if (typeof fetch !== "function") {
            const err = new Error("This Node runtime does not support fetch.");
            err.status = 500;
            throw err;
          }

          const base = mealDbBaseUrl.replace(/\/+$/, "");
          const path = String(endpoint || "").replace(/^\/+/, "");
          const url = new URL(`${base}/${path}`);
          for (const [key, value] of Object.entries(query || {})) {
            if (value === undefined || value === null || value === "") continue;
            url.searchParams.set(key, String(value));
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), mealDbTimeoutMs);
          try {
            const response = await fetch(url, { signal: controller.signal });
            const rawBody = await response.text();
            let data = {};
            try {
              data = rawBody ? JSON.parse(rawBody) : {};
            } catch {
              data = {};
            }

            if (!response.ok) {
              const err = new Error(
                cleanText(
                  data?.message || data?.detail || data?.error || "MealDB request failed.",
                  220
                )
              );
              err.status = response.status >= 500 ? 502 : response.status;
              throw err;
            }

            return data;
          } catch (err) {
            if (err?.name === "AbortError") {
              const timeoutErr = new Error("MealDB request timed out.");
              timeoutErr.status = 504;
              throw timeoutErr;
            }
            throw err;
          } finally {
            clearTimeout(timeout);
          }
        })
    });
  };

  const mapMealDbIngredients = (meal = {}) => {
    const ingredients = [];
    for (let i = 1; i <= 20; i += 1) {
      const ingredient = cleanText(meal?.[`strIngredient${i}`], 100);
      if (!ingredient) continue;
      const measure = cleanText(meal?.[`strMeasure${i}`], 80);
      ingredients.push(cleanText(`${measure ? `${measure} ` : ""}${ingredient}`, 140));
    }
    return ingredients;
  };

  const mapMealDbMeal = (meal = {}) => {
    const source = cleanText(meal?.strSource, 320);
    const youtube = cleanText(meal?.strYoutube, 320);
    const instructions = normalizePlainText(meal?.strInstructions || "", 2200);
    const category = cleanText(meal?.strCategory, 80);
    const area = cleanText(meal?.strArea, 80);
    const metaLine = [category, area].filter(Boolean).join(" | ");
    const blurb = cleanText(
      instructions.slice(0, 180) || metaLine || "Recipe from TheMealDB.",
      260
    );
    const recipes = [];
    if (source) recipes.push({ label: "Source", url: source });
    if (youtube) recipes.push({ label: "YouTube", url: youtube });

    return {
      id: cleanText(meal?.idMeal, 40) ? `mealdb-${cleanText(meal?.idMeal, 40)}` : "",
      sourceId: cleanText(meal?.idMeal, 40),
      title: cleanText(meal?.strMeal, 180),
      image: cleanText(meal?.strMealThumb, 320),
      blurb,
      calories: null,
      category,
      area,
      instructions,
      ingredients: mapMealDbIngredients(meal),
      recipes,
      source: "mealdb"
    };
  };

  const pickWgerTranslation = (translations, preferredLanguage) => {
    const list = Array.isArray(translations) ? translations : [];
    if (!list.length) return null;

    const exact = list.find(
      (item) => Number(item?.language) === Number(preferredLanguage) && cleanText(item?.name, 200)
    );
    if (exact) return exact;

    const english = list.find(
      (item) => Number(item?.language) === 2 && cleanText(item?.name, 200)
    );
    if (english) return english;

    return list.find((item) => cleanText(item?.name, 200)) || list[0] || null;
  };

  const mapWgerExercise = (exercise, preferredLanguage = wgerDefaultLanguage) => {
    const translation = pickWgerTranslation(exercise?.translations, preferredLanguage);
    const images = (Array.isArray(exercise?.images) ? exercise.images : [])
      .map((item) => ({
        id: item?.id ?? null,
        url: cleanText(item?.image || item?.url, 240),
        isMain: Boolean(item?.is_main || item?.isMain)
      }))
      .filter((item) => item.url);
    const videos = (Array.isArray(exercise?.videos) ? exercise.videos : [])
      .map((item) => ({
        id: item?.id ?? null,
        url: cleanText(item?.video || item?.url, 240)
      }))
      .filter((item) => item.url);

    return {
      id: exercise?.id ?? null,
      uuid: cleanText(exercise?.uuid, 80),
      name: cleanText(translation?.name, 180),
      description: normalizePlainText(translation?.description || "", 2200),
      language: toFiniteNumber(translation?.language),
      category: {
        id: exercise?.category?.id ?? toFiniteNumber(exercise?.category),
        name: cleanText(exercise?.category?.name, 120)
      },
      muscles: (Array.isArray(exercise?.muscles) ? exercise.muscles : []).map((item) => ({
        id: item?.id ?? toFiniteNumber(item),
        name: cleanText(item?.name_en || item?.name, 120)
      })),
      secondaryMuscles: (Array.isArray(exercise?.muscles_secondary)
        ? exercise.muscles_secondary
        : []
      ).map((item) => ({
        id: item?.id ?? toFiniteNumber(item),
        name: cleanText(item?.name_en || item?.name, 120)
      })),
      equipment: (Array.isArray(exercise?.equipment) ? exercise.equipment : []).map((item) => ({
        id: item?.id ?? toFiniteNumber(item),
        name: cleanText(item?.name, 120)
      })),
      images,
      videos
    };
  };

  return {
    toFiniteNumber,
    weatherCodeToText,
    isSevereWeatherCode,
    isOutdoorFriendlyNow,
    buildWorkoutRecommendation,
    fetchOpenMeteo,
    openAqRequest,
    openAqParameterLabel,
    extractOpenAqMeasurement,
    pm25ToUsAqi,
    aqiBand,
    normalizePlainText,
    parseMultiNumberQuery,
    wgerRequest,
    mealDbRequest,
    mapMealDbMeal,
    mapWgerExercise
  };
};
