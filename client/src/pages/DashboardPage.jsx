import { useEffect, useMemo, useRef, useState } from "react";
import SummaryView from "./dashboard/SummaryView";
import WorkoutsView from "./dashboard/WorkoutsView";
import CaloriesView from "./dashboard/CaloriesView";
import PlansView from "./dashboard/PlansView";
import MealView from "./dashboard/MealView";
import TipsView from "./dashboard/TipsView";
import SettingsView from "./dashboard/SettingsView";
import DashboardHomeView from "./dashboard/DashboardHomeView";
import { buildWeeklyMealPlan } from "./dashboard/planUtils";
import ModalPortal from "../components/ModalPortal";
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

const DASH_VIEW_TO_ROUTE = {
  summary: "/dashboard",
  workouts: "/dashboard/workouts",
  calories: "/dashboard/calories",
  plans: "/dashboard/plans",
  meal: "/dashboard/meal",
  tips: "/dashboard/tips",
  settings: "/dashboard/settings",
  home: "/dashboard/home"
};

const DASH_DRAWER_ITEMS = [
  { key: "summary", label: "Home" },
  { key: "workouts", label: "Logs" },
  { key: "calories", label: "Goal" },
  { key: "plans", label: "Weekly plan" },
  { key: "meal", label: "Meal prep" },
  { key: "tips", label: "Guides" },
  { key: "settings", label: "Settings" }
];

