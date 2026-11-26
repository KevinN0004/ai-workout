import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import DashboardPage from "../DashboardPage";

// Each prop the harness hands the page holds only what these flows reach, and
// each element a flow looks up is on screen, so it fails at once if one is not.
/** @typedef {import("../DashboardPage.jsx").DashboardPageProps} DashboardPageProps */

// A handler none of these flows calls, so it stands in for every one.
/** @type {(...args: any[]) => any} */
const noop = () => {};

const baseDashboard = {
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
};

/** @param {{ dashboard?: unknown, apiFetch?: import("../../../app/network.js").ApiFetch }} props */
function DashboardHarness({ dashboard = baseDashboard, apiFetch }) {
  const [dashView, setDashView] = useState("summary");
  const [dashNavOpen, setDashNavOpen] = useState(false);
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  // A form from before per-set logging, which the Log workout modal still opens.
  const [workoutForm, setWorkoutForm] = useState(
    /** @type {DashboardPageProps["workoutForm"]} */ (
      /** @type {unknown} */ ({
        date: "2026-03-01",
        focus: "",
        duration: "",
        exercises: "",
        sets: "",
        reps: "",
        intensityRpe: "",
        notes: ""
      })
    )
  );
  const [calorieForm, setCalorieForm] = useState({ calories: "" });
  const [mealLogForm, setMealLogForm] = useState({
    date: "2026-03-01",
    mealType: "breakfast",
    name: "",
    calories: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
    notes: ""
  });
  const [progressForm, setProgressForm] = useState({
    date: "2026-03-01",
    weightLb: "",
    bodyFatPct: "",
    waistCm: "",
    restingHr: "",
    notes: ""
  });
  const [goalForm, setGoalForm] = useState({
    targetWeight: "160",
    targetCalories: "2200",
    weeklyWorkouts: "3"
  });
  const [toast, setToast] = useState(/** @type {DashboardPageProps["dashboardToast"]} */ (null));

  return (
    <DashboardPage
      user={/** @type {DashboardPageProps["user"]} */ ({ email: "test@example.com" })}
      go={noop}
      onLogout={noop}
      dashboard={/** @type {DashboardPageProps["dashboard"]} */ (dashboard)}
      goalForm={goalForm}
      setGoalForm={setGoalForm}
      dashView={dashView}
      setDashView={setDashView}
      dashNavOpen={dashNavOpen}
      setDashNavOpen={setDashNavOpen}
      dashLoading={false}
      dashError=""
      workoutModalOpen={workoutModalOpen}
      setWorkoutModalOpen={setWorkoutModalOpen}
      workoutForm={workoutForm}
      setWorkoutForm={setWorkoutForm}
      submitWorkout={
        /** @type {DashboardPageProps["submitWorkout"]} */ (
          (event) => {
            event.preventDefault();
            setWorkoutModalOpen(false);
            setToast(
              /** @type {DashboardPageProps["dashboardToast"]} */ ({
                tone: "success",
                message: "Workout saved."
              })
            );
          }
        )
      }
      form={{
        goal: "Build lean strength and energy",
        environment: "Home",
        equipment: [],
        days: "3",
        duration: "45",
        focuses: []
      }}
      openPlannerFromProfile={noop}
      calorieForm={calorieForm}
      setCalorieForm={setCalorieForm}
      submitCalories={noop}
      mealLogForm={mealLogForm}
      setMealLogForm={setMealLogForm}
      submitMealLog={noop}
      progressForm={progressForm}
      setProgressForm={setProgressForm}
      submitProgressMetric={noop}
      submitGoals={noop}
      weekDays={[
        { label: "Mon", key: "Monday" },
        { label: "Tue", key: "Tuesday" }
      ]}
      latestPlanByWeekday={{}}
      weatherData={null}
      weatherLoading={false}
      weatherError=""
      weatherLastUpdatedAt={Date.now()}
      refreshWeatherRecommendation={noop}
      airQualityData={null}
      airQualityLoading={false}
      airQualityError=""
      airQualityLastUpdatedAt={Date.now()}
      refreshAirQuality={noop}
      onSaveExerciseToPlan={noop}
      onRemoveSavedExercise={noop}
      plannerModal={null}
      dashboardToast={toast}
      clearDashboardToast={() => setToast(null)}
      // Only the plans flow reaches apiFetch, and it passes one.
      apiFetch={/** @type {import("../../../app/network.js").ApiFetch} */ (apiFetch)}
      // The props no flow here reaches, at the values the app starts them with.
      dashboardPagination={null}
      weatherErrorKind=""
      airQualityErrorKind=""
      onSaveProfile={noop}
      onChangePassword={noop}
      onDeleteAccount={noop}
      onDeleteImportedWorkout={noop}
      reloadDashboard={noop}
      onStartSession={noop}
      onPlanChanged={noop}
    />
  );
}

// The views are lazy, so a wait for one covers React's 300 ms reveal throttle
// (FALLBACK_THROTTLE_MS in React 19.3), the first import, and findByRole
// re-scanning the whole dashboard, about 150 ms a scan under the full coverage
// run. That came to 1,027 ms at worst, past the 1 s default, so these waits
// allow 3 s.
const LAZY_VIEW = { timeout: 3000 };

