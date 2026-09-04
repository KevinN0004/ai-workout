import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import SummaryView from "./dashboard/SummaryView";
import DashboardHeader from "./dashboard/DashboardHeader";
import DashboardDrawer from "./dashboard/DashboardDrawer";
import DashboardBottomNav from "./dashboard/DashboardBottomNav";
import DashboardAtAGlance from "./dashboard/DashboardAtAGlance";
import DashboardWorkoutModal from "./dashboard/DashboardWorkoutModal";
import useDashboardMetrics from "./dashboard/useDashboardMetrics";
import { getLocalDateKey } from "../app/units";
import "./DashboardPage.css";

const WorkoutsView = lazy(() => import("./dashboard/WorkoutsView"));
const CaloriesView = lazy(() => import("./dashboard/CaloriesView"));
const PlansView = lazy(() => import("./dashboard/PlansView"));
const MealView = lazy(() => import("./dashboard/MealView"));
const TipsView = lazy(() => import("./dashboard/TipsView"));
const SettingsView = lazy(() => import("./dashboard/SettingsView"));
const DashboardHomeView = lazy(() => import("./dashboard/DashboardHomeView"));

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
  weatherLastUpdatedAt,
  refreshWeatherRecommendation,
  airQualityData,
  airQualityLoading,
  airQualityError,
  airQualityLastUpdatedAt,
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
  const {
    calories,
    mealLogs,
    progressMetrics,
    goals,
    buildLinePath,
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
  } = useDashboardMetrics({
    dashboard,
    goalForm,
    formGoal: form?.goal,
    weekDays,
    latestPlanByWeekday
  });

  // Must stay above the `if (!user)` early return below. `user` starts null in
  // App.jsx and is only set once /api/auth/me resolves, so a hook declared after
  // that return makes the hook count grow between renders -- React then throws
  // "Rendered more hooks than during the previous render." on the signed-in
  // re-render, which crashed a direct load of /dashboard.
  const nextWorkout = useMemo(() => {
    const parseDateAsTime = (value) => {
      if (!value) return 0;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    };
    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const upcoming = recentWorkouts
      .map((item) => ({ ...item, parsedDate: new Date(parseDateAsTime(item?.date)) }))
      .filter((item) => item.parsedDate.getTime() >= todayStart.getTime())
      .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
    if (upcoming.length) return { ...upcoming[0], context: "Upcoming" };
    if (recentWorkouts.length) return { ...recentWorkouts[0], context: "Latest" };
    return null;
  }, [recentWorkouts]);

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

  if (!user) {
    return (
      <div className="page dashboard-page">
        <DashboardHeader
          user={user}
          go={go}
          onNavigateSummary={() => go("/dashboard")}
        />
      </div>
    );
  }

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
  const formatRelativeUpdatedAt = (timestamp) => {
    if (!timestamp) return "Not updated yet";
    const diffMs = Math.max(Date.now() - Number(timestamp), 0);
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 1) return "Last updated just now";
    if (diffMinutes === 1) return "Last updated 1m ago";
    if (diffMinutes < 60) return `Last updated ${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours === 1) return "Last updated 1h ago";
    if (diffHours < 24) return `Last updated ${diffHours}h ago`;
    return `Last updated on ${new Date(Number(timestamp)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    })}`;
  };

  const showInitialDashboardLoading = dashLoading && !dashboard;
  const lazyDashboardViewFallback = (
    <section className="panel dashboard-loading-card" role="status" aria-live="polite">
      <p className="muted">Loading view...</p>
    </section>
  );
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
  const renderActiveDashboardView = () => {
    if (activeDashView === "summary") {
      return (
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
          weatherLastUpdatedAt={weatherLastUpdatedAt}
          refreshWeatherRecommendation={refreshWeatherRecommendation}
          airQualityData={airQualityData}
          airQualityLoading={airQualityLoading}
          airQualityError={airQualityError}
          airQualityLastUpdatedAt={airQualityLastUpdatedAt}
          refreshAirQuality={refreshAirQuality}
          onOpenPlans={() => navigateDashView("plans")}
          onOpenMeal={() => navigateDashView("meal")}
        />
      );
    }

    if (activeDashView === "workouts") {
      return (
        <Suspense fallback={lazyDashboardViewFallback}>
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
        </Suspense>
      );
    }

    if (activeDashView === "calories") {
      return (
        <Suspense fallback={lazyDashboardViewFallback}>
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
        </Suspense>
      );
    }

    if (activeDashView === "plans") {
      return (
        <Suspense fallback={lazyDashboardViewFallback}>
          <PlansView
            weekDays={weekDays}
            latestPlanByWeekday={latestPlanByWeekday}
            openPlannerFromProfile={openPlannerFromProfile}
            dashboard={dashboard}
            fallbackPlan={form}
            onRemoveSavedExercise={onRemoveSavedExercise}
            onOpenGuides={() => navigateDashView("tips")}
          />
        </Suspense>
      );
    }

    if (activeDashView === "meal") {
      return (
        <Suspense fallback={lazyDashboardViewFallback}>
          <MealView
            dashboard={dashboard}
            fallbackPlan={form}
            mealLogForm={mealLogForm}
            setMealLogForm={setMealLogForm}
            submitMealLog={submitMealLog}
            mealLogs={mealLogs}
          />
        </Suspense>
      );
    }

    if (activeDashView === "tips") {
      return (
        <Suspense fallback={lazyDashboardViewFallback}>
          <TipsView
            user={user}
            form={form}
            dashboard={dashboard}
            latestPlanByWeekday={latestPlanByWeekday}
            weatherData={weatherData}
            onSaveExerciseToPlan={onSaveExerciseToPlan}
          />
        </Suspense>
      );
    }

    if (activeDashView === "settings") {
      return (
        <Suspense fallback={lazyDashboardViewFallback}>
          <SettingsView user={user} personal={personal} />
        </Suspense>
      );
    }

    if (activeDashView === "home") {
      return (
        <Suspense fallback={lazyDashboardViewFallback}>
          <DashboardHomeView go={go} />
        </Suspense>
      );
    }

    return null;
  };

  return (
    <>
      <div className="page dashboard-page">
        <DashboardHeader
          user={user}
          go={go}
          onOpenMenu={() => setDashNavOpen(true)}
          onNavigateSummary={() => navigateDashView("summary")}
          profileMenuRef={profileMenuRef}
          profileMenuOpen={profileMenuOpen}
          onToggleProfileMenu={() => setProfileMenuOpen((prev) => !prev)}
          onOpenSettings={() => {
            navigateDashView("settings");
            setProfileMenuOpen(false);
          }}
          onLogout={() => {
            setProfileMenuOpen(false);
            onLogout();
          }}
        />
        <p className="muted dashboard-header-note">Visual summary of your progress and key metrics.</p>

        <DashboardAtAGlance
          nextWorkout={nextWorkout}
          caloriesGap={caloriesGap}
          avgCalories={avgCalories}
          calorieGoal={calorieGoal}
          weatherLoading={weatherLoading}
          weatherRecommendation={weatherRecommendation}
          weatherError={weatherError}
          weatherLastUpdatedAt={weatherLastUpdatedAt}
          airQualityLoading={airQualityLoading}
          airSummary={airSummary}
          airQualityError={airQualityError}
          airQualityLastUpdatedAt={airQualityLastUpdatedAt}
          formatRelativeUpdatedAt={formatRelativeUpdatedAt}
          onAddWorkout={() => {
            setWorkoutForm((prev) => ({ ...prev, date: getLocalDateKey() }));
            setWorkoutModalOpen(true);
          }}
          onOpenMeal={() => navigateDashView("meal")}
          onOpenTips={() => navigateDashView("tips")}
        />

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
          {!showInitialDashboardLoading && (
            <div className="dashboard-view-shell is-active" aria-hidden="false">
              {renderActiveDashboardView()}
            </div>
          )}
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
            <span className="dashboard-toast-message">{dashboardToast.message}</span>
            {dashboardToast.actionLabel && typeof dashboardToast.onAction === "function" && (
              <button
                type="button"
                className="ghost dashboard-toast-action"
                onClick={() => {
                  const action = dashboardToast.onAction;
                  clearDashboardToast();
                  action();
                }}
              >
                {dashboardToast.actionLabel}
              </button>
            )}
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

        <DashboardWorkoutModal
          open={workoutModalOpen}
          workoutForm={workoutForm}
          setWorkoutForm={setWorkoutForm}
          onClose={() => setWorkoutModalOpen(false)}
          onSubmit={submitWorkout}
        />

        {plannerModal}
        {generatedPlanModal}
      </div>

      <DashboardDrawer
        open={dashNavOpen}
        dashView={dashView}
        items={DASH_DRAWER_ITEMS}
        onClose={() => setDashNavOpen(false)}
        onNavigate={(nextView) => navigateDashView(nextView, { closeDrawer: true })}
      />
      <DashboardBottomNav
        dashView={dashView}
        onNavigate={(nextView) => navigateDashView(nextView)}
      />
    </>
  );
}




