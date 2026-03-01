import { useEffect, useMemo, useRef, useState } from "react";
import SummaryView from "./dashboard/SummaryView";
import WorkoutsView from "./dashboard/WorkoutsView";
import CaloriesView from "./dashboard/CaloriesView";
import PlansView from "./dashboard/PlansView";
import MealView from "./dashboard/MealView";
import TipsView from "./dashboard/TipsView";
import SettingsView from "./dashboard/SettingsView";
import DashboardHomeView from "./dashboard/DashboardHomeView";
import DashboardHeader from "./dashboard/DashboardHeader";
import DashboardDrawer from "./dashboard/DashboardDrawer";
import DashboardBottomNav from "./dashboard/DashboardBottomNav";
import useDashboardMetrics from "./dashboard/useDashboardMetrics";
import ModalPortal from "../components/ModalPortal";
import "./DashboardPage.css";

const getLocalDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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
                    ? weatherRecommendation
                      ? "Refreshing..."
                      : "Checking..."
                    : weatherRecommendation?.workoutType === "outdoor"
                    ? "Outdoor friendly"
                    : weatherRecommendation?.workoutType === "indoor"
                    ? "Indoor suggested"
                    : weatherError
                    ? "Unavailable"
                    : "Unavailable"}
                </p>
                <p className="muted">
                  {weatherRecommendation?.summary || weatherError || "No weather update yet."}
                </p>
                <p className="muted dashboard-glance-updated">
                  {formatRelativeUpdatedAt(weatherLastUpdatedAt)}
                </p>
              </div>
            </article>
            <article className="dashboard-glance-card card-shell">
              <div className="card-section-head">
                <h3>Air quality</h3>
              </div>
              <div className="card-section-body">
                <p className="dashboard-glance-value">
                  {airQualityLoading
                    ? airSummary
                      ? "Refreshing..."
                      : "Checking..."
                    : airSummary?.level || (airQualityError ? "Unavailable" : "Unavailable")}
                </p>
                <p className="muted">
                  {airSummary?.guidance || airQualityError || "No air quality guidance available."}
                </p>
                <p className="muted dashboard-glance-updated">
                  {formatRelativeUpdatedAt(airQualityLastUpdatedAt)}
                </p>
              </div>
            </article>
          </div>
          <div className="dashboard-glance-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setWorkoutForm((prev) => ({ ...prev, date: getLocalDateKey() }));
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
          {!showInitialDashboardLoading && (
            <div className="dashboard-view-shell is-active" aria-hidden="false">
              {dashboardViews[activeDashView]}
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
                <div className="modal-header dashboard-workout-modal-header">
                  <div className="dashboard-workout-heading">
                    <h2>Log workout</h2>
                    <p className="muted">Save your session details and notes.</p>
                  </div>
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
                  <div className="dashboard-workout-layout">
                    <section className="dashboard-workout-section dashboard-workout-section-session">
                      <h3>Session details</h3>
                      <div className="dashboard-workout-grid dashboard-workout-grid-basics">
                        <label className="dashboard-workout-field dashboard-workout-field-half">
                          <span className="dashboard-workout-label">Date</span>
                          <input
                            type="date"
                            value={workoutForm.date}
                            onChange={(e) =>
                              setWorkoutForm((prev) => ({ ...prev, date: e.target.value }))
                            }
                            required
                          />
                        </label>
                        <label className="dashboard-workout-field dashboard-workout-field-half">
                          <span className="dashboard-workout-label">Duration (minutes)</span>
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
                        <label className="dashboard-workout-field dashboard-workout-field-full">
                          <span className="dashboard-workout-label">Focus</span>
                          <input
                            value={workoutForm.focus}
                            onChange={(e) =>
                              setWorkoutForm((prev) => ({ ...prev, focus: e.target.value }))
                            }
                            placeholder="Strength, conditioning..."
                          />
                        </label>
                      </div>
                    </section>

                    <section className="dashboard-workout-section dashboard-workout-section-exercise">
                      <h3>Exercise details</h3>
                      <div className="dashboard-workout-grid dashboard-workout-grid-exercise">
                        <label className="dashboard-workout-field dashboard-workout-field-full">
                          <span className="dashboard-workout-label">Exercises (comma-separated)</span>
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
                        <div className="dashboard-workout-grid dashboard-workout-grid-metrics">
                          <label className="dashboard-workout-field dashboard-workout-field-half">
                            <span className="dashboard-workout-label">Sets</span>
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
                          <label className="dashboard-workout-field dashboard-workout-field-half">
                            <span className="dashboard-workout-label">Reps</span>
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
                          <label className="dashboard-workout-field dashboard-workout-field-full">
                            <span className="dashboard-workout-label">Intensity (RPE 1-10)</span>
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
                      </div>
                    </section>

                    <section className="dashboard-workout-section dashboard-workout-section-notes">
                      <h3>Session notes</h3>
                      <label className="dashboard-workout-field dashboard-workout-field-full">
                        <span className="dashboard-workout-label">Notes</span>
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
                    </section>
                  </div>

                  <div className="modal-submit dashboard-workout-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setWorkoutModalOpen(false)}
                    >
                      Cancel
                    </button>
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




