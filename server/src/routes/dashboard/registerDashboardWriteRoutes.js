import { registerMealAndMetricRoutes } from "./write/registerMealAndMetricRoutes.js";
import { registerSavedExerciseRoutes } from "./write/registerSavedExerciseRoutes.js";
import { registerWorkoutAndGoalRoutes } from "./write/registerWorkoutAndGoalRoutes.js";

export const registerDashboardWriteRoutes = (app, deps) => {
  registerWorkoutAndGoalRoutes(app, deps);
  registerMealAndMetricRoutes(app, deps);
  registerSavedExerciseRoutes(app, deps);
};
