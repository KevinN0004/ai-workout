import { z } from "zod";
import {
  allowedActivityValues,
  allowedCardioValues,
  allowedExperienceValues,
  allowedGoalValues,
  allowedNutritionValues,
  allowedSexValues,
  allowedSleepValues,
  allowedTrainingDayValues
} from "./dashboardDataBuildersService.js";

const toNumberInput = (value) => {
  if (value === "") return null;
  if (value === undefined || value === null) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const requiredStringField = (maxLen) => z.string().trim().min(1).max(maxLen);
const optionalStringField = (maxLen) => z.string().trim().max(maxLen).optional();
const optionalBooleanField = z
  .preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes"].includes(normalized)) return true;
      if (["false", "0", "no"].includes(normalized)) return false;
    }
    return value;
  }, z.boolean())
  .optional();
const optionalNullableNumberField = (min, max) =>
  z.preprocess(toNumberInput, z.union([z.number().min(min).max(max), z.null()]).optional());
const requiredNumberField = (min, max) => z.preprocess(toNumberInput, z.number().min(min).max(max));
const optionalStringArrayField = (maxItems, maxLen) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      const list = Array.isArray(value) ? value : [value];
      return list
        .map((item) => (typeof item === "string" ? item.trim().slice(0, maxLen) : ""))
        .filter(Boolean)
        .slice(0, maxItems);
    },
    z.array(z.string().max(maxLen)).max(maxItems).optional()
  );

const profileInputSchema = z
  .object({
    firstName: optionalStringField(40),
    lastName: optionalStringField(60),
    name: optionalStringField(80),
    age: optionalNullableNumberField(10, 120),
    heightCm: optionalNullableNumberField(100, 260),
    weightKg: optionalNullableNumberField(25, 400),
    sex: z.union([z.enum(allowedSexValues), z.literal("")]).optional(),
    bodyFat: optionalNullableNumberField(3, 70),
    activity: z.union([z.enum(allowedActivityValues), z.literal("")]).optional(),
    notes: optionalStringField(500),
    sleep: z.union([z.enum(allowedSleepValues), z.literal("")]).optional(),
    timeline: optionalStringField(60),
    experience: z.union([z.enum(allowedExperienceValues), z.literal("")]).optional(),
    nutrition: z.union([z.enum(allowedNutritionValues), z.literal("")]).optional(),
    cardio: z.union([z.enum(allowedCardioValues), z.literal("")]).optional(),
    goal: z.union([z.enum(allowedGoalValues), z.literal("")]).optional(),
    // Validated as an enum array, not a bounded string array: any item cap
    // that runs ahead of a membership check discards valid entries that
    // happen to sit past the cut, and raising the number only moves the
    // cliff rather than removing it (7 -> 64 still dropped a valid day at
    // position 65). z.array(z.enum(...)).max(7) rejects instead -- an
    // unknown day or more than seven entries is a 400, consistent with every
    // other closed-set field in this schema, and there is no slice step left
    // to get wrong.
    trainingDays: z.array(z.enum(allowedTrainingDayValues)).max(7).optional()
  })
  .passthrough();

export const signupBodySchema = z
  .object({
    email: requiredStringField(254),
    password: z.string().min(8).max(256),
    profile: profileInputSchema,
    rememberMe: optionalBooleanField
  })
  .passthrough();

export const loginBodySchema = z
  .object({
    email: requiredStringField(254),
    password: z.string().min(1).max(256),
    rememberMe: optionalBooleanField
  })
  .passthrough();

export const profileBodySchema = profileInputSchema;

export const workoutSessionBodySchema = z
  .object({
    id: optionalStringField(64),
    date: requiredStringField(20),
    focus: optionalStringField(80),
    duration: requiredNumberField(5, 360),
    exercises: optionalStringArrayField(18, 140),
    sets: optionalNullableNumberField(1, 80),
    reps: optionalNullableNumberField(1, 120),
    intensityRpe: optionalNullableNumberField(1, 10),
    rpe: optionalNullableNumberField(1, 10),
    notes: optionalStringField(500)
  })
  .passthrough();

export const caloriesBodySchema = z
  .object({
    date: requiredStringField(20),
    calories: requiredNumberField(800, 10000)
  })
  .passthrough();

export const goalsBodySchema = z
  .object({
    targetWeight: optionalNullableNumberField(80, 400),
    targetCalories: optionalNullableNumberField(1200, 4500),
    weeklyWorkouts: optionalNullableNumberField(1, 7)
  })
  .passthrough();

export const mealLogBodySchema = z
  .object({
    id: optionalStringField(64),
    date: requiredStringField(20),
    mealType: optionalStringField(40),
    name: requiredStringField(140),
    calories: optionalNullableNumberField(0, 5000),
    proteinG: optionalNullableNumberField(0, 400),
    carbsG: optionalNullableNumberField(0, 700),
    fatG: optionalNullableNumberField(0, 300),
    notes: optionalStringField(300)
  })
  .passthrough();

export const progressMetricBodySchema = z
  .object({
    id: optionalStringField(64),
    date: requiredStringField(20),
    weightLb: optionalNullableNumberField(50, 700),
    bodyFatPct: optionalNullableNumberField(2, 70),
    waistCm: optionalNullableNumberField(30, 250),
    restingHr: optionalNullableNumberField(30, 220),
    notes: optionalStringField(320)
  })
  .strict();

const namedValueSchema = z
  .object({
    name: requiredStringField(120)
  })
  .passthrough();

export const savedExerciseBodySchema = z
  .object({
    id: optionalStringField(64),
    exerciseId: optionalNullableNumberField(1, 10000000),
    name: requiredStringField(180),
    category: optionalStringField(120),
    muscles: z
      .array(z.union([z.string().trim().min(1).max(120), namedValueSchema]))
      .max(10)
      .optional(),
    equipment: z
      .array(z.union([z.string().trim().min(1).max(120), namedValueSchema]))
      .max(10)
      .optional(),
    imageUrl: optionalStringField(320),
    videoUrl: optionalStringField(320),
    reason: optionalStringField(260)
  })
  .passthrough();

export const generatePlanBodySchema = z
  .object({
    goal: optionalStringField(120),
    equipment: optionalStringArrayField(10, 80),
    duration: optionalNullableNumberField(15, 180),
    level: optionalStringField(40),
    injuries: optionalStringField(140),
    days: optionalNullableNumberField(1, 7),
    environment: optionalStringField(40),
    focuses: optionalStringArrayField(8, 60)
  })
  .passthrough();

export const getValidationMessage = (error) => {
  const issue = error?.issues?.[0];
  if (!issue) return "Invalid request body.";
  const path = Array.isArray(issue.path) && issue.path.length ? issue.path.join(".") : "request";
  return `${path}: ${issue.message}`.trim().slice(0, 240) || "Invalid request body.";
};

export const validateBody = (req, res, schema) => {
  const result = schema.safeParse(req.body || {});
  if (result.success) return result.data;
  res.status(400).json({ error: getValidationMessage(result.error) });
  return null;
};

// Test-only access, following the `__testables` convention in index.js.
// `toNumberInput` is passed by reference to `z.preprocess` rather than called,
// so it has no ordinary call site for a test to reach it through.
export const __testables = { toNumberInput };
