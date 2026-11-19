/**
 * Groups the dashboard's write routes, which live in dashboard/write/. Called by
 * dashboardRoutes.js.
 */
// @ts-check
import { registerMealAndMetricRoutes } from "./write/registerMealAndMetricRoutes.js";
import { registerSavedExerciseRoutes } from "./write/registerSavedExerciseRoutes.js";
import { registerWorkoutAndGoalRoutes } from "./write/registerWorkoutAndGoalRoutes.js";

/**
 * Registers the dashboard's POST and DELETE routes: workouts, calories and
 * goals; meal logs and progress metrics; saved exercises. Each answers with the
 * refreshed dashboard.
 *
 * @param {import("express").Express} app
 * @param {Parameters<typeof registerWorkoutAndGoalRoutes>[1] & Parameters<typeof registerMealAndMetricRoutes>[1] & Parameters<typeof registerSavedExerciseRoutes>[1]} deps
 *   What each of the three reads.
 */
export const registerDashboardWriteRoutes = (app, deps) => {
  registerWorkoutAndGoalRoutes(app, deps);
  registerMealAndMetricRoutes(app, deps);
  registerSavedExerciseRoutes(app, deps);
};
