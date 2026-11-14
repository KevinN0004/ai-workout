/**
 * The zod schemas for the JSON bodies the routes accept, and validateBody, which
 * a route calls to parse one or answer 400. The closed-set profile fields take
 * their option lists from dashboardDataBuildersService.
 */
// @ts-check
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
} from "../dashboard/dashboardDataBuildersService.js";
import { validationMessage } from "./validationMessages.js";

/**
 * A body schema's declared fields as a client sends them, without the index
 * signature `.passthrough()` adds, so a misspelled key is an error. A field
 * zod coerces (numbers, booleans) reads as `unknown`.
 * @template {import("zod").ZodObject<any>} S
 * @typedef {import("zod").input<import("zod").ZodObject<S["shape"]>>} DeclaredBody
 */

/** @param {unknown} value */
const toNumberInput = (value) => {
  if (value === "") return null;
  if (value === undefined || value === null) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

/** @param {number} maxLen */
const requiredStringField = (maxLen) => z.string().trim().min(1).max(maxLen);
/** @param {number} maxLen */
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
/**
 * @param {number} min
 * @param {number} max
 */
const optionalNullableNumberField = (min, max) =>
  z.preprocess(toNumberInput, z.union([z.number().min(min).max(max), z.null()]).optional());
/**
 * @param {number} min
 * @param {number} max
 */
const requiredNumberField = (min, max) => z.preprocess(toNumberInput, z.number().min(min).max(max));
/**
 * @param {number} min
 * @param {number} max
 */
const optionalNullableIntegerField = (min, max) =>
  z.preprocess(toNumberInput, z.union([z.number().int().min(min).max(max), z.null()]).optional());

// One logged set, in the ranges 006_exercise_sets.sql enforces: reps or
// seconds, exactly one, and an optional load in kg and RPE. 0 reps and 0 kg
// are measurements; a blank is null.
const exerciseSetFields = {
  reps: optionalNullableIntegerField(0, 200),
  seconds: optionalNullableIntegerField(1, 3600),
  loadKg: optionalNullableNumberField(0, 1000),
  rpe: optionalNullableNumberField(1, 10)
};
const exerciseSetSchema = z
  .object(exerciseSetFields)
  .refine((set) => ((set.reps ?? null) === null) !== ((set.seconds ?? null) === null), {
    message: "Each set needs reps or seconds, not both."
  });

// A workout's exercises with their sets: at most 18 exercises of 20 sets, as
// the table's exercise_order and set_number allow.
const exerciseSetsField = z
  .array(
    z.object({
      name: requiredStringField(140),
      sets: z.array(exerciseSetSchema).max(20)
    })
  )
  .max(18)
  .optional();
/**
 * @param {number} maxItems
 * @param {number} maxLen
 */
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
    // cliff rather than removing it. z.array(z.enum(...)).max(7) rejects
    // instead -- an unknown day or more than seven entries is a 400,
    // consistent with every other closed-set field in this schema, and there
    // is no slice step to get wrong.
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
/** @typedef {DeclaredBody<typeof signupBodySchema>} SignupBody */

export const loginBodySchema = z
  .object({
    email: requiredStringField(254),
    password: z.string().min(1).max(256),
    rememberMe: optionalBooleanField
  })
  .passthrough();
/** @typedef {DeclaredBody<typeof loginBodySchema>} LoginBody */

// The asymmetry is deliberate and matches the schemas above: signupBodySchema
// requires 8 for a password being set, loginBodySchema requires 1 for one
// being checked. A current password is being checked.
export const passwordChangeBodySchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(8).max(256)
  })
  .passthrough();
/** @typedef {DeclaredBody<typeof passwordChangeBodySchema>} PasswordChangeBody */

// A current password being checked, same as loginBodySchema and
// passwordChangeBodySchema's currentPassword: min 1, not min 8.
export const accountDeleteBodySchema = z
  .object({
    password: z.string().min(1).max(256)
  })
  .passthrough();
/** @typedef {DeclaredBody<typeof accountDeleteBodySchema>} AccountDeleteBody */

