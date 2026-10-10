/**
 * Request input to stored values: the text and number coercions, the option
 * lists the profile accepts, the defaults, and a builder for each of the
 * workout, meal, metric, saved-exercise and profile bodies. index.js hands
 * these to the routes; apiSchemaService reads the lists.
 */
import crypto from "crypto";

/** Trims a string and cuts it to `maxLen`; anything that is not a string is "". */
export const cleanText = (value, maxLen = 120) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

/**
 * Puts text on one line, for a value interpolated into a single prompt line:
 * every run of whitespace, newlines included, becomes one space, and the ends
 * are trimmed, so the value cannot start a line of its own. Anything that is
 * not a string is "". generateRoutes imports it directly rather than through
 * index.js.
 */
export const collapseWhitespace = (value) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

/**
 * A finite number within [min, max], or null. Absent input (null, undefined,
 * "") is null rather than the 0 `Number()` would make it.
 */
export const toNullableNumber = (value, min, max) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
};

/**
 * Cleans a list of strings, or a single string, with cleanText: empties are
 * dropped and the first `maxItems` kept.
 */
export const toCleanArray = (value, maxItems = 8, maxLen = 60) =>
  (Array.isArray(value) ? value : [value])
    .map((item) => cleanText(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

/**
 * Like toCleanArray, but each item may be a string or an object carrying a
 * `name`, and anything that is not an array gives [].
 */
export const toCleanNameArray = (value, maxItems = 10, maxLen = 120) =>
  (Array.isArray(value) ? value : [])
    .map((item) => cleanText(typeof item === "string" ? item : item?.name, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

export const allowedSexValues = ["Female", "Male", "Non-binary", "Prefer not to say"];
export const allowedActivityValues = ["Light", "Moderate", "High", "Very high"];
// The profile's goal, which the client's planner form is seeded from.
export const allowedGoalValues = [
  "Build lean strength and energy",
  "Fat loss + conditioning",
  "Mobility",
  "Recovery",
  "Cardio"
];
// sleep, experience, nutrition and cardio are closed-set <select> dropdowns in
// HomePersonalStage.jsx, not free text, and useBodyModel.js looks each one up
// in an exact-match lowercased map -- so they are validated as closed sets,
// like sex, activity and goal above. timeline stays cleanText: it is a
// free-text input.
export const allowedSleepValues = ["Less than 4", "4 - 6 hours", "7 - 8 hours", "More than 8"];
export const allowedExperienceValues = ["Beginner", "Intermediate", "Advanced"];
export const allowedNutritionValues = [
  "No preference",
  "High-protein",
  "Balanced",
  "Low-carb",
  "Vegetarian",
  "Vegan"
];
// Includes "Mixed": the cardio <select> in HomePersonalStage.jsx offers it, and
// useBodyModel.js's cardioScore map scores it. Omitting it here would silently
// drop a legitimate value.
export const allowedCardioValues = [
  "None",
  "Walking",
  "Running",
  "Cycling",
  "Rowing",
  "Swimming",
  "HIIT",
  "Mixed"
];
export const allowedTrainingDayValues = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
const allowedMealTypeValues = ["breakfast", "lunch", "dinner", "snack", "drink", "other"];

const allowedSexes = new Set(allowedSexValues);
const allowedActivities = new Set(allowedActivityValues);
const allowedGoals = new Set(allowedGoalValues);
const allowedSleeps = new Set(allowedSleepValues);
const allowedExperiences = new Set(allowedExperienceValues);
const allowedNutritions = new Set(allowedNutritionValues);
const allowedCardios = new Set(allowedCardioValues);
const allowedMealTypes = new Set(allowedMealTypeValues);

/**
 * A blank profile, stamped now. Every field is empty or null except `activity`,
 * which starts at "Moderate".
 */
export const defaultProfile = () => ({
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
  sleep: "",
  timeline: "",
  experience: "",
  nutrition: "",
  cardio: "",
  goal: "",
  trainingDays: [],
  updatedAt: new Date().toISOString()
});

/**
 * The goals a new dashboard starts with, and the fallback buildDashboard uses
 * for any goal that is absent or out of range.
 */
export const defaultGoals = () => ({
  targetWeight: 160,
  targetCalories: 2200,
  weeklyWorkouts: 3
});

/** An empty dashboard: every list empty, and the default goals. */
export const defaultDashboard = () => ({
  workouts: [],
  workoutSessions: [],
  calories: [],
  mealLogs: [],
  progressMetrics: [],
  plans: [],
  savedExercises: [],
  goals: defaultGoals()
});

/**
 * Normalises a stored dashboard for a response: each list becomes an array,
 * most of them capped, and each goal falls back to its default when absent or
 * out of range.
 */
export const buildDashboard = (input = {}) => {
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
    savedExercises: Array.isArray(input.savedExercises) ? input.savedExercises.slice(0, 200) : [],
    goals: {
      ...base.goals,
      targetWeight: toNullableNumber(goals.targetWeight, 80, 400) ?? base.goals.targetWeight,
      targetCalories:
        toNullableNumber(goals.targetCalories, 1200, 4500) ?? base.goals.targetCalories,
      weeklyWorkouts: toNullableNumber(goals.weeklyWorkouts, 1, 7) ?? base.goals.weeklyWorkouts
    }
  };
};

/**
 * The workout session the workout route saves, built from a validated body.
 * Each field is cleaned or range-checked, `rpe` is accepted for
 * `intensityRpe`, an id is minted when the body has none, and `createdAt` is
 * now.
 */
export const buildWorkoutSessionEntry = (input = {}) => ({
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

/**
 * The meal the meal-log route saves, built from a validated body. An unknown
 * `mealType` becomes "other", an id is minted when the body has none, and
 * `loggedAt` is now.
 */
export const buildMealLogEntry = (input = {}) => {
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

/**
 * The metric the progress-metrics route saves, built from a validated body.
 * A reading out of range becomes null, an id is minted when the body has none,
 * and `loggedAt` is now.
 */
export const buildProgressMetricEntry = (input = {}) => ({
  id: cleanText(input.id, 64) || crypto.randomUUID(),
  date: cleanText(input.date, 20),
  weightLb: toNullableNumber(input.weightLb, 50, 700),
  bodyFatPct: toNullableNumber(input.bodyFatPct, 2, 70),
  waistCm: toNullableNumber(input.waistCm, 30, 250),
  restingHr: toNullableNumber(input.restingHr, 30, 220),
  notes: cleanText(input.notes, 320),
  loggedAt: new Date().toISOString()
});

/**
 * The exercise the saved-exercise route saves, built from a validated body.
 * Muscles and equipment may arrive as names or as objects carrying one,
 * `source` is always "wger", and `savedAt` is now.
 */
export const buildSavedExerciseEntry = (input = {}) => ({
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

/**
 * A complete profile built from `input`: a signup body's profile, or for an
 * update the stored profile with the update spread over it. A full name is
 * split into first and last when they are not given, an option outside its list
 * falls back to its default, and `updatedAt` is now.
 */
export const buildProfile = (input = {}) => {
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
    sleep: allowedSleeps.has(input.sleep) ? input.sleep : "",
    timeline: cleanText(input.timeline, 60),
    experience: allowedExperiences.has(input.experience) ? input.experience : "",
    nutrition: allowedNutritions.has(input.nutrition) ? input.nutrition : "",
    cardio: allowedCardios.has(input.cardio) ? input.cardio : "",
    goal: allowedGoals.has(input.goal) ? input.goal : "",
    // Iterate the seven canonical days rather than the input array, with no
    // cap on the input at all: the result is bounded and deduped by
    // construction because it can only ever contain the seven canonical
    // names. Capping the raw input first just slices it ahead of this
    // membership check, silently discarding a valid day that happens to sit
    // past the cut. Input size is already bounded upstream by express's
    // request body limit.
    trainingDays: allowedTrainingDayValues.filter((day) =>
      (Array.isArray(input.trainingDays) ? input.trainingDays : []).some(
        (entry) => cleanText(entry, 20) === day
      )
    ),
    updatedAt: new Date().toISOString()
  };
};

/**
 * Whether a built profile has what signup requires: first and last name, age,
 * height, weight and sex.
 */
export const isCompleteSignupProfile = (profile) =>
  Boolean(
    cleanText(profile?.firstName, 40) &&
    cleanText(profile?.lastName, 60) &&
    profile?.age !== null &&
    profile?.heightCm !== null &&
    profile?.weightKg !== null &&
    cleanText(profile?.sex, 40)
  );
