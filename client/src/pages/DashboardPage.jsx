import { useMemo } from "react";
import SummaryView from "./dashboard/SummaryView";
import WorkoutsView from "./dashboard/WorkoutsView";
import CaloriesView from "./dashboard/CaloriesView";
import PlansView from "./dashboard/PlansView";
import MealView from "./dashboard/MealView";
import TipsView from "./dashboard/TipsView";
import SettingsView from "./dashboard/SettingsView";
import DashboardHomeView from "./dashboard/DashboardHomeView";
import { buildWeeklyMealPlan } from "./dashboard/planUtils";
import "./DashboardPage.css";

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

export default function DashboardPage({
  gradient,
  user,
  go,
  onLogout,
  dashboard,
  goalForm,
  setGoalForm,
  dashView,
  setDashView,
  dashNavOpen,
  setDashNavOpen,
  dashLoading,
  dashError,
  workoutModalOpen,
  setWorkoutModalOpen,
  workoutForm,
  setWorkoutForm,
  submitWorkout,
  form,
  openPlannerFromProfile,
  calorieForm,
  setCalorieForm,
  submitCalories,
  mealLogForm,
  setMealLogForm,
  submitMealLog,
  progressForm,
  setProgressForm,
  submitProgressMetric,
  submitGoals,
  weekDays,
  latestPlanByWeekday,
  weatherData,
  weatherLoading,
  weatherError,
  refreshWeatherRecommendation,
  airQualityData,
  airQualityLoading,
  airQualityError,
  refreshAirQuality,
  onSaveExerciseToPlan,
  onRemoveSavedExercise,
  plannerModal,
  generatedPlanModal
}) {
  const workouts = Array.isArray(dashboard?.workoutSessions) && dashboard.workoutSessions.length
    ? dashboard.workoutSessions
    : dashboard?.workouts || [];
  const calories = dashboard?.calories || [];
  const mealLogs = Array.isArray(dashboard?.mealLogs) ? dashboard.mealLogs : [];
  const progressMetrics = Array.isArray(dashboard?.progressMetrics)
    ? dashboard.progressMetrics
    : [];
  const goals = dashboard?.goals || goalForm;
  const {
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
    todayRecommendation
  } = useMemo(() => {
    const today = new Date();
    const todayDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const last7Cutoff = new Date(todayDate);
    last7Cutoff.setDate(last7Cutoff.getDate() - 6);
    const inLast7Days = (value) =>
      Boolean(value && value >= last7Cutoff && value <= todayDate);

    const caloriesByDate = {};
    const last7Calories = [];
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
      }
    }

    const workoutsByDate = {};
    const workoutMinutesByDate = {};
    const last7Workouts = [];
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
      }
    }

    const avgCalories =
      last7Calories.reduce((sum, item) => sum + Number(item?.calories || 0), 0) /
      (last7Calories.length || 1);
    const weeklyGoal = Math.max(Number(goals.weeklyWorkouts || 3), 1);
    const workoutProgress = Math.min(
      100,
      Math.round((last7Workouts.length / weeklyGoal) * 100)
    );
    const calorieGoal = Math.max(Number(goals.targetCalories || 2200), 1);
    const calorieProgress = Math.min(
      100,
      Math.round((avgCalories / calorieGoal) * 100)
    );

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
      return Math.round(
        clamp(78 - caloriePenalty - loadPenalty + restBonus, 30, 95)
      );
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
        avgCalories:
          caloriesSeries.reduce((sum, value) => sum + value, 0) /
          (keys.length || 1),
        avgRecovery:
          recoverySeries.reduce((sum, value) => sum + value, 0) /
          (keys.length || 1)
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
      avgDailyWorkouts > 0
        ? Math.ceil(remainingWorkouts / avgDailyWorkouts)
        : null;
    const goalPaceText =
      remainingWorkouts === 0
        ? "Weekly workout goal reached."
        : avgDailyWorkouts > 0
        ? `At this pace, ${daysToGoal} day${daysToGoal === 1 ? "" : "s"} to reach ${weeklyGoal} workouts.`
        : "Log a workout to start your pace estimate.";
    const calorieDelta = Math.round(avgCalories - calorieGoal);

    const latestPlan = dashboard?.plans?.[0];
    const weeklyMealPlan = buildWeeklyMealPlan({
      weekDays,
      latestPlanByWeekday,
      goalText:
        latestPlan?.goal ||
        dashboard?.goals?.goalType ||
        form?.goal ||
        "Build lean strength and energy",
      targetCalories: goals.targetCalories
    });
    const todayWeekday = todayDate.toLocaleDateString("en-US", {
      weekday: "long"
    });
    const todayMealPlan =
      weeklyMealPlan.days.find((day) => day.key === todayWeekday) ||
      weeklyMealPlan.days[0] ||
      null;
    const todayRecommendation = {
      weekday: todayWeekday,
      workoutLines: latestPlanByWeekday?.[todayWeekday] || [],
      mealPlan: todayMealPlan
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
      todayRecommendation
    };
  }, [
    calories,
    workouts,
    goals,
    dashboard,
    form?.goal,
    weekDays,
    latestPlanByWeekday
  ]);

  if (!user) {
    return (
      <div className="page" style={gradient}>
        <header className="title">
          <div className="header-top">
            <div className="header-left" />
            <div className="header-center">
              <h1>Dashboard</h1>
            </div>
            <div className="auth-actions">
              <button type="button" className="ghost" onClick={() => go("/auth")}>
                Login / Sign up
              </button>
            </div>
          </div>
          <p className="muted">Please sign in to access your dashboard.</p>
        </header>
      </div>
    );
  }

  const buildLinePath = (values, width = 260, height = 110, padding = 10) => {
    const safeValues = values.length ? values : [0];
    const max = Math.max(...safeValues, 1);
    const min = Math.min(...safeValues, 0);
    const range = max - min || 1;
    const stepX = (width - padding * 2) / Math.max(safeValues.length - 1, 1);

    return safeValues
      .map((value, index) => {
        const x = padding + stepX * index;
        const y =
          height - padding - ((value - min) / range) * (height - padding * 2);
        return `${index === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  };

  let activeView = null;

  if (dashView === "summary") {
    activeView = (
      <SummaryView
        form={form}
        openPlannerFromProfile={openPlannerFromProfile}
        last7Workouts={last7Workouts}
        avgCalories={avgCalories}
        goals={goals}
        goalForm={goalForm}
        weeklyGoal={weeklyGoal}
        workoutProgress={workoutProgress}
        calorieGoal={calorieGoal}
        calorieProgress={calorieProgress}
        workouts={recentWorkouts}
        buildLinePath={buildLinePath}
        trendRanges={trendRanges}
        todayRecommendation={todayRecommendation}
        weatherData={weatherData}
        weatherLoading={weatherLoading}
        weatherError={weatherError}
        refreshWeatherRecommendation={refreshWeatherRecommendation}
        airQualityData={airQualityData}
        airQualityLoading={airQualityLoading}
        airQualityError={airQualityError}
        refreshAirQuality={refreshAirQuality}
        onOpenPlans={() => setDashView("plans")}
        onOpenMeal={() => setDashView("meal")}
      />
    );
  } else if (dashView === "workouts") {
    activeView = (
      <WorkoutsView
        workouts={workouts}
        setWorkoutForm={setWorkoutForm}
        setWorkoutModalOpen={setWorkoutModalOpen}
      />
    );
  } else if (dashView === "calories") {
    activeView = (
      <CaloriesView
        goalForm={goalForm}
        setGoalForm={setGoalForm}
        avgCalories={avgCalories}
        calorieGoal={calorieGoal}
        calorieDelta={calorieDelta}
        buildLinePath={buildLinePath}
        calorieSeries={calorieSeries}
        workoutSeries={workoutSeries}
        last7Keys={last7Keys}
        submitCalories={submitCalories}
        calorieForm={calorieForm}
        setCalorieForm={setCalorieForm}
        calories={calories}
        goalPaceText={goalPaceText}
        submitGoals={submitGoals}
        progressMetrics={progressMetrics}
        progressForm={progressForm}
        setProgressForm={setProgressForm}
        submitProgressMetric={submitProgressMetric}
      />
    );
  } else if (dashView === "plans") {
    activeView = (
      <PlansView
        weekDays={weekDays}
        latestPlanByWeekday={latestPlanByWeekday}
        openPlannerFromProfile={openPlannerFromProfile}
        dashboard={dashboard}
        fallbackPlan={form}
        onRemoveSavedExercise={onRemoveSavedExercise}
      />
    );
  } else if (dashView === "meal") {
    activeView = (
      <MealView
        dashboard={dashboard}
        fallbackPlan={form}
        mealLogForm={mealLogForm}
        setMealLogForm={setMealLogForm}
        submitMealLog={submitMealLog}
        mealLogs={mealLogs}
      />
    );
  } else if (dashView === "tips") {
    activeView = (
      <TipsView
        user={user}
        form={form}
        dashboard={dashboard}
        latestPlanByWeekday={latestPlanByWeekday}
        weatherData={weatherData}
        onSaveExerciseToPlan={onSaveExerciseToPlan}
      />
    );
  } else if (dashView === "settings") {
    activeView = <SettingsView user={user} onLogout={onLogout} />;
  } else if (dashView === "home") {
    activeView = <DashboardHomeView go={go} />;
  }

  return (
    <>
      <div className="page" style={gradient}>
        <header className="title">
          <div className="header-top">
            <div className="header-left">
              <div className="nav-trigger">
                <button
                  type="button"
                  className="ghost icon-button"
                  onClick={() => setDashNavOpen(true)}
                  aria-label="Open dashboard menu"
                  title="Open menu"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      d="M4 7h16M4 12h16M4 17h16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="header-center">
              <h1>Dashboard</h1>
            </div>
            <div className="auth-actions">
              <button
                type="button"
                className="ghost icon-button profile-icon-button"
                onClick={() => setDashView("settings")}
                aria-label="Open profile settings"
                title={user.email}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <circle
                    cx="12"
                    cy="8"
                    r="4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M5 20c0-3.1 2.8-5 7-5s7 1.9 7 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button type="button" className="ghost" onClick={onLogout}>
                Log out
              </button>
            </div>
          </div>
          <p className="muted">Visual summary of your progress and key metrics.</p>
        </header>

        <main className="dashboard-grid">{activeView}</main>

        {dashLoading && <p className="muted">Loading dashboard...</p>}
        {dashError && <p className="error">{dashError}</p>}

        {workoutModalOpen && (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={() => setWorkoutModalOpen(false)}
          >
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add workout</h2>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setWorkoutModalOpen(false)}
                >
                  Close
                </button>
              </div>
              <form className="form dashboard-form workout-modal-form" onSubmit={submitWorkout}>
                <label>
                  Date
                  <input
                    type="date"
                    value={workoutForm.date}
                    onChange={(e) =>
                      setWorkoutForm((prev) => ({ ...prev, date: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Focus
                  <input
                    value={workoutForm.focus}
                    onChange={(e) =>
                      setWorkoutForm((prev) => ({ ...prev, focus: e.target.value }))
                    }
                    placeholder="Strength, conditioning..."
                  />
                </label>
                <label>
                  Duration (minutes)
                  <input
                    type="number"
                    min="10"
                    max="180"
                    value={workoutForm.duration}
                    onChange={(e) =>
                      setWorkoutForm((prev) => ({
                        ...prev,
                        duration: e.target.value
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  Exercises (comma-separated)
                  <input
                    value={workoutForm.exercises}
                    onChange={(e) =>
                      setWorkoutForm((prev) => ({
                        ...prev,
                        exercises: e.target.value
                      }))
                    }
                    placeholder="Squat, bench press, row"
                  />
                </label>
                <div className="dashboard-form-grid compact">
                  <label>
                    Sets
                    <input
                      type="number"
                      min="1"
                      max="80"
                      value={workoutForm.sets}
                      onChange={(e) =>
                        setWorkoutForm((prev) => ({
                          ...prev,
                          sets: e.target.value
                        }))
                      }
                    />
                  </label>
                  <label>
                    Reps
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={workoutForm.reps}
                      onChange={(e) =>
                        setWorkoutForm((prev) => ({
                          ...prev,
                          reps: e.target.value
                        }))
                      }
                    />
                  </label>
                  <label>
                    Intensity (RPE 1-10)
                    <input
                      type="number"
                      min="1"
                      max="10"
                      step="0.5"
                      value={workoutForm.intensityRpe}
                      onChange={(e) =>
                        setWorkoutForm((prev) => ({
                          ...prev,
                          intensityRpe: e.target.value
                        }))
                      }
                    />
                  </label>
                </div>
                <label>
                  Session notes
                  <textarea
                    value={workoutForm.notes}
                    onChange={(e) =>
                      setWorkoutForm((prev) => ({
                        ...prev,
                        notes: e.target.value
                      }))
                    }
                    rows={3}
                    placeholder="How did the session feel?"
                  />
                </label>
                <div className="modal-submit">
                  <button className="cta" type="submit">
                    Save workout
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {plannerModal}
        {generatedPlanModal}
      </div>

      {dashNavOpen && (
        <div className="drawer-backdrop" onClick={() => setDashNavOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()} role="navigation">
            <div className="drawer-header">
              <h3>Dashboard menu</h3>
              <button
                type="button"
                className="ghost"
                onClick={() => setDashNavOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="drawer-links">
              <button
                type="button"
                className={dashView === "summary" ? "active" : ""}
                onClick={() => {
                  setDashView("summary");
                  setDashNavOpen(false);
                }}
              >
                Home
              </button>
              <button
                type="button"
                className={dashView === "workouts" ? "active" : ""}
                onClick={() => {
                  setDashView("workouts");
                  setDashNavOpen(false);
                }}
              >
                Logs
              </button>
              <button
                type="button"
                className={dashView === "calories" ? "active" : ""}
                onClick={() => {
                  setDashView("calories");
                  setDashNavOpen(false);
                }}
              >
                Goal
              </button>
              <button
                type="button"
                className={dashView === "plans" ? "active" : ""}
                onClick={() => {
                  setDashView("plans");
                  setDashNavOpen(false);
                }}
              >
                Weekly plan
              </button>
              <button
                type="button"
                className={dashView === "meal" ? "active" : ""}
                onClick={() => {
                  setDashView("meal");
                  setDashNavOpen(false);
                }}
              >
                Meal prep
              </button>
              <button
                type="button"
                className={dashView === "tips" ? "active" : ""}
                onClick={() => {
                  setDashView("tips");
                  setDashNavOpen(false);
                }}
              >
                Guides
              </button>
            </div>
            <div className="drawer-footer">
              <button
                type="button"
                className={dashView === "settings" ? "active" : ""}
                onClick={() => {
                  setDashView("settings");
                  setDashNavOpen(false);
                }}
              >
                Settings
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