describe("Dashboard integration flows", () => {
  test("opens the dashboard drawer from header button", async () => {
    const user = userEvent.setup();
    render(<DashboardHarness />);

    await user.click(screen.getByRole("button", { name: /open dashboard menu/i }));

    expect(screen.getByRole("heading", { name: /dashboard menu/i })).toBeInTheDocument();
  });

  test("switches pages from drawer navigation", async () => {
    const user = userEvent.setup();
    render(<DashboardHarness />);

    await user.click(screen.getByRole("button", { name: /open dashboard menu/i }));
    const drawerTitle = screen.getByRole("heading", { name: /dashboard menu/i });
    const drawer = /** @type {HTMLElement} */ (drawerTitle.closest(".drawer"));
    await user.click(within(drawer).getByRole("button", { name: /^logs$/i }));

    expect(await screen.findByRole("heading", { name: /^logs$/i }, LAZY_VIEW)).toBeInTheDocument();
  });

  test("closes workout modal with cancel", async () => {
    const user = userEvent.setup();
    render(<DashboardHarness />);

    await user.click(screen.getByRole("button", { name: /add workout/i }));
    expect(screen.getByRole("heading", { name: /log workout/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByRole("heading", { name: /log workout/i })).not.toBeInTheDocument();
  });

  test("submits workout modal and shows success toast", async () => {
    const user = userEvent.setup();
    render(<DashboardHarness />);

    await user.click(screen.getByRole("button", { name: /add workout/i }));
    const modalTitle = screen.getByRole("heading", { name: /log workout/i });
    const modal = /** @type {HTMLElement} */ (modalTitle.closest(".modal"));
    const modalQueries = within(modal);
    await user.type(modalQueries.getByLabelText(/duration \(minutes\)/i), "45");
    await user.click(modalQueries.getByRole("button", { name: /save workout/i }));

    expect(screen.queryByRole("heading", { name: /log workout/i })).not.toBeInTheDocument();
    expect(screen.getByText(/workout saved\./i)).toBeInTheDocument();
  });

  test("dismisses toast from close button", async () => {
    const user = userEvent.setup();
    render(<DashboardHarness />);

    await user.click(screen.getByRole("button", { name: /add workout/i }));
    const modalTitle = screen.getByRole("heading", { name: /log workout/i });
    const modal = /** @type {HTMLElement} */ (modalTitle.closest(".modal"));
    const modalQueries = within(modal);
    await user.type(modalQueries.getByLabelText(/duration \(minutes\)/i), "45");
    await user.click(modalQueries.getByRole("button", { name: /save workout/i }));

    expect(screen.getByText(/workout saved\./i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /dismiss message/i }));
    expect(screen.queryByText(/workout saved\./i)).not.toBeInTheDocument();
  });

  // A target weight is absent until the user saves one, and the summary sends
  // them to the goals view to set it.
  test("opens the goals view from the summary to set a target weight", async () => {
    const user = userEvent.setup();
    const { targetWeight: _target, ...goals } = baseDashboard.goals;
    render(<DashboardHarness dashboard={{ ...baseDashboard, goals }} />);

    await user.click(screen.getByRole("button", { name: "Set a target weight" }));

    expect(
      await screen.findByRole("heading", { name: "Overall goal" }, LAZY_VIEW)
    ).toBeInTheDocument();
  });

  test("shows the newest plan's week on the summary", () => {
    const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const plan = {
      id: "plan-1",
      createdAt: "2026-01-01T12:00:00.000Z",
      plan: "Monday",
      payload: {
        version: 1,
        days: weekdays.map((weekday, index) => ({
          index,
          weekday,
          title: weekday,
          lines: ["Squat 5x5"]
        })),
        notes: []
      }
    };
    render(<DashboardHarness dashboard={{ ...baseDashboard, plans: [plan] }} />);

    expect(screen.getByText(/of 7 planned days done/)).toBeInTheDocument();
  });

  // Roadmap B4: the page reads the week's progression with App's apiFetch and
  // hands the summary its deload week.
  test("reads the week's progression and marks a deload week on the summary", async () => {
    const plan = {
      id: "plan-1",
      createdAt: "2026-01-01T12:00:00.000Z",
      plan: "Monday",
      payload: {
        version: 1,
        days: [{ index: 0, weekday: "Monday", title: "Monday", lines: ["Squat 5x5"] }],
        notes: []
      }
    };
    const progression = {
      weekStart: "2026-11-09",
      deloadWeek: { active: true, count: 5, reason: "Your 6th week in a row", decision: null },
      lifts: []
    };
    /** @type {import("vitest").Mock<import("../../../app/network.js").ApiFetch>} */
    const apiFetch = vi.fn(
      async () =>
        // The answer holds only ok and json, which is all the hook reads.
        /** @type {Response} */ (
          /** @type {unknown} */ ({ ok: true, json: async () => ({ progression }) })
        )
    );
    render(
      <DashboardHarness dashboard={{ ...baseDashboard, plans: [plan] }} apiFetch={apiFetch} />
    );

    expect(await screen.findByText(/, deload week\.$/)).toBeInTheDocument();
    expect(String(apiFetch.mock.calls[0][0])).toMatch(/^\/api\/dashboard\/progression\?today=/);
  });
});
