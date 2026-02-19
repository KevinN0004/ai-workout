import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";
import { promisify } from "util";
import { connectDatabase } from "./db.js";
import User from "./models/User.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const sessions = new Map();
const pbkdf2Async = promisify(crypto.pbkdf2);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const cookieSecure = process.env.NODE_ENV === "production" ? "; Secure" : "";
const defaultProfile = () => ({
  firstName: "",
  lastName: "",
  name: "",
  age: null,
  heightCm: null,
  weightKg: null,
  sex: "",
  bodyFat: null,
  activity: "Moderate",
  notes: "",
  updatedAt: new Date().toISOString()
});
const allowedSexes = new Set(["Female", "Male", "Non-binary", "Prefer not to say"]);
const allowedActivities = new Set(["Light", "Moderate", "High", "Very high"]);
const defaultGoals = () => ({
  targetWeight: 160,
  targetCalories: 2200,
  weeklyWorkouts: 3
});
const defaultDashboard = () => ({
  workouts: [],
  workoutSessions: [],
  calories: [],
  mealLogs: [],
  progressMetrics: [],
  plans: [],
  savedExercises: [],
  goals: defaultGoals()
});
const buildDashboard = (input = {}) => {
  const base = defaultDashboard();
  const goals = input.goals || {};
  return {
    ...base,
    workouts: Array.isArray(input.workouts) ? input.workouts.slice(0, 500) : [],
    workoutSessions: Array.isArray(input.workoutSessions)
      ? input.workoutSessions.slice(0, 500)
      : [],
    calories: Array.isArray(input.calories) ? input.calories : [],
    mealLogs: Array.isArray(input.mealLogs) ? input.mealLogs.slice(0, 800) : [],
    progressMetrics: Array.isArray(input.progressMetrics)
      ? input.progressMetrics.slice(0, 400)
      : [],
    plans: Array.isArray(input.plans) ? input.plans : [],
    savedExercises: Array.isArray(input.savedExercises)
      ? input.savedExercises.slice(0, 200)
      : [],
    goals: {
      ...base.goals,
      targetWeight:
        toNullableNumber(goals.targetWeight, 80, 400) ?? base.goals.targetWeight,
      targetCalories:
        toNullableNumber(goals.targetCalories, 1200, 4500) ??
        base.goals.targetCalories,
      weeklyWorkouts:
        toNullableNumber(goals.weeklyWorkouts, 1, 7) ?? base.goals.weeklyWorkouts
    }
  };
};

const cleanText = (value, maxLen = 120) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

const toNullableNumber = (value, min, max) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
};

