/**
 * The bodies the client sends to the routes that check them with zod, each
 * typed against that route's schema (roadmap D1 phase 2). Each builds exactly
 * what its caller sent inline before, key order included.
 */
// @ts-check
import { goalOptions } from "./constants";
import { toCmFromFeetInches, toKg } from "./units";

/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").SignupBody} SignupBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").LoginBody} LoginBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").PasswordChangeBody} PasswordChangeBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").AccountDeleteBody} AccountDeleteBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").WorkoutSessionBody} WorkoutSessionBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").CaloriesBody} CaloriesBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").MealLogBody} MealLogBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").ProgressMetricBody} ProgressMetricBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").GoalsBody} GoalsBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").GeneratePlanBody} GeneratePlanBody */
/** @typedef {import("../../../server/src/services/http/apiSchemaService.js").SavedExerciseBody} SavedExerciseBody */
/** @typedef {import("../../../server/src/routes/dashboard/validation.js").PlanSwapBody} PlanSwapBody */
/** @typedef {import("../../../server/src/routes/dashboard/validation.js").PlanUndoBody} PlanUndoBody */
/** @typedef {import("../../../server/src/routes/dashboard/validation.js").LiftDecisionBody} LiftDecisionBody */
/** @typedef {import("../../../server/src/routes/dashboard/validation.js").WeekDecisionBody} WeekDecisionBody */

/** @typedef {{ email: string, password: string }} AuthForm */

/**
 * The sign-up body: the auth form, and the profile in centimetres and
 * kilograms, converted from the form's units. The rest of the profile form
 * travels as it is.
 * @param {{ authForm: AuthForm, profileForm: Record<string, string>, heightUnit: string, weightUnit: string }} parts
 * @returns {SignupBody}
 */
export const signupBody = ({ authForm, profileForm, heightUnit, weightUnit }) => ({
  ...authForm,
  profile: {
    ...profileForm,
    heightCm:
      heightUnit === "ft"
        ? toCmFromFeetInches(profileForm.heightFeet, profileForm.heightInches)
        : profileForm.heightCm,
    weightKg:
      weightUnit === "lb"
        ? toKg(profileForm.weight, "lb")
        : profileForm.weight || profileForm.weightKg
  }
});

/**
 * The sign-in body: the auth form, and whether to keep the session.
 * @param {AuthForm} authForm
 * @param {boolean} rememberMe
 * @returns {LoginBody}
 */
export const loginBody = (authForm, rememberMe) => ({ ...authForm, rememberMe });

/**
 * The password change body.
 * @param {{ currentPassword: string, newPassword: string }} passwords
 * @returns {PasswordChangeBody}
 */
export const passwordChangeBody = ({ currentPassword, newPassword }) => ({
  currentPassword,
  newPassword
});

/**
 * The account delete body: the password that confirms it.
 * @param {string} password
 * @returns {AccountDeleteBody}
 */
export const accountDeleteBody = (password) => ({ password });

/**
 * A workout's body, from the form or a finished session: the exercises named
 * from their sets, and the plan day's link only when it has a plan, since the
 * server takes an absent planId, never a null one.
 * @param {{
 *   id: string,
 *   date: string,
 *   focus: string,
 *   duration: string | number,
 *   notes: string,
 *   exerciseSets: NonNullable<WorkoutSessionBody["exerciseSets"]>,
 *   planId?: string | null,
 *   planDayIndex?: number | null
 * }} workout
 * @returns {WorkoutSessionBody}
 */
export const workoutSessionBody = ({
  id,
  date,
  focus,
  duration,
  notes,
  exerciseSets,
  planId,
  planDayIndex
}) => {
  const link = planId ? { planId, planDayIndex } : null;
  return {
    id,
    date,
    focus,
    duration,
    notes,
    exercises: exerciseSets.map((exercise) => exercise.name),
    exerciseSets,
    ...link
  };
};

/**
 * A calorie entry's body: the form, its replay key and its date.
 * @param {{ calories: string }} calorieForm
 * @param {string} id
 * @param {string} date
 * @returns {CaloriesBody}
 */
export const caloriesBody = (calorieForm, id, date) => ({ ...calorieForm, id, date });

