import { useMemo } from "react";
import { buildWeeklyMealPlan } from "./planUtils";

const parseDateValue = (value) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toText = (value) => (value === null || value === undefined ? "" : String(value).trim());

const buildDedupedList = (items, fallbackKeyBuilder) => {
  const source = Array.isArray(items) ? items : [];
  const seen = new Set();
  const deduped = [];
  for (const item of source) {
    const idKey = toText(item?.id);
    const fallbackKey = typeof fallbackKeyBuilder === "function" ? fallbackKeyBuilder(item) : "";
    const key = idKey || fallbackKey;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    deduped.push(item);
  }
  return deduped;
};

const workoutFallbackKey = (item) => {
  const exercises = Array.isArray(item?.exercises) ? item.exercises.join("|") : "";
  return [
    toText(item?.date),
    toText(item?.focus),
    toText(item?.duration),
    exercises,
    toText(item?.sets),
    toText(item?.reps),
    toText(item?.intensityRpe),
    toText(item?.notes),
    toText(item?.createdAt)
  ]
    .filter(Boolean)
    .join("::");
};

const calorieFallbackKey = (item) =>
  [toText(item?.date), toText(item?.calories), toText(item?.source), toText(item?.createdAt)]
    .filter(Boolean)
    .join("::");

const mealFallbackKey = (item) =>
  [
    toText(item?.date),
    toText(item?.mealType),
    toText(item?.name),
    toText(item?.calories),
    toText(item?.proteinG),
    toText(item?.carbsG),
    toText(item?.fatG),
    toText(item?.loggedAt)
  ]
    .filter(Boolean)
    .join("::");

const progressFallbackKey = (item) =>
  [
    toText(item?.date),
    toText(item?.weightLb),
    toText(item?.bodyFatPct),
    toText(item?.waistCm),
    toText(item?.restingHr),
    toText(item?.loggedAt)
  ]
    .filter(Boolean)
    .join("::");

