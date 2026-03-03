import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardPage from "./DashboardPage";

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

function DashboardHarness() {
  const [dashView, setDashView] = useState("summary");
  const [dashNavOpen, setDashNavOpen] = useState(false);
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [workoutForm, setWorkoutForm] = useState({
    date: "2026-03-01",
    focus: "",
    duration: "",
    exercises: "",
    sets: "",
    reps: "",
    intensityRpe: "",
    notes: ""
  });
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
  const [toast, setToast] = useState(null);

  return (
    <DashboardPage
      user={{ email: "test@example.com" }}
      personal={{}}
      go={noop}
      onLogout={noop}
      dashboard={baseDashboard}
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
      submitWorkout={(event) => {
        event.preventDefault();
        setWorkoutModalOpen(false);
        setToast({
          tone: "success",
          message: "Workout saved."
        });
      }}
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
      generatedPlanModal={null}
      dashboardToast={toast}
      clearDashboardToast={() => setToast(null)}
    />
  );
}

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
    const drawer = drawerTitle.closest(".drawer");
    await user.click(within(drawer).getByRole("button", { name: /^logs$/i }));

    expect(await screen.findByRole("heading", { name: /^logs$/i })).toBeInTheDocument();
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
    const modal = modalTitle.closest(".modal");
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
    const modal = modalTitle.closest(".modal");
    const modalQueries = within(modal);
    await user.type(modalQueries.getByLabelText(/duration \(minutes\)/i), "45");
    await user.click(modalQueries.getByRole("button", { name: /save workout/i }));

    expect(screen.getByText(/workout saved\./i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /dismiss message/i }));
    expect(screen.queryByText(/workout saved\./i)).not.toBeInTheDocument();
  });
});
