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

  // Newest first. The previous version sorted descending and then unshift()ed
  // each entry onto the front, which reversed the ordering it had just
  // established -- so several entries logged in quick succession rendered
  // oldest-first. Collecting per bucket and prepending as a group keeps the
  // sort's result intact.
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
