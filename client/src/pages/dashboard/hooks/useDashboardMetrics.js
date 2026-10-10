/**
 * The dashboard's derived numbers: the deduplicated logs, the seven-day
 * averages and goal progress, the week and month trend series, and today's
 * planned workout and meals. Called by DashboardPage.
 */
import { useMemo } from "react";
import { buildWeeklyMealPlan } from "../planUtils";
import { buildLinePath } from "../../../app/linePath";

// A Date or null. A bare YYYY-MM-DD is read as local midnight: `new Date` would
// read it as UTC midnight, which west of UTC falls on the previous local day.
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

// One coercion for every reading that gets summed, so the accumulation loops
// and the averages below cannot disagree about the same row. A single
// unparseable value would otherwise be enough -- `sum + NaN` stays NaN for the
// rest of the fold -- and avgCalories is rendered directly and drives a
// progress-bar width, so the card would read "NaN" and the bar get
// `width: NaN%`.
//
// Such a row contributes 0. A measured 0 is untouched: it is a real reading and
// still counts in the average's divisor, so it must keep pulling the average
// down.
const toMetricNumber = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Keeps the first row for each id, or for each content key when a row has no
// id. A row with neither is kept.
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

/**
 * Derives what the dashboard's views chart and summarise. `goalForm` stands in
 * for `dashboard.goals` until there is a dashboard, `formGoal` (the planner
 * form's goal) is the last fallback for the meal plan's goal, and `weekDays`
 * with `latestPlanByWeekday` give the meal plan its days and mark which are
 * training days. Returns the deduplicated lists, `goals`, app/linePath.js's
 * `buildLinePath` for the charts, and the metrics, all recomputed only when
 * their inputs change.
 */
export default function useDashboardMetrics({
  dashboard,
  goalForm,
  formGoal,
  weekDays,
  latestPlanByWeekday
}) {
  // ---- Deduplicated lists ---------------------------------------------------

  // The dashboard carries the newest sessions twice: `workouts` is the list
  // userReadRepository loads, and `workoutSessions` is the first page that
  // buildDashboardResponse (dashboardCollectionService.js) loads separately in
  // its place. A pending workout is added to both. Both use mapWorkoutSession, so
  // merging them and deduplicating by id keeps one of each.
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

  // ---- Metrics --------------------------------------------------------------
  const metrics = useMemo(() => {
    // This week is the seven days ending today, and last week the seven before
    // it, both counted from local midnight.
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

    // Per-day totals for the trend series, and each log split into this week
    // and last week. A row whose date does not parse is skipped.
    const caloriesByDate = {};
    const last7Calories = [];
    const previous7Calories = [];
    for (const item of calories) {
      const parsedDate = parseDateValue(item?.date);
      if (!parsedDate) continue;
      const key = toDateKey(parsedDate);
      caloriesByDate[key] = (caloriesByDate[key] || 0) + toMetricNumber(item?.calories);
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
      workoutMinutesByDate[key] = (workoutMinutesByDate[key] || 0) + toMetricNumber(item?.duration);
      if (inLast7Days(parsedDate)) {
        last7Workouts.push(item);
      } else if (inPrevious7Days(parsedDate)) {
        previous7Workouts.push(item);
      }
    }

    // The average of this week's and of last week's calorie entries, and
    // progress toward the goals.
    const avgCalories =
      last7Calories.reduce((sum, item) => sum + toMetricNumber(item?.calories), 0) /
      (last7Calories.length || 1);
    const previousAvgCalories =
      previous7Calories.reduce((sum, item) => sum + toMetricNumber(item?.calories), 0) /
      (previous7Calories.length || 1);
    const weeklyGoal = Math.max(Number(goals.weeklyWorkouts || 3), 1);
    const workoutProgress = Math.min(100, Math.round((last7Workouts.length / weeklyGoal) * 100));
    const calorieGoal = Math.max(Number(goals.targetCalories || 2200), 1);
    const calorieProgress = Math.min(100, Math.round((avgCalories / calorieGoal) * 100));

    // Trend series for the week and month charts, one point per day.
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

    // A heuristic score with no outside source, not a measurement: a day's
    // distance from the calorie goal and its training minutes each cost points,
    // each up to a cap; a rest day earns a few; and the result is clamped. A day
    // with no calorie entry counts as on goal.
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

    // Workouts newest first, and the pace toward this week's workout goal.
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

    // The latest weight by date, and its change since the one before.
    // Number(null) is 0, which is finite, so a metric logged without a weight
    // passes this filter as a reading of 0 lb.
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

    // Today's lines from the latest plan, and today's meals from the meal plan
    // built for that plan's training days.
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
