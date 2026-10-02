/**
 * The dashboard as App renders it: the loaded dashboard with the optimistic log
 * entries from useOptimisticLogs laid over it.
 */

/**
 * A fresh empty dashboard, every list empty and the goals at their defaults.
 * mergeOptimisticDashboard builds on it when an entry is logged before the
 * dashboard has loaded.
 */
export const defaultDashboardData = () => ({
  workouts: [],
  workoutSessions: [],
  calories: [],
  mealLogs: [],
  progressMetrics: [],
  plans: [],
  savedExercises: [],
  goals: {
    targetWeight: 160,
    targetCalories: 2200,
    weeklyWorkouts: 3
  }
});

/**
 * Puts the pending entries at the head of their lists, newest first: a workout
 * goes into both `workoutSessions` and `workouts`, a calorie or meal entry into
 * its own list. Returns null when there is neither a dashboard nor an entry, and
 * never mutates the dashboard it is given.
 */
export const mergeOptimisticDashboard = (dashboard, optimisticLogEntries) => {
  if (!dashboard && !optimisticLogEntries.length) return null;
  const base = dashboard ? { ...dashboard } : defaultDashboardData();
  if (!optimisticLogEntries.length) return base;

  const nextWorkoutSessions = Array.isArray(base.workoutSessions) ? [...base.workoutSessions] : [];
  const nextWorkouts = Array.isArray(base.workouts) ? [...base.workouts] : [];
  const nextCalories = Array.isArray(base.calories) ? [...base.calories] : [];
  const nextMealLogs = Array.isArray(base.mealLogs) ? [...base.mealLogs] : [];

  // Newest first. Each list's entries are collected in sorted order and
  // prepended as a group, which keeps the sort intact; unshift()ing them onto
  // the front one at a time would reverse it, and several entries logged in
  // quick succession would render oldest-first.
  const ordered = [...optimisticLogEntries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const pendingWorkouts = [];
  const pendingCalories = [];
  const pendingMealLogs = [];
  for (const entry of ordered) {
    if (entry.type === "workout") {
      pendingWorkouts.push(entry.item);
    } else if (entry.type === "calorie") {
      pendingCalories.push(entry.item);
    } else if (entry.type === "meal") {
      pendingMealLogs.push(entry.item);
    }
  }

  return {
    ...base,
    workoutSessions: [...pendingWorkouts, ...nextWorkoutSessions],
    workouts: [...pendingWorkouts, ...nextWorkouts],
    calories: [...pendingCalories, ...nextCalories],
    mealLogs: [...pendingMealLogs, ...nextMealLogs]
  };
};
