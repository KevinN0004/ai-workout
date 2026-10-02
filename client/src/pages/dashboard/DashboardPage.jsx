/**
 * The dashboard page: header, navigation, the glance panel and the active view,
 * with the toast, the workout modal and App's planner modals. Rendered by App
 * on /dashboard and every path under it.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import SummaryView from "./views/SummaryView";
import DashboardHeader from "./components/DashboardHeader";
import DashboardDrawer from "./components/DashboardDrawer";
import DashboardBottomNav from "./components/DashboardBottomNav";
import DashboardAtAGlance from "./components/DashboardAtAGlance";
import DashboardWorkoutModal from "./components/DashboardWorkoutModal";
import useDashboardMetrics from "./hooks/useDashboardMetrics";
import { getLocalDateKey } from "../../app/units";
import "./DashboardPage.css";

const WorkoutsView = lazy(() => import("./views/WorkoutsView"));
const CaloriesView = lazy(() => import("./views/CaloriesView"));
const PlansView = lazy(() => import("./views/PlansView"));
const MealView = lazy(() => import("./views/MealView"));
const TipsView = lazy(() => import("./views/TipsView"));
const SettingsView = lazy(() => import("./views/SettingsView"));
const DashboardHomeView = lazy(() => import("./views/DashboardHomeView"));

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

// Every view the page can render, one per branch of renderActiveDashboardView.
const DASH_VIEW_ORDER = [
  "summary",
  "workouts",
  "calories",
  "plans",
  "meal",
  "tips",
  "settings",
  "home"
];

/**
 * Lays the dashboard out around the view App's `dashView` names; every view but
 * the summary loads lazily. Its data and handlers are App's: the dashboard and
 * the weather and air-quality readings (useDashboardData), the forms, and the
 * events.js handlers. The page derives its numbers through useDashboardMetrics
 * and keeps only the profile menu's state. Signed out, it renders the header
 * alone, which offers sign-in.
 */
export default function DashboardPage({
  user,
  go,
  onLogout,
  dashboard,
  goalForm,
  onSaveProfile,
  onChangePassword,
  onDeleteAccount,
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
  // ---- Profile menu, metrics and the next workout ---------------------------
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

  // Must stay above the `if (!user)` early return below. On a direct load of
  // /dashboard, `user` is null until App's session check resolves, so a hook
  // declared after that return would run on the signed-in render but not the
  // one before it, and React would throw "Rendered more hooks than during the
  // previous render.", crashing the page.
  //
  // The glance panel's workout: the earliest dated today or later, else the
  // most recent. The dates go through `new Date`, which reads a bare
  // YYYY-MM-DD as UTC midnight, so west of UTC a workout dated today falls
  // before local midnight and is not counted as upcoming.
  const nextWorkout = useMemo(() => {
    const parseDateAsTime = (value) => {
      if (!value) return 0;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    };
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const upcoming = recentWorkouts
      .map((item) => ({ ...item, parsedDate: new Date(parseDateAsTime(item?.date)) }))
      .filter((item) => item.parsedDate.getTime() >= todayStart.getTime())
      .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
    if (upcoming.length) return { ...upcoming[0], context: "Upcoming" };
    if (recentWorkouts.length) return { ...recentWorkouts[0], context: "Latest" };
    return null;
  }, [recentWorkouts]);

  // While the profile menu is open, a mousedown outside it or Escape closes it.
  // The listeners exist only while it is open.
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

  // ---- Signed out -----------------------------------------------------------
  if (!user) {
    return (
      <div className="page dashboard-page">
        <DashboardHeader user={user} go={go} onNavigateSummary={() => go("/dashboard")} />
      </div>
    );
  }

  // ---- Navigation and the glance panel's values -----------------------------

  // The links between views go through here, so the view and the URL move
  // together.
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

  // ---- The active view ------------------------------------------------------

  // The skeleton shows only before any dashboard, cached or fetched, is in hand;
  // a refresh over one shows the inline status line instead.
  const showInitialDashboardLoading = dashLoading && !dashboard;
  const lazyDashboardViewFallback = (
    <section className="panel dashboard-loading-card" role="status" aria-live="polite">
      <p className="muted">Loading view...</p>
    </section>
  );
  // A name outside the list falls back to the summary. App can hand over one:
  // DASHBOARD_ROUTE_VIEW_MAP is a plain object, so a slug such as
  // /dashboard/constructor resolves to an inherited member rather than null.
  const activeDashView = DASH_VIEW_ORDER.includes(dashView) ? dashView : "summary";
  // One branch per view. The summary is imported eagerly; every other view is
  // lazy and waits behind the same Suspense fallback.
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
          <SettingsView
            user={user}
            onSaveProfile={onSaveProfile}
            onChangePassword={onChangePassword}
            onDeleteAccount={onDeleteAccount}
          />
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

    // Unreachable: activeDashView is always one of the views handled above.
    return null;
  };

  // ---- Render ---------------------------------------------------------------
  return (
    <>
      <div className="page dashboard-page">
        {/* ---- Header ---- */}
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
        {/* A named section is a landmark, which is what puts this note and the
            glance cards inside one. Without it they sit as bare children of the
            page between <header> and <main>, and axe reports them as content
            outside any landmark. No CSS targets either with a direct-child
            selector, and .dashboard-page is plain block flow, so the wrapper
            does not move anything. */}
        <section aria-labelledby="dashboard-overview-note">
          <p className="muted dashboard-header-note" id="dashboard-overview-note">
            Visual summary of your progress and key metrics.
          </p>

          <DashboardAtAGlance
            nextWorkout={nextWorkout}
            caloriesGap={caloriesGap}
            avgCalories={avgCalories}
            calorieGoal={calorieGoal}
            weatherLoading={weatherLoading}
            weatherRecommendation={weatherRecommendation}
            weatherError={weatherError}
            weatherLastUpdatedAt={weatherLastUpdatedAt}
            refreshWeatherRecommendation={refreshWeatherRecommendation}
            airQualityLoading={airQualityLoading}
            airSummary={airSummary}
            airQualityError={airQualityError}
            airQualityLastUpdatedAt={airQualityLastUpdatedAt}
            refreshAirQuality={refreshAirQuality}
            formatRelativeUpdatedAt={formatRelativeUpdatedAt}
            onAddWorkout={() => {
              setWorkoutForm((prev) => ({ ...prev, date: getLocalDateKey() }));
              setWorkoutModalOpen(true);
            }}
            onOpenMeal={() => navigateDashView("meal")}
            onOpenTips={() => navigateDashView("tips")}
          />
        </section>

        {/* ---- The active view, or the first-load skeleton ---- */}
        <main className="dashboard-grid">
          {showInitialDashboardLoading && (
            <section
              className="panel dashboard-loading-card dashboard-loading-skeleton"
              role="status"
              aria-live="polite"
            >
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

        {/* ---- Refresh status, error and toast ---- */}
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
                  // Cleared before the action runs, so a toast the action shows
                  // (a successful Undo shows one) is not cleared with it.
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

        {/* ---- Modals ---- */}
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

      {/* ---- Navigation: the drawer and the bottom bar ---- */}
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
