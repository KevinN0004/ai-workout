/**
 * Groups the dashboard's write routes, which live in dashboard/write/. Called by
 * dashboardRoutes.js.
 */
import { registerMealAndMetricRoutes } from "./write/registerMealAndMetricRoutes.js";
import { registerSavedExerciseRoutes } from "./write/registerSavedExerciseRoutes.js";
import { registerWorkoutAndGoalRoutes } from "./write/registerWorkoutAndGoalRoutes.js";

/**
 * Registers the dashboard's POST and DELETE routes: workouts, calories and
 * goals; meal logs and progress metrics; saved exercises. Each answers with the
 * refreshed dashboard.
 */
export const registerDashboardWriteRoutes = (app, deps) => {
  registerWorkoutAndGoalRoutes(app, deps);
  registerMealAndMetricRoutes(app, deps);
  registerSavedExerciseRoutes(app, deps);
};