const toCleanArray = (value, maxItems = 8, maxLen = 60) =>
  (Array.isArray(value) ? value : [value])
    .map((item) => cleanText(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

const toCleanNameArray = (value, maxItems = 10, maxLen = 120) =>
  (Array.isArray(value) ? value : [])
    .map((item) =>
      cleanText(typeof item === "string" ? item : item?.name, maxLen)
    )
    .filter(Boolean)
    .slice(0, maxItems);

const allowedMealTypes = new Set([
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "drink",
  "other"
]);

const buildWorkoutSessionEntry = (input = {}) => ({
  id: cleanText(input.id, 64) || crypto.randomUUID(),
  date: cleanText(input.date, 20),
  focus: cleanText(input.focus, 80) || "General",
  duration: toNullableNumber(input.duration, 5, 360),
  exercises: toCleanArray(input.exercises, 18, 140),
  sets: toNullableNumber(input.sets, 1, 80),
  reps: toNullableNumber(input.reps, 1, 120),
  intensityRpe: toNullableNumber(input.intensityRpe ?? input.rpe, 1, 10),
  notes: cleanText(input.notes, 500),
  createdAt: new Date().toISOString()
});

const toWorkoutSummaryEntry = (session) => ({
  id: cleanText(session?.id, 64) || crypto.randomUUID(),
  date: cleanText(session?.date, 20),
  focus: cleanText(session?.focus, 80) || "General",
  duration: toNullableNumber(session?.duration, 5, 360),
  exercises: toCleanArray(session?.exercises, 18, 140),
  sets: toNullableNumber(session?.sets, 1, 80),
  reps: toNullableNumber(session?.reps, 1, 120),
  intensityRpe: toNullableNumber(session?.intensityRpe, 1, 10),
  notes: cleanText(session?.notes, 500),
  createdAt: cleanText(session?.createdAt, 40) || new Date().toISOString()
});

const buildMealLogEntry = (input = {}) => {
  const mealTypeRaw = cleanText(input.mealType, 40).toLowerCase();
  return {
    id: cleanText(input.id, 64) || crypto.randomUUID(),
    date: cleanText(input.date, 20),
    mealType: allowedMealTypes.has(mealTypeRaw) ? mealTypeRaw : "other",
    name: cleanText(input.name, 140),
    calories: toNullableNumber(input.calories, 0, 5000),
    proteinG: toNullableNumber(input.proteinG, 0, 400),
    carbsG: toNullableNumber(input.carbsG, 0, 700),
    fatG: toNullableNumber(input.fatG, 0, 300),
    notes: cleanText(input.notes, 300),
    loggedAt: new Date().toISOString()
  };
};

const buildProgressMetricEntry = (input = {}) => ({
  id: cleanText(input.id, 64) || crypto.randomUUID(),
  date: cleanText(input.date, 20),
  weightLb: toNullableNumber(input.weightLb, 50, 700),
  bodyFatPct: toNullableNumber(input.bodyFatPct, 2, 70),
  waistCm: toNullableNumber(input.waistCm, 30, 250),
  restingHr: toNullableNumber(input.restingHr, 30, 220),
  notes: cleanText(input.notes, 320),
  loggedAt: new Date().toISOString()
});

const buildSavedExerciseEntry = (input = {}) => ({
  id: cleanText(input.id, 64) || crypto.randomUUID(),
  exerciseId: toNullableNumber(input.exerciseId, 1, 10000000),
  name: cleanText(input.name, 180),
  category: cleanText(input.category, 120),
  muscles: toCleanNameArray(input.muscles, 10, 120),
  equipment: toCleanNameArray(input.equipment, 10, 120),
  imageUrl: cleanText(input.imageUrl, 320),
  videoUrl: cleanText(input.videoUrl, 320),
  reason: cleanText(input.reason, 260),
  source: "wger",
  savedAt: new Date().toISOString()
});

const openMeteoBaseUrl = cleanText(
  process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/forecast",
  240
);
const openMeteoTimeoutMs = 10000;
const openAqBaseUrl = cleanText(process.env.OPENAQ_BASE_URL || "https://api.openaq.org/v3", 240);
const openAqApiKey = cleanText(process.env.OPENAQ_API_KEY || "", 240);
const openAqTimeoutMs = 12000;
const wgerBaseUrl = cleanText(process.env.WGER_BASE_URL || "https://wger.de/api/v2", 240);
const wgerApiToken = cleanText(process.env.WGER_API_TOKEN || "", 240);
const wgerDefaultLanguage = toNullableNumber(process.env.WGER_DEFAULT_LANGUAGE, 1, 100) ?? 2;
const wgerTimeoutMs = 12000;
const mealDbBaseUrl = cleanText(
  process.env.MEALDB_BASE_URL || "https://www.themealdb.com/api/json/v1/1",
  240
);
const mealDbTimeoutMs = 12000;

const buildProfile = (input = {}) => {
  const base = defaultProfile();
  const rawName = cleanText(input.name, 80);
  const rawFirst = cleanText(input.firstName, 40);
  const rawLast = cleanText(input.lastName, 60);
  const nameParts = rawName.split(/\s+/).filter(Boolean);
  const firstName = rawFirst || nameParts[0] || "";
  const lastName = rawLast || nameParts.slice(1).join(" ") || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return {
    ...base,
    firstName,
    lastName,
    name: fullName || rawName,
    age: toNullableNumber(input.age, 10, 120),
    heightCm: toNullableNumber(input.heightCm, 100, 260),
    weightKg: toNullableNumber(input.weightKg, 25, 400),
    sex: allowedSexes.has(input.sex) ? input.sex : "",
    bodyFat: toNullableNumber(input.bodyFat, 3, 70),
    activity: allowedActivities.has(input.activity) ? input.activity : base.activity,
    notes: cleanText(input.notes, 500),
    updatedAt: new Date().toISOString()
  };
};

const isCompleteSignupProfile = (profile) =>
  Boolean(
    cleanText(profile?.firstName, 40) &&
      cleanText(profile?.lastName, 60) &&
      profile?.age !== null &&
      profile?.heightCm !== null &&
      profile?.weightKg !== null &&
      cleanText(profile?.sex, 40)
  );

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

const fetchOpenMeteo = async (query) => {
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
};

const openAqRequest = async (endpoint, query = {}) => {
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

const firstFinite = (values) => {
  for (const value of values) {
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
  if (typeof fetch !== "function") {
    const err = new Error("This Node runtime does not support fetch.");
    err.status = 500;
    throw err;
  }

  const { query = {} } = options;
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
};

const mealDbRequest = async (endpoint, query = {}) => {
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
  const blurb = cleanText(instructions.slice(0, 180) || metaLine || "Recipe from TheMealDB.", 260);
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

const mapMongoDocToUser = (doc) => {
  if (!doc) return null;
  const source = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: source.userId,
    email: source.email,
    salt: source.salt,
    hash: source.hash,
    createdAt: source.createdAt,
    profile: source.profile,
    dashboard: source.dashboard
  };
};

const mapUserToMongoDoc = (user) => {
  const doc = {
    userId: user.id,
    email: cleanText(user.email, 254).toLowerCase(),
    salt: user.salt,
    hash: user.hash,
    createdAt: user.createdAt || new Date().toISOString()
  };
  if (user.profile !== undefined) doc.profile = user.profile;
  if (user.dashboard !== undefined) doc.dashboard = user.dashboard;
  return doc;
};

const findUserById = async (userId) => {
  const doc = await User.findOne({ userId });
  return mapMongoDocToUser(doc);
};

const findUserByEmail = async (email) => {
  const doc = await User.findOne({
    email: cleanText(email, 254).toLowerCase()
  });
  return mapMongoDocToUser(doc);
};

const createUser = async (user) => {
  const doc = await User.create(mapUserToMongoDoc(user));
  return mapMongoDocToUser(doc);
};

const hashPassword = async (password, salt = crypto.randomBytes(16).toString("hex")) => {
  const hash = await pbkdf2Async(password, salt, 120000, 64, "sha512");
  return { salt, hash: hash.toString("hex") };
};

const verifyPassword = async (password, user) => {
  if (!user?.salt || !user?.hash) return false;
  const hash = await pbkdf2Async(password, user.salt, 120000, 64, "sha512");
  const storedHash = Buffer.from(user.hash, "hex");
  if (storedHash.length !== hash.length) return false;
  return crypto.timingSafeEqual(storedHash, hash);
};

const parseCookies = (cookieHeader = "") =>
  cookieHeader.split(";").reduce((acc, pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (!key) return acc;
    const rawValue = rest.join("=");
    try {
      acc[key] = decodeURIComponent(rawValue);
    } catch {
      acc[key] = rawValue;
    }
    return acc;
  }, {});

const pruneExpiredSessions = () => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(token);
    }
  }
};

const setSessionCookie = (res, token) => {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${cookieSecure}`
  );
};

const clearSessionCookie = (res) => {
  res.setHeader(
    "Set-Cookie",
    `sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${cookieSecure}`
  );
};

const createSession = (userId) => {
  pruneExpiredSessions();
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
};

const getSessionUser = async (req) => {
  pruneExpiredSessions();
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.sid;
  if (!token || !sessions.has(token)) return null;
  const session = sessions.get(token);
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  return findUserById(session.userId);
};

const requireAuth = async (req, res, next) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Not signed in." });
  req.user = user;
  next();
};

const updateUser = async (userId, updater) => {
  const current = await findUserById(userId);
  if (!current) return null;

  const next = updater({
    ...current,
    profile: current.profile ? structuredClone(current.profile) : current.profile,
    dashboard: current.dashboard ? structuredClone(current.dashboard) : current.dashboard
  });
  if (!next) return null;

  const replacement = mapUserToMongoDoc(next);
  const updatedDoc = await User.findOneAndReplace({ userId }, replacement, {
    new: true
  });
  return mapMongoDocToUser(updatedDoc);
};

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/weather/current", async (req, res) => {
  try {
    const latitude = toNullableNumber(req.query.latitude, -90, 90);
    const longitude = toNullableNumber(req.query.longitude, -180, 180);
    if (latitude === null || longitude === null) {
      return res.status(400).json({ error: "Valid latitude and longitude are required." });
    }

    const data = await fetchOpenMeteo({
      latitude,
      longitude,
      current:
        "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,is_day"
    });

    const current = data?.current || {};
    res.json({
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
    res.status(status).json({ error: err?.message || "Server error." });
  }
});

app.get("/api/weather/recommendation", async (req, res) => {
  try {
    const latitude = toNullableNumber(req.query.latitude, -90, 90);
    const longitude = toNullableNumber(req.query.longitude, -180, 180);
    if (latitude === null || longitude === null) {
      return res.status(400).json({ error: "Valid latitude and longitude are required." });
    }

    const data = await fetchOpenMeteo({
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
    res.status(status).json({ error: err?.message || "Server error." });
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
    const locationData = await openAqRequest("locations", {
      coordinates: `${latitude},${longitude}`,
      radius: Math.round(radiusKm * 1000),
      limit: 1
    });
    const location = Array.isArray(locationData?.results) ? locationData.results[0] : null;
    if (!location) {
      return res.status(404).json({ error: "No nearby air quality station found." });
    }

    const locationId = toNullableNumber(location?.id, 1, 1000000000);
    if (locationId === null) {
      return res.status(502).json({ error: "OpenAQ response missing location id." });
    }

    const latestData = await openAqRequest(`locations/${Math.trunc(locationId)}/latest`);
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
    res.status(status).json({ error: err?.message || "Server error." });
  }
});

app.get("/api/wger/meta", async (req, res) => {
  try {
    const [categoriesData, musclesData, equipmentData] = await Promise.all([
      wgerRequest("exercisecategory/", { query: { limit: 200 } }),
      wgerRequest("muscle/", { query: { limit: 200 } }),
      wgerRequest("equipment/", { query: { limit: 200 } })
    ]);

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

    res.json({ categories, muscles, equipment });
  } catch (err) {
    const status = Number.isInteger(err?.status) ? err.status : 500;
    res.status(status).json({ error: err?.message || "Server error." });
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

    const data = await wgerRequest("exerciseinfo/", { query });
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
    res.status(status).json({ error: err?.message || "Server error." });
  }
});

app.get("/api/wger/exercises/:id", async (req, res) => {
  try {
    const id = toNullableNumber(req.params.id, 1, 1000000);
    if (id === null) {
      return res.status(400).json({ error: "Valid exercise id is required." });
    }
    const language = toNullableNumber(req.query.language, 1, 100) ?? wgerDefaultLanguage;
    let data = await wgerRequest("exerciseinfo/", {
      query: {
        id: Math.trunc(id),
        language
      }
    });
    let source = Array.isArray(data?.results) ? data.results[0] : null;
    if (!source) {
      data = await wgerRequest("exerciseinfo/", {
        query: {
          id: Math.trunc(id)
        }
      });
      source = Array.isArray(data?.results) ? data.results[0] : null;
    }
    if (!source) return res.status(404).json({ error: "Exercise not found." });
    res.json({ exercise: mapWgerExercise(source, language) });
  } catch (err) {
    const status = Number.isInteger(err?.status) ? err.status : 500;
    res.status(status).json({ error: err?.message || "Server error." });
  }
});

app.get("/api/mealdb/search", async (req, res) => {
  try {
    const query = cleanText(req.query.query ?? req.query.q, 100);
    if (!query) {
      return res.status(400).json({ error: "Query is required." });
    }
    const limit = toNullableNumber(req.query.limit, 1, 20) ?? 8;

    const data = await mealDbRequest("search.php", { s: query });
    const meals = (Array.isArray(data?.meals) ? data.meals : [])
      .map((item) => mapMealDbMeal(item))
      .filter((item) => item.id && item.title)
      .slice(0, limit);

    res.json({ query, count: meals.length, meals });
  } catch (err) {
    const status = Number.isInteger(err?.status) ? err.status : 500;
    res.status(status).json({ error: err?.message || "Server error." });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Not signed in." });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      profile: user.profile || defaultProfile()
    }
  });
});

app.get("/api/profile", requireAuth, (req, res) => {
  res.json({ profile: req.user.profile || defaultProfile() });
});

app.post("/api/profile", requireAuth, async (req, res) => {
  try {
    const profileInput = req.body || {};
    const updated = await updateUser(req.user.id, (user) => ({
      ...user,
      profile: buildProfile({
        ...(user.profile || defaultProfile()),
        ...profileInput
      })
    }));
    if (!updated) return res.status(404).json({ error: "User not found." });
    res.json({ profile: updated.profile || defaultProfile() });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Server error." });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, profile } = req.body || {};
    const normalizedEmail = cleanText(email, 254).toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    const exists = await findUserByEmail(normalizedEmail);
    if (exists) {
      return res.status(409).json({ error: "Account already exists." });
    }
    const builtProfile = buildProfile(profile);
    if (!isCompleteSignupProfile(builtProfile)) {
      return res.status(400).json({
        error: "Complete profile details are required to create an account."
      });
    }
    const { salt, hash } = await hashPassword(password);
    const newUser = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      salt,
      hash,
      createdAt: new Date().toISOString(),
      profile: builtProfile,
      dashboard: defaultDashboard()
    };
    await createUser(newUser);
    const token = createSession(newUser.id);
    setSessionCookie(res, token);
    res.json({
      user: {
        id: newUser.id,
        email: newUser.email,
        profile: newUser.profile || defaultProfile()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Server error." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = cleanText(email, 254).toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password required." });
    }
    const user = await findUserByEmail(normalizedEmail);
    if (!user || !(await verifyPassword(password, user))) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    const token = createSession(user.id);
    setSessionCookie(res, token);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        profile: user.profile || defaultProfile()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Server error." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.sid;
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user.dashboard) {
    return res.json({ dashboard: defaultDashboard() });
  }
  res.json({ dashboard: buildDashboard(user.dashboard) });
});

app.post(["/api/dashboard/workouts", "/api/dashboard/workout-sessions"], requireAuth, async (req, res) => {
  const session = buildWorkoutSessionEntry(req.body || {});
  if (!session.date || session.duration === null) {
    return res.status(400).json({ error: "Date and duration are required." });
  }

  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = buildDashboard(user.dashboard);
    const workoutSummary = toWorkoutSummaryEntry(session);
    const nextSessions = [session, ...dashboard.workoutSessions].slice(0, 500);
    const nextWorkouts = [
      workoutSummary,
      ...dashboard.workouts.filter((item) => cleanText(item?.id, 64) !== workoutSummary.id)
    ].slice(0, 500);
    return {
      ...user,
      dashboard: {
        ...dashboard,
        workoutSessions: nextSessions,
        workouts: nextWorkouts
      }
    };
  });

  if (!updated) return res.status(404).json({ error: "User not found." });
  res.json({
    dashboard: updated.dashboard,
    workoutSession: updated.dashboard?.workoutSessions?.[0] || session
  });
});

app.post("/api/dashboard/calories", requireAuth, async (req, res) => {
  const { date, calories } = req.body || {};
  const parsedCalories = toNullableNumber(calories, 800, 10000);
  if (!cleanText(date, 20) || parsedCalories === null) {
    return res.status(400).json({ error: "Date and calories are required." });
  }
  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = buildDashboard(user.dashboard);
    const entry = {
      id: crypto.randomUUID(),
      date: cleanText(date, 20),
      calories: parsedCalories,
      source: "manual",
      updatedAt: new Date().toISOString()
    };
    return {
      ...user,
      dashboard: {
        ...dashboard,
        calories: [entry, ...dashboard.calories]
      }
    };
  });
  if (!updated) return res.status(404).json({ error: "User not found." });
  res.json({ dashboard: updated.dashboard });
});

app.post("/api/dashboard/goals", requireAuth, async (req, res) => {
  const { targetWeight, targetCalories, weeklyWorkouts } = req.body || {};
  const parsedTargetWeight = toNullableNumber(targetWeight, 80, 400);
  const parsedTargetCalories = toNullableNumber(targetCalories, 1200, 4500);
  const parsedWeeklyWorkouts = toNullableNumber(weeklyWorkouts, 1, 7);
  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = buildDashboard(user.dashboard);
    return {
      ...user,
      dashboard: {
        ...dashboard,
        goals: {
          targetWeight: parsedTargetWeight ?? dashboard.goals.targetWeight,
          targetCalories: parsedTargetCalories ?? dashboard.goals.targetCalories,
          weeklyWorkouts: parsedWeeklyWorkouts ?? dashboard.goals.weeklyWorkouts
        }
      }
    };
  });
  if (!updated) return res.status(404).json({ error: "User not found." });
  res.json({ dashboard: updated.dashboard });
});

app.post("/api/dashboard/meal-logs", requireAuth, async (req, res) => {
  const mealLog = buildMealLogEntry(req.body || {});
  if (!mealLog.date || !mealLog.name) {
    return res.status(400).json({ error: "Date and meal name are required." });
  }
  if (
    mealLog.calories === null &&
    mealLog.proteinG === null &&
    mealLog.carbsG === null &&
    mealLog.fatG === null
  ) {
    return res
      .status(400)
      .json({ error: "Add calories or at least one macro value for the meal." });
  }

  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = buildDashboard(user.dashboard);
    const mealLogs = [mealLog, ...dashboard.mealLogs].slice(0, 800);
    const hasManualCaloriesForDay = dashboard.calories.some(
      (item) =>
        cleanText(item?.date, 20) === mealLog.date &&
        cleanText(item?.source || "manual", 20) !== "meal_logs"
    );

    let calories = dashboard.calories;
    if (!hasManualCaloriesForDay) {
      const dayCalories = mealLogs.reduce((sum, item) => {
        if (cleanText(item?.date, 20) !== mealLog.date) return sum;
        return sum + (toNullableNumber(item?.calories, 0, 5000) ?? 0);
      }, 0);
      calories = dashboard.calories.filter(
        (item) =>
          !(
            cleanText(item?.date, 20) === mealLog.date &&
            cleanText(item?.source || "", 20) === "meal_logs"
          )
      );
      if (dayCalories > 0) {
        calories = [
          {
            id: `meal-logs-${mealLog.date}`,
            date: mealLog.date,
            calories: Math.round(dayCalories),
            source: "meal_logs",
            updatedAt: new Date().toISOString()
          },
          ...calories
        ];
      }
    }

    return {
      ...user,
      dashboard: {
        ...dashboard,
        mealLogs,
        calories: calories.slice(0, 1000)
      }
    };
  });

  if (!updated) return res.status(404).json({ error: "User not found." });
  res.json({
    dashboard: updated.dashboard,
    mealLog: updated.dashboard?.mealLogs?.[0] || mealLog
  });
});

app.post("/api/dashboard/progress-metrics", requireAuth, async (req, res) => {
  const metric = buildProgressMetricEntry(req.body || {});
  if (!metric.date) {
    return res.status(400).json({ error: "Date is required." });
  }
  if (
    metric.weightLb === null &&
    metric.bodyFatPct === null &&
    metric.waistCm === null &&
    metric.restingHr === null
  ) {
    return res
      .status(400)
      .json({ error: "Add at least one metric: weight, body fat, waist, or resting heart rate." });
  }

  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = buildDashboard(user.dashboard);
    return {
      ...user,
      dashboard: {
        ...dashboard,
        progressMetrics: [metric, ...dashboard.progressMetrics].slice(0, 400)
      }
    };
  });
  if (!updated) return res.status(404).json({ error: "User not found." });
  res.json({
    dashboard: updated.dashboard,
    progressMetric: updated.dashboard?.progressMetrics?.[0] || metric
  });
});

app.post("/api/dashboard/saved-exercises", requireAuth, async (req, res) => {
  const payload = req.body || {};
  const entry = buildSavedExerciseEntry(payload);
  if (!entry.name) {
    return res.status(400).json({ error: "Exercise name is required." });
  }

  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = buildDashboard(user.dashboard);
    const existing = Array.isArray(dashboard.savedExercises)
      ? dashboard.savedExercises
      : [];
    const next = existing.filter((item) => {
      if (entry.exerciseId !== null && item?.exerciseId === entry.exerciseId) return false;
      if (
        cleanText(item?.name, 180).toLowerCase() ===
        entry.name.toLowerCase()
      ) {
        return false;
      }
      return true;
    });
    return {
      ...user,
      dashboard: {
        ...dashboard,
        savedExercises: [entry, ...next].slice(0, 200)
      }
    };
  });
  if (!updated) return res.status(404).json({ error: "User not found." });
  res.json({
    dashboard: updated.dashboard,
    savedExercise: updated.dashboard?.savedExercises?.[0] || entry
  });
});

app.delete("/api/dashboard/saved-exercises/:id", requireAuth, async (req, res) => {
  const entryId = cleanText(req.params.id, 64);
  if (!entryId) return res.status(400).json({ error: "Exercise id is required." });

  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = buildDashboard(user.dashboard);
    const next = (Array.isArray(dashboard.savedExercises) ? dashboard.savedExercises : []).filter(
      (item) => cleanText(item?.id, 64) !== entryId
    );
    return {
      ...user,
      dashboard: {
        ...dashboard,
        savedExercises: next
      }
    };
  });
  if (!updated) return res.status(404).json({ error: "User not found." });
  res.json({ dashboard: updated.dashboard, ok: true });
});

app.post("/api/generate", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY." });
    }

    const body = req.body || {};
    const goal = cleanText(body.goal, 120) || "Build strength and energy";
    const equipment = toCleanArray(body.equipment, 10, 80);
    const duration = toNullableNumber(body.duration, 15, 180) ?? 45;
    const level = cleanText(body.level, 40) || "Intermediate";
    const injuries = cleanText(body.injuries, 140) || "None";
    const days = toNullableNumber(body.days, 1, 7) ?? 3;
    const environment = cleanText(body.environment, 40) || "Home";
    const focuses = toCleanArray(body.focuses, 8, 60);

    const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const equipmentLine = equipment.join(", ") || "Bodyweight";
    const focusLine = focuses.join(", ") || "General fitness";

    const prompt = `You are an expert fitness coach. Create a weekly workout plan.\n\nClient info:\n- Goal: ${goal}\n- Equipment: ${equipmentLine}\n- Session length: ${duration} minutes\n- Experience: ${level}\n- Injuries/limitations: ${injuries}\n\nInstructions:\n- Use weekday headings exactly as: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.\n- For each day include: Warmup, Main lifts, Accessories, and Finisher/conditioning with sets x reps and rest guidance.\n- Keep it concise and practical for a home or gym setting.\n- If injuries are mentioned, adapt and avoid risky movements.\n- End with a section labeled \"Coach Notes:\" containing tips and recovery guidance.\n- Output in clean plain text with clear headings.`;
    const promptWithContext = `${prompt}\n\nEnvironment: ${environment}\nFocuses: ${focusLine}\nEquipment list: ${equipmentLine}`;

    const model = gemini.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(promptWithContext);
    const plan = result?.response?.text?.() || "";

    if (!plan) {
      return res.status(502).json({ error: "No plan generated." });
    }

    const sessionUser = await getSessionUser(req);
    let savedPlan = null;

    if (sessionUser) {
      const planEntry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        goal,
        equipment,
        duration,
        level,
        injuries,
        days,
        environment,
        focuses,
        plan
      };

      const updated = await updateUser(sessionUser.id, (user) => {
        const dashboard = buildDashboard(user.dashboard);
        return {
          ...user,
          dashboard: {
            ...dashboard,
            plans: [planEntry, ...(dashboard.plans || [])]
          }
        };
      });
      savedPlan = updated?.dashboard?.plans?.[0] || planEntry;
    }

    res.json({ plan, savedPlan });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Server error." });
  }
});

const startServer = async () => {
  try {
    const { mongoUri } = await connectDatabase();
    console.log(`MongoDB connected: ${mongoUri}`);
    app.listen(port, () => {
      console.log(`Server listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

startServer();