const buildLinePath = (values, width = 260, height = 110, padding = 10) => {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / Math.max(safeValues.length - 1, 1);

  return safeValues
    .map((value, index) => {
      const x = padding + stepX * index;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
};

export default function useDashboardMetrics({
  dashboard,
  goalForm,
  formGoal,
  weekDays,
  latestPlanByWeekday
}) {
  const workouts = useMemo(() => {
    const workoutSessions = Array.isArray(dashboard?.workoutSessions)
      ? dashboard.workoutSessions
      : [];
    const workoutSummaries = Array.isArray(dashboard?.workouts) ? dashboard.workouts : [];
    const mergedWorkoutSource =
      workoutSessions.length || workoutSummaries.length
        ? [...workoutSessions, ...workoutSummaries]
        : [];
    return buildDedupedList(mergedWorkoutSource, workoutFallbackKey);
  }, [dashboard?.workoutSessions, dashboard?.workouts]);

  const calories = useMemo(
    () =>
      buildDedupedList(
        Array.isArray(dashboard?.calories) ? dashboard.calories : [],
        calorieFallbackKey
      ),
    [dashboard?.calories]
  );

  const mealLogs = useMemo(
    () =>
      buildDedupedList(
        Array.isArray(dashboard?.mealLogs) ? dashboard.mealLogs : [],
        mealFallbackKey
      ),
    [dashboard?.mealLogs]
  );

  const progressMetrics = useMemo(
    () =>
      buildDedupedList(
        Array.isArray(dashboard?.progressMetrics) ? dashboard.progressMetrics : [],
        progressFallbackKey
      ),
    [dashboard?.progressMetrics]
  );

  const plans = useMemo(
    () => (Array.isArray(dashboard?.plans) ? dashboard.plans : []),
    [dashboard?.plans]
  );

  const goals = useMemo(() => dashboard?.goals || goalForm, [dashboard?.goals, goalForm]);

  const metrics = useMemo(() => {
    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const last7Cutoff = new Date(todayDate);
    last7Cutoff.setDate(last7Cutoff.getDate() - 6);
    const previous7Start = new Date(last7Cutoff);
    previous7Start.setDate(previous7Start.getDate() - 7);
    const previous7End = new Date(last7Cutoff);
    previous7End.setDate(previous7End.getDate() - 1);
    const inLast7Days = (value) => Boolean(value && value >= last7Cutoff && value <= todayDate);
    const inPrevious7Days = (value) =>
      Boolean(value && value >= previous7Start && value <= previous7End);

    const caloriesByDate = {};
    const last7Calories = [];
    const previous7Calories = [];
    for (const item of calories) {
      const parsedDate = parseDateValue(item?.date);
      if (!parsedDate) continue;
      const key = toDateKey(parsedDate);
      const nextCalories = Number(item?.calories || 0);
      if (!Number.isNaN(nextCalories)) {
        caloriesByDate[key] = (caloriesByDate[key] || 0) + nextCalories;
      }
      if (inLast7Days(parsedDate)) {
        last7Calories.push(item);
      } else if (inPrevious7Days(parsedDate)) {
        previous7Calories.push(item);
      }
    }

    const workoutsByDate = {};
    const workoutMinutesByDate = {};
    const last7Workouts = [];
    const previous7Workouts = [];
    for (const item of workouts) {
      const parsedDate = parseDateValue(item?.date);
      if (!parsedDate) continue;
      const key = toDateKey(parsedDate);
      workoutsByDate[key] = (workoutsByDate[key] || 0) + 1;
      const minutes = Number(item?.duration || 0);
      if (!Number.isNaN(minutes)) {
        workoutMinutesByDate[key] = (workoutMinutesByDate[key] || 0) + minutes;
      }
      if (inLast7Days(parsedDate)) {
        last7Workouts.push(item);
      } else if (inPrevious7Days(parsedDate)) {
        previous7Workouts.push(item);
      }
    }

    const avgCalories =
      last7Calories.reduce((sum, item) => sum + Number(item?.calories || 0), 0) /
      (last7Calories.length || 1);
    const previousAvgCalories =
      previous7Calories.reduce((sum, item) => sum + Number(item?.calories || 0), 0) /
      (previous7Calories.length || 1);
    const weeklyGoal = Math.max(Number(goals.weeklyWorkouts || 3), 1);
    const workoutProgress = Math.min(100, Math.round((last7Workouts.length / weeklyGoal) * 100));
    const calorieGoal = Math.max(Number(goals.targetCalories || 2200), 1);
    const calorieProgress = Math.min(100, Math.round((avgCalories / calorieGoal) * 100));

    const buildRangeKeys = (days) =>
      Array.from({ length: days }, (_, index) => {
        const date = new Date(todayDate);
        date.setDate(date.getDate() - (days - 1 - index));
        return toDateKey(date);
      });

    const formatRangeLabel = (key) => {
      const parsedDate = parseDateValue(key);
      return parsedDate
        ? parsedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : key;
    };

    const buildRecoveryScore = (key) => {
      const dailyCalories = caloriesByDate[key] || calorieGoal;
      const caloriePenalty = Math.min(
        (Math.abs(dailyCalories - calorieGoal) / calorieGoal) * 55,
        40
      );
      const minutes = workoutMinutesByDate[key] || 0;
      const loadPenalty = Math.min((minutes / 90) * 30, 30);
      const restBonus = workoutsByDate[key] ? 0 : 8;
      return Math.round(clamp(78 - caloriePenalty - loadPenalty + restBonus, 30, 95));
    };

    const buildTrendSet = (keys) => {
      const caloriesSeries = keys.map((key) => caloriesByDate[key] || 0);
      const workoutSeries = keys.map((key) => workoutsByDate[key] || 0);
      const recoverySeries = keys.map((key) => buildRecoveryScore(key));
      return {
        keys,
        caloriesSeries,
        workoutSeries,
        recoverySeries,
        startLabel: formatRangeLabel(keys[0]),
        endLabel: formatRangeLabel(keys[keys.length - 1]),
        activeDays: workoutSeries.filter((value) => value > 0).length,
        avgCalories: caloriesSeries.reduce((sum, value) => sum + value, 0) / (keys.length || 1),
        avgRecovery: recoverySeries.reduce((sum, value) => sum + value, 0) / (keys.length || 1)
      };
    };

    const trendRanges = {
      week: buildTrendSet(buildRangeKeys(7)),
      month: buildTrendSet(buildRangeKeys(30))
    };
    const calorieSeries = trendRanges.week.caloriesSeries;
    const workoutSeries = trendRanges.week.workoutSeries;
    const last7Keys = trendRanges.week.keys;

    const recentWorkouts = [...workouts].sort((a, b) => {
      const dateA = parseDateValue(a?.date)?.getTime() || 0;
      const dateB = parseDateValue(b?.date)?.getTime() || 0;
      return dateB - dateA;
    });

    const avgDailyWorkouts = last7Workouts.length / 7;
    const remainingWorkouts = Math.max(weeklyGoal - last7Workouts.length, 0);
    const daysToGoal =
      avgDailyWorkouts > 0 ? Math.ceil(remainingWorkouts / avgDailyWorkouts) : null;
    const goalPaceText =
      remainingWorkouts === 0
        ? "Weekly workout goal reached."
        : avgDailyWorkouts > 0
          ? `At this pace, ${daysToGoal} day${daysToGoal === 1 ? "" : "s"} to reach ${weeklyGoal} workouts.`
          : "Log a workout to start your pace estimate.";
    const calorieDelta = Math.round(avgCalories - calorieGoal);
    const workoutDeltaVsLastWeek = last7Workouts.length - previous7Workouts.length;
    const calorieDeltaVsLastWeek = Math.round(avgCalories - previousAvgCalories);

    const weightTrendCandidates = [...progressMetrics]
      .filter((item) => Number.isFinite(Number(item?.weightLb)))
      .sort((a, b) => {
        const dateA = parseDateValue(a?.date)?.getTime() || 0;
        const dateB = parseDateValue(b?.date)?.getTime() || 0;
        return dateB - dateA;
      });
    const latestWeight =
      weightTrendCandidates.length > 0 ? Number(weightTrendCandidates[0]?.weightLb) : null;
    const previousWeight =
      weightTrendCandidates.length > 1 ? Number(weightTrendCandidates[1]?.weightLb) : null;
    const weightDeltaVsLastLog =
      latestWeight !== null &&
      previousWeight !== null &&
      Number.isFinite(latestWeight) &&
      Number.isFinite(previousWeight)
        ? Number((latestWeight - previousWeight).toFixed(1))
        : null;

    const latestPlan = plans[0];
    const weeklyMealPlan = buildWeeklyMealPlan({
      weekDays,
      latestPlanByWeekday,
      goalText: latestPlan?.goal || goals?.goalType || formGoal || "Build lean strength and energy",
      targetCalories: goals.targetCalories
    });
    const todayWeekday = todayDate.toLocaleDateString("en-US", {
      weekday: "long"
    });
    const todayMealPlan =
      weeklyMealPlan.days.find((day) => day.key === todayWeekday) || weeklyMealPlan.days[0] || null;
    const todayRecommendation = {
      weekday: todayWeekday,
      workoutLines: latestPlanByWeekday?.[todayWeekday] || [],
      mealPlan: todayMealPlan
    };
    const weeklyTrends = {
      workouts: workoutDeltaVsLastWeek,
      calories: calorieDeltaVsLastWeek,
      latestWeight,
      weightDelta: weightDeltaVsLastLog
    };

    return {
      last7Workouts,
      avgCalories,
      weeklyGoal,
      workoutProgress,
      calorieGoal,
      calorieProgress,
      trendRanges,
      calorieSeries,
      workoutSeries,
      last7Keys,
      recentWorkouts,
      goalPaceText,
      calorieDelta,
      todayRecommendation,
      weeklyTrends
    };
  }, [calories, workouts, goals, plans, progressMetrics, formGoal, weekDays, latestPlanByWeekday]);

  return {
    workouts,
    calories,
    mealLogs,
    progressMetrics,
    goals,
    buildLinePath,
    ...metrics
  };
}