/**
 * The meal form as MealView edits it.
 * @typedef {{
 *   date: string,
 *   mealType: string,
 *   name: string,
 *   calories: string,
 *   proteinG: string,
 *   carbsG: string,
 *   fatG: string,
 *   notes: string
 * }} MealLogForm
 */

/**
 * A meal's body: the form and its replay key.
 * @param {MealLogForm} mealLogForm
 * @param {string} id
 * @returns {MealLogBody}
 */
export const mealLogBody = (mealLogForm, id) => ({ ...mealLogForm, id });

/**
 * The progress form as it starts and after each save: the date given, the rest
 * blank. It is submitted whole, so its keys are the body's.
 * @param {string} date
 * @returns {ProgressMetricBody}
 */
export const blankProgressForm = (date) => ({
  date,
  weightLb: "",
  bodyFatPct: "",
  waistCm: "",
  restingHr: "",
  notes: ""
});

/**
 * A fresh planner form, seeded with `goal`, which App's resetPlannerFlow passes
 * from the signed-in visitor's profile. PlannerSetupModal never asks for one --
 * its steps cover environment, equipment, schedule, level, injuries, focus and
 * the health check -- so without an argument every generated plan would follow
 * the same goal's rules, whatever the visitor wanted. The first of goalOptions
 * is the fallback for a visitor with no goal on file, signed in or not. The
 * health answers start as no, and a fresh object is built each time.
 * @param {string | null | undefined} [goal]
 * @returns {GeneratePlanBody}
 */
export const createDefaultPlannerForm = (goal) => ({
  goal: goal || goalOptions[0],
  equipment: [],
  duration: "45",
  level: "Intermediate",
  injuries: "None",
  days: "3",
  focuses: [],
  environment: "Home",
  health: { condition: false, symptoms: false, supervised: false, pregnant: false }
});

/**
 * The goals form before the dashboard fills it: no target weight, 2,200
 * calories, three workouts a week. It is submitted whole, so its keys are the
 * body's.
 * @returns {GoalsBody}
 */
export const blankGoalsForm = () => ({
  targetWeight: "",
  targetCalories: "2200",
  weeklyWorkouts: "3"
});

/**
 * A library exercise as the exercises route maps it from wger: every muscle
 * and equipment item has a name, though it may be "".
 * @typedef {{
 *   id?: number | null,
 *   name?: string,
 *   category?: { name?: string } | null,
 *   muscles?: Array<{ name: string }>,
 *   equipment?: Array<{ name: string }>
 * }} LibraryExercise
 */

/**
 * The body that saves a library exercise to the plan: its id, name, category,
 * muscles and equipment by name, its media, and the first reason it was
 * recommended for, or "" from the library.
 * @param {LibraryExercise | null | undefined} exercise
 * @param {{ reasons?: string[] } | null | undefined} recommendation
 * @param {{ imageUrl: string, videoUrl: string }} media
 * @returns {SavedExerciseBody}
 */
export const savedExerciseBody = (exercise, recommendation, media) => ({
  exerciseId: exercise?.id ?? null,
  name: exercise?.name || "",
  category: exercise?.category?.name || "",
  muscles: Array.isArray(exercise?.muscles) ? exercise.muscles.map((item) => item?.name) : [],
  equipment: Array.isArray(exercise?.equipment) ? exercise.equipment.map((item) => item?.name) : [],
  imageUrl: media.imageUrl,
  videoUrl: media.videoUrl,
  reason: recommendation?.reasons?.[0] || ""
});

/**
 * A plan swap's body: the exercise in the plan, the one chosen, and the area
 * named, if any. The server's areas are a plain list, so `area` types as any
 * string.
 * @param {{ from: string, to: string, area?: string | null }} swap
 * @returns {PlanSwapBody}
 */
export const planSwapBody = ({ from, to, area }) => ({ from, to, area });

/**
 * An undo's body: the swapped exercise's name.
 * @param {string} name
 * @returns {PlanUndoBody}
 */
export const planUndoBody = (name) => ({ name });

/**
 * A lift's progression answer.
 * @param {LiftDecisionBody["decision"]} decision
 * @returns {LiftDecisionBody}
 */
export const liftDecisionBody = (decision) => ({ decision });

/**
 * The week's progression answer.
 * @param {WeekDecisionBody["decision"]} decision
 * @returns {WeekDecisionBody}
 */
export const weekDecisionBody = (decision) => ({ decision });
