import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import DashboardPage from "../DashboardPage";

/**
 * Regression guard for a crash on direct loads of /dashboard.
 *
 * App.jsx initialises `user` to null and only sets it once /api/auth/me
 * resolves, so DashboardPage always renders at least once unauthenticated.
 * It has an `if (!user) return <stub/>` early return, so any hook declared
 * BELOW that return is skipped on the first render and runs on the second --
 * React then throws "Rendered more hooks than during the previous render."
 *
 * A `useMemo` had drifted below the early return, which crashed that
 * transition. This test asserts only the hook-count invariant: it deliberately
 * does not assert a full successful render, because DashboardPage takes ~47
 * props and lazy-loads seven child views, so a render-complete fixture would
 * break on unrelated prop changes and bury the signal. Full-render coverage
 * lives in DashboardPage.integration.test.jsx.
 */
const HOOK_ORDER_ERROR = /Rendered (more|fewer) hooks than/;

const props = {
  personal: {},
  go: vi.fn(),
  onLogout: vi.fn(),
  dashboard: {
    workouts: [],
    workoutSessions: [],
    mealLogs: [],
    progressMetrics: [],
    calories: [],
    plans: [],
    savedExercises: [],
    goals: {}
  },
  goalForm: {},
  setGoalForm: vi.fn(),
  dashView: "summary",
  setDashView: vi.fn(),
  dashNavOpen: false,
  setDashNavOpen: vi.fn(),
  dashLoading: false,
  dashError: "",
  workoutModalOpen: false,
  setWorkoutModalOpen: vi.fn(),
  workoutForm: {},
  setWorkoutForm: vi.fn(),
  submitWorkout: vi.fn(),
  form: {},
  openPlannerFromProfile: vi.fn(),
  calorieForm: {},
  setCalorieForm: vi.fn(),
  submitCalories: vi.fn(),
  mealLogForm: {},
  setMealLogForm: vi.fn(),
  submitMealLog: vi.fn(),
  progressForm: {},
  setProgressForm: vi.fn(),
  submitProgressMetric: vi.fn(),
  submitGoals: vi.fn(),
  weekDays: [],
  latestPlanByWeekday: {},
  weatherData: null,
  weatherLoading: false,
  weatherError: "",
  weatherLastUpdatedAt: null,
  refreshWeatherRecommendation: vi.fn(),
  airQualityData: null,
  airQualityLoading: false,
  airQualityError: "",
  airQualityLastUpdatedAt: null,
  refreshAirQuality: vi.fn(),
  onSaveExerciseToPlan: vi.fn(),
  onRemoveSavedExercise: vi.fn(),
  plannerModal: null,
  generatedPlanModal: null,
  dashboardToast: null,
  clearDashboardToast: vi.fn()
};

describe("DashboardPage hook order", () => {
  test("signing in mid-lifecycle does not change the hook count", () => {
    const logged = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args) => logged.push(args.join(" ")));

    let thrown = null;
    try {
      const { rerender } = render(<DashboardPage {...props} user={null} />);
      rerender(<DashboardPage {...props} user={{ id: "u1", email: "a@b.c", profile: {} }} />);
    } catch (err) {
      thrown = err;
    } finally {
      spy.mockRestore();
    }

    expect(thrown?.message ?? "").not.toMatch(HOOK_ORDER_ERROR);
    expect(logged.find((line) => HOOK_ORDER_ERROR.test(line))).toBeUndefined();
  });
});