export default function DashboardPage({
  user,
  personal,
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
  generatedPlanModal,
  dashboardToast,
  clearDashboardToast
}) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const workouts = Array.isArray(dashboard?.workoutSessions) && dashboard.workoutSessions.length
    ? dashboard.workoutSessions
    : dashboard?.workouts || [];
  const calories = dashboard?.calories || [];
  const mealLogs = Array.isArray(dashboard?.mealLogs) ? dashboard.mealLogs : [];
  const progressMetrics = Array.isArray(dashboard?.progressMetrics)
    ? dashboard.progressMetrics
    : [];
  const goals = dashboard?.goals || goalForm;

  useEffect(() => {
    if (!profileMenuOpen) return undefined;

    const closeProfileMenuOnOutsideClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };
    const closeProfileMenuOnEscape = (event) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeProfileMenuOnOutsideClick);
    document.addEventListener("keydown", closeProfileMenuOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeProfileMenuOnOutsideClick);
      document.removeEventListener("keydown", closeProfileMenuOnEscape);
    };
  }, [profileMenuOpen]);
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
    todayRecommendation,
    weeklyTrends
  } = useMemo(() => {
    const today = new Date();
    const todayDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const last7Cutoff = new Date(todayDate);
    last7Cutoff.setDate(last7Cutoff.getDate() - 6);
    const previous7Start = new Date(last7Cutoff);
    previous7Start.setDate(previous7Start.getDate() - 7);
    const previous7End = new Date(last7Cutoff);
    previous7End.setDate(previous7End.getDate() - 1);
    const inLast7Days = (value) =>
      Boolean(value && value >= last7Cutoff && value <= todayDate);
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
      previous7Calories.reduce(
        (sum, item) => sum + Number(item?.calories || 0),
        0
      ) / (previous7Calories.length || 1);
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
      weightTrendCandidates.length > 0
        ? Number(weightTrendCandidates[0]?.weightLb)
        : null;
    const previousWeight =
      weightTrendCandidates.length > 1
        ? Number(weightTrendCandidates[1]?.weightLb)
        : null;
    const weightDeltaVsLastLog =
      latestWeight !== null &&
      previousWeight !== null &&
      Number.isFinite(latestWeight) &&
      Number.isFinite(previousWeight)
        ? Number((latestWeight - previousWeight).toFixed(1))
        : null;

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
  }, [
    calories,
    workouts,
    goals,
    dashboard,
    progressMetrics,
    form?.goal,
    weekDays,
    latestPlanByWeekday
  ]);

  if (!user) {
    return (
      <div className="page dashboard-page">
        <header className="title">
          <div className="header-top">
            <div className="header-left" />
            <div className="header-center">
              <h1>
                <button
                  type="button"
                  className="dashboard-title-button"
                  onClick={() => go("/dashboard")}
                  aria-label="Go to dashboard summary"
                  title="Go to summary"
                >
                  Dashboard
                </button>
              </h1>
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

  const navigateDashView = (nextView, { closeDrawer = false } = {}) => {
    setDashView(nextView);
    go(DASH_VIEW_TO_ROUTE[nextView] || "/dashboard");
    if (closeDrawer) {
      setDashNavOpen(false);
    }
  };

  const weatherRecommendation = weatherData?.recommendation || null;
  const airSummary = airQualityData?.summary || null;
  const caloriesGap = Math.round(calorieGoal - avgCalories);
  const nextWorkout = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const upcoming = recentWorkouts
      .map((item) => ({ ...item, parsedDate: parseDateValue(item?.date) }))
      .filter((item) => item.parsedDate && item.parsedDate >= todayStart)
      .sort((a, b) => a.parsedDate - b.parsedDate);
    if (upcoming.length) return { ...upcoming[0], context: "Upcoming" };
    if (recentWorkouts.length) return { ...recentWorkouts[0], context: "Latest" };
    return null;
  }, [recentWorkouts]);

  const showInitialDashboardLoading = dashLoading && !dashboard;
  const dashboardViews = {
    summary: (
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
        weeklyTrends={weeklyTrends}
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
        onOpenPlans={() => navigateDashView("plans")}
        onOpenMeal={() => navigateDashView("meal")}
      />
    ),
    workouts: (
      <WorkoutsView
        workouts={recentWorkouts}
        calories={calories}
        mealLogs={mealLogs}
        progressMetrics={progressMetrics}
        setWorkoutForm={setWorkoutForm}
        setWorkoutModalOpen={setWorkoutModalOpen}
        onOpenCalories={() => navigateDashView("calories")}
        onOpenMeal={() => navigateDashView("meal")}
      />
    ),
    calories: (
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
    ),
    plans: (
      <PlansView
        weekDays={weekDays}
        latestPlanByWeekday={latestPlanByWeekday}
        openPlannerFromProfile={openPlannerFromProfile}
        dashboard={dashboard}
        fallbackPlan={form}
        onRemoveSavedExercise={onRemoveSavedExercise}
        onOpenGuides={() => navigateDashView("tips")}
      />
    ),
    meal: (
      <MealView
        dashboard={dashboard}
        fallbackPlan={form}
        mealLogForm={mealLogForm}
        setMealLogForm={setMealLogForm}
        submitMealLog={submitMealLog}
        mealLogs={mealLogs}
      />
    ),
    tips: (
      <TipsView
        user={user}
        form={form}
        dashboard={dashboard}
        latestPlanByWeekday={latestPlanByWeekday}
        weatherData={weatherData}
        onSaveExerciseToPlan={onSaveExerciseToPlan}
      />
    ),
    settings: <SettingsView user={user} personal={personal} />,
    home: <DashboardHomeView go={go} />
  };
  const dashViewOrder = [
    "summary",
    "workouts",
    "calories",
    "plans",
    "meal",
    "tips",
    "settings",
    "home"
  ];
  const activeDashView = dashViewOrder.includes(dashView) ? dashView : "summary";

  return (
    <>
      <div className="page dashboard-page">
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
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
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
              <h1>
                <button
                  type="button"
                  className="dashboard-title-button"
                  onClick={() => navigateDashView("summary")}
                  aria-label="Go to dashboard summary"
                  title="Go to summary"
                >
                  Dashboard
                </button>
              </h1>
            </div>
            <div className="auth-actions">
              <div className="profile-menu" ref={profileMenuRef}>
                <button
                  type="button"
                  className="ghost icon-button profile-icon-button"
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  aria-label="Open profile menu"
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                  aria-controls="profile-menu-dropdown"
                  title={user.email}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
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
                {profileMenuOpen && (
                  <div id="profile-menu-dropdown" className="profile-menu-dropdown" role="menu">
                    <button
                      type="button"
                      className="profile-menu-item"
                      role="menuitem"
                      onClick={() => {
                        navigateDashView("settings");
                        setProfileMenuOpen(false);
                      }}
                    >
                      View profile
                    </button>
                    <button
                      type="button"
                      className="profile-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        onLogout();
                      }}
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <p className="muted dashboard-header-note">Visual summary of your progress and key metrics.</p>

        <section className="panel dashboard-at-a-glance">
          <div className="dashboard-at-a-glance-head">
            <h2>Today at a glance</h2>
            <p className="muted">Quick status and shortcuts for your day.</p>
          </div>
          <div className="dashboard-at-a-glance-grid equal-card-grid">
            <article className="dashboard-glance-card card-shell">
              <div className="card-section-head">
                <h3>{nextWorkout ? `${nextWorkout.context} workout` : "Workout status"}</h3>
              </div>
              <div className="card-section-body">
                {nextWorkout ? (
                  <>
                    <p className="dashboard-glance-value">
                      {nextWorkout.date || "Date pending"} - {nextWorkout.focus || "General"}
                    </p>
                    <p className="muted">{nextWorkout.duration || "--"} min planned</p>
                  </>
                ) : (
                  <p className="muted">No workout logged yet. Add one to get started.</p>
                )}
              </div>
            </article>
            <article className="dashboard-glance-card card-shell">
              <div className="card-section-head">
                <h3>Calories gap</h3>
              </div>
              <div className="card-section-body">
                <p className="dashboard-glance-value">
                  {caloriesGap === 0
                    ? "On target"
                    : caloriesGap > 0
                    ? `${caloriesGap} under target`
                    : `${Math.abs(caloriesGap)} over target`}
                </p>
                <p className="muted">
                  Avg {Math.round(avgCalories)} / goal {calorieGoal} kcal
                </p>
              </div>
            </article>
            <article className="dashboard-glance-card card-shell">
              <div className="card-section-head">
                <h3>Weather</h3>
              </div>
              <div className="card-section-body">
                <p className="dashboard-glance-value">
                  {weatherLoading
                    ? "Checking..."
                    : weatherError
                    ? "Unavailable"
                    : weatherRecommendation?.workoutType === "outdoor"
                    ? "Outdoor friendly"
                    : weatherRecommendation?.workoutType === "indoor"
                    ? "Indoor suggested"
                    : "Unavailable"}
                </p>
                <p className="muted">{weatherRecommendation?.summary || "No weather update yet."}</p>
              </div>
            </article>
            <article className="dashboard-glance-card card-shell">
              <div className="card-section-head">
                <h3>Air quality</h3>
              </div>
              <div className="card-section-body">
                <p className="dashboard-glance-value">
                  {airQualityLoading
                    ? "Checking..."
                    : airQualityError
                    ? "Unavailable"
                    : airSummary?.level || "Unavailable"}
                </p>
                <p className="muted">
                  {airSummary?.guidance || "No air quality guidance available."}
                </p>
              </div>
            </article>
          </div>
          <div className="dashboard-glance-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setWorkoutForm((prev) => ({ ...prev, date: toDateKey(new Date()) }));
                setWorkoutModalOpen(true);
              }}
            >
              Add workout
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => navigateDashView("meal")}
            >
              Log meal
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => navigateDashView("tips")}
            >
              Open guides
            </button>
            <button
              type="button"
              className="ghost"
              onClick={openPlannerFromProfile}
            >
              Update plan
            </button>
          </div>
        </section>

        <main className="dashboard-grid">
          {showInitialDashboardLoading && (
            <section className="panel dashboard-loading-card dashboard-loading-skeleton" role="status" aria-live="polite">
              <div className="dashboard-skeleton-bar dashboard-skeleton-title" />
              <div className="dashboard-skeleton-row">
                <span className="dashboard-skeleton-chip" />
                <span className="dashboard-skeleton-chip" />
                <span className="dashboard-skeleton-chip" />
              </div>
              <div className="dashboard-skeleton-grid">
                <div className="dashboard-skeleton-block" />
                <div className="dashboard-skeleton-block" />
                <div className="dashboard-skeleton-block" />
              </div>
            </section>
          )}
          {dashViewOrder.map((viewKey) => {
            const isActive = !showInitialDashboardLoading && viewKey === activeDashView;
            return (
              <div
                key={viewKey}
                className={`dashboard-view-shell ${isActive ? "is-active" : "is-hidden"}`}
                aria-hidden={!isActive}
              >
                {dashboardViews[viewKey]}
              </div>
            );
          })}
        </main>

        {dashLoading && dashboard && (
          <p className="muted dashboard-inline-status">Refreshing dashboard data...</p>
        )}
        {dashError && <p className="error">{dashError}</p>}
        {dashboardToast && (
          <div
            className={`dashboard-toast dashboard-toast-${dashboardToast.tone || "success"}`}
            role="status"
            aria-live="polite"
          >
            <span>{dashboardToast.message}</span>
            <button
              type="button"
              className="ghost dashboard-toast-close"
              aria-label="Dismiss message"
              onClick={clearDashboardToast}
            >
              x
            </button>
          </div>
        )}

        {workoutModalOpen && (
          <ModalPortal open={workoutModalOpen}>
            <div
              className="modal-backdrop dashboard-modal-backdrop"
              role="dialog"
              aria-modal="true"
              onClick={() => setWorkoutModalOpen(false)}
            >
              <div
                className="modal dashboard-modal dashboard-workout-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h2>Add workout</h2>
                  <button
                    type="button"
                    className="ghost icon-button"
                    aria-label="Close workout modal"
                    title="Close"
                    onClick={() => setWorkoutModalOpen(false)}
                  >
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
                <form className="form dashboard-workout-form" onSubmit={submitWorkout}>
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
                <div className="dashboard-workout-grid">
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
          </ModalPortal>
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
                className="ghost icon-button"
                aria-label="Close dashboard menu"
                title="Close menu"
                onClick={() => setDashNavOpen(false)}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="drawer-links">
              {DASH_DRAWER_ITEMS.filter((item) => item.key !== "settings").map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={dashView === item.key ? "active" : ""}
                  onClick={() => {
                    navigateDashView(item.key, { closeDrawer: true });
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="drawer-footer">
              <button
                type="button"
                className={dashView === "settings" ? "active" : ""}
                onClick={() => {
                  navigateDashView("settings", { closeDrawer: true });
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