export const profileBodySchema = profileInputSchema;
/** @typedef {DeclaredBody<typeof profileBodySchema>} ProfileBody */

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
    notes: optionalStringField(500),
    // The plan day the workout was logged against: the plan's id as the client
    // knows it, and the day's index in the plan's saved structure.
    planId: optionalStringField(64),
    planDayIndex: optionalNullableNumberField(0, 31),
    exerciseSets: exerciseSetsField
  })
  .passthrough();
/** @typedef {DeclaredBody<typeof workoutSessionBodySchema>} WorkoutSessionBody */

export const caloriesBodySchema = z
  .object({
    // The client's replay key; the route keeps it as the entry's id.
    id: optionalStringField(64),
    date: requiredStringField(20),
    calories: requiredNumberField(800, 10000)
  })
  .passthrough();
/** @typedef {DeclaredBody<typeof caloriesBodySchema>} CaloriesBody */

export const goalsBodySchema = z
  .object({
    targetWeight: optionalNullableNumberField(80, 400),
    targetCalories: optionalNullableNumberField(1200, 4500),
    weeklyWorkouts: optionalNullableNumberField(1, 7)
  })
  .passthrough();
/** @typedef {DeclaredBody<typeof goalsBodySchema>} GoalsBody */

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
/** @typedef {DeclaredBody<typeof mealLogBodySchema>} MealLogBody */

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
/** @typedef {DeclaredBody<typeof progressMetricBodySchema>} ProgressMetricBody */

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
/** @typedef {DeclaredBody<typeof savedExerciseBodySchema>} SavedExerciseBody */

export const generatePlanBodySchema = z
  .object({
    goal: optionalStringField(120),
    equipment: optionalStringArrayField(10, 80),
    duration: optionalNullableNumberField(15, 180),
    level: optionalStringField(40),
    injuries: optionalStringField(140),
    days: optionalNullableNumberField(1, 7),
    environment: optionalStringField(40),
    focuses: optionalStringArrayField(8, 60),
    // The planner's health screen. Each answer is optional, and an unanswered
    // one counts as no; the answers shape the plan and are not saved.
    health: z
      .object({
        condition: optionalBooleanField,
        symptoms: optionalBooleanField,
        supervised: optionalBooleanField,
        pregnant: optionalBooleanField
      })
      .optional()
  })
  .passthrough();
/** @typedef {DeclaredBody<typeof generatePlanBodySchema>} GeneratePlanBody */

/**
 * The first issue in a zod error as `path: message`, cut to 240 characters. The
 * path is "request" when the issue names none.
 * @param {{ issues?: Array<{ path?: PropertyKey[], message?: string }> } | null | undefined} error
 */
export const getValidationMessage = (error) => {
  const issue = error?.issues?.[0];
  if (!issue) return "Invalid request body.";
  const path = Array.isArray(issue.path) && issue.path.length ? issue.path.join(".") : "request";
  return `${path}: ${issue.message}`.trim().slice(0, 240) || "Invalid request body.";
};

/**
 * The part of an Express request validateBody reads.
 * @typedef {{ body?: unknown }} BodyRequest
 */

/**
 * The part of an Express response the validators answer a 400 with.
 * @typedef {{ status: (code: number) => { json: (body: unknown) => unknown } }} JsonResponse
 */

/**
 * Parses `req.body` with `schema`, in zod 3's wording (validationMessages.js),
 * and returns the parsed data. On failure it answers 400 with the first issue
 * and returns null, so a route must return as soon as this returns null.
 * @template {import("zod").ZodType} S
 * @param {BodyRequest} req
 * @param {JsonResponse} res
 * @param {S} schema
 * @returns {import("zod").output<S> | null}
 */
export const validateBody = (req, res, schema) => {
  const result = schema.safeParse(req.body || {}, { error: validationMessage });
  if (result.success) return result.data;
  res.status(400).json({ error: getValidationMessage(result.error) });
  return null;
};

// Test-only access, following the `__testables` convention in index.js.
// `toNumberInput` is passed by reference to `z.preprocess` rather than called,
// so it has no ordinary call site for a test to reach it through.
// `exerciseSetFields` are the fields of one set, nested in an array where a
// client test cannot reach them through workoutSessionBodySchema.shape.
export const __testables = { toNumberInput, exerciseSetFields };
