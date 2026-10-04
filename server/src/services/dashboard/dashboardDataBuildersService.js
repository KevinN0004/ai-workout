import crypto from "crypto";

export const cleanText = (value, maxLen = 120) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

// For text that is interpolated into a single prompt line: any run of
// whitespace, newlines included, becomes one space so a value cannot start a
// new line of its own.
export const collapseWhitespace = (value) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

export const toNullableNumber = (value, min, max) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
};

export const toCleanArray = (value, maxItems = 8, maxLen = 60) =>
  (Array.isArray(value) ? value : [value])
    .map((item) => cleanText(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

export const toCleanNameArray = (value, maxItems = 10, maxLen = 120) =>
  (Array.isArray(value) ? value : [])
    .map((item) => cleanText(typeof item === "string" ? item : item?.name, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

export const allowedSexValues = ["Female", "Male", "Non-binary", "Prefer not to say"];
export const allowedActivityValues = ["Light", "Moderate", "High", "Very high"];
// Reinstated from commit c2c820f, which removed it as dead code. It is live
// again because the profile now carries a goal and the planner seeds from it.
export const allowedGoalValues = [
  "Build lean strength and energy",
  "Fat loss + conditioning",
  "Mobility",
  "Recovery",
  "Cardio"
];
// sleep, experience, nutrition and cardio are closed-set <select> dropdowns in
// HomePersonalStage.jsx, not free text -- useBodyModel.js looks each one up in
// an exact-match lowercased map, same as sex/activity/goal above. Validated
// the same way. timeline stays cleanText: it is a placeholder text input.
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
// Includes "Mixed": the cardio <select> in HomePersonalStage.jsx has 8 options,
// not 7, and useBodyModel.js's cardioScore map scores "mixed" at 0.7 alongside
// the other seven. Omitting it here would silently drop a legitimate value --
// the exact bug class this task exists to close.
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

export const defaultGoals = () => ({
  targetWeight: 160,
  targetCalories: 2200,
  weeklyWorkouts: 3
});

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
    // names. Capping the raw input first (this line has tried both 7 and 64)
    // just slices it ahead of this membership check, silently discarding a
    // valid day that happens to sit past the cut. Input size is already
    // bounded upstream by express's request body limit.
    trainingDays: allowedTrainingDayValues.filter((day) =>
      (Array.isArray(input.trainingDays) ? input.trainingDays : []).some(
        (entry) => cleanText(entry, 20) === day
      )
    ),
    updatedAt: new Date().toISOString()
  };
};

export const isCompleteSignupProfile = (profile) =>
  Boolean(
    cleanText(profile?.firstName, 40) &&
    cleanText(profile?.lastName, 60) &&
    profile?.age !== null &&
    profile?.heightCm !== null &&
    profile?.weightKg !== null &&
    cleanText(profile?.sex, 40)
  );
