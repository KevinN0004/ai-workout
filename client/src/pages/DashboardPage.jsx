import SummaryView from "./dashboard/SummaryView";
import WorkoutsView from "./dashboard/WorkoutsView";
import CaloriesView from "./dashboard/CaloriesView";
import PlansView from "./dashboard/PlansView";
import MealView from "./dashboard/MealView";
import TipsView from "./dashboard/TipsView";
import SettingsView from "./dashboard/SettingsView";
import DashboardHomeView from "./dashboard/DashboardHomeView";
import "./DashboardPage.css";

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
  submitGoals,
  weekDays,
  latestPlanByWeekday,
  plannerModal,
  generatedPlanModal
}) {
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

  const workouts = dashboard?.workouts || [];
  const calories = dashboard?.calories || [];
  const goals = dashboard?.goals || goalForm;

  const last7Cutoff = new Date();
  last7Cutoff.setDate(last7Cutoff.getDate() - 6);
  const last7Workouts = workouts.filter((item) => {
    const d = new Date(item.date);
    return !Number.isNaN(d) && d >= last7Cutoff;
  });
  const last7Calories = calories.filter((item) => {
    const d = new Date(item.date);
    return !Number.isNaN(d) && d >= last7Cutoff;
  });

  const avgCalories =
    last7Calories.reduce((sum, item) => sum + (item.calories || 0), 0) /
    (last7Calories.length || 1);
  const weeklyGoal = Number(goals.weeklyWorkouts || 3);
  const workoutProgress = Math.min(
    100,
    Math.round((last7Workouts.length / weeklyGoal) * 100)
  );
  const calorieGoal = Number(goals.targetCalories || 2200);
  const calorieProgress = Math.min(
    100,
    Math.round((avgCalories / calorieGoal) * 100)
  );

  const today = new Date();
  const last7Days = Array.from({ length: 7 }, (_, index) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - index));
    return d;
  });
  const last7Keys = last7Days.map((d) => d.toISOString().slice(0, 10));

  const caloriesByDate = calories.reduce((acc, item) => {
    if (!item?.date) return acc;
    const key = item.date;
    const next = Number(item.calories || 0);
    acc[key] = (acc[key] || 0) + (Number.isNaN(next) ? 0 : next);
    return acc;
  }, {});

  const workoutsByDate = workouts.reduce((acc, item) => {
    if (!item?.date) return acc;
    const key = item.date;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const calorieSeries = last7Keys.map((key) => caloriesByDate[key] || 0);
  const workoutSeries = last7Keys.map((key) => workoutsByDate[key] || 0);

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
        workouts={workouts}
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
      />
    );
  } else if (dashView === "meal") {
    activeView = <MealView dashboard={dashboard} fallbackPlan={form} />;
  } else if (dashView === "tips") {
    activeView = <TipsView />;
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
