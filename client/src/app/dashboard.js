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

export const mergeOptimisticDashboard = (dashboard, optimisticLogEntries) => {
  if (!dashboard && !optimisticLogEntries.length) return null;
  const base = dashboard ? { ...dashboard } : defaultDashboardData();
  if (!optimisticLogEntries.length) return base;

  const nextWorkoutSessions = Array.isArray(base.workoutSessions) ? [...base.workoutSessions] : [];
  const nextWorkouts = Array.isArray(base.workouts) ? [...base.workouts] : [];
  const nextCalories = Array.isArray(base.calories) ? [...base.calories] : [];
  const nextMealLogs = Array.isArray(base.mealLogs) ? [...base.mealLogs] : [];

  const ordered = [...optimisticLogEntries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  for (const entry of ordered) {
    if (entry.type === "workout") {
      nextWorkoutSessions.unshift(entry.item);
      nextWorkouts.unshift(entry.item);
    } else if (entry.type === "calorie") {
      nextCalories.unshift(entry.item);
    } else if (entry.type === "meal") {
      nextMealLogs.unshift(entry.item);
    }
  }

  return {
    ...base,
    workoutSessions: nextWorkoutSessions,
    workouts: nextWorkouts,
    calories: nextCalories,
    mealLogs: nextMealLogs
  };
};
