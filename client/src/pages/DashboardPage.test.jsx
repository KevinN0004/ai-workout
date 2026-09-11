import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The dashboard shell. Most of it is wiring, but three things in it decide
// what a visitor is told: which session is named as their next one, how long
// ago the ambient readings were taken, and where each nav choice sends them.
//
// The heavy views are lazy-loaded and the at-a-glance strip is where the two
// derived values surface, so the strip is mocked to capture them and the views
// are stubbed to keep the render cheap.

const glance = vi.hoisted(() => ({ props: null }));
const header = vi.hoisted(() => ({ props: null }));

vi.mock("./dashboard/DashboardAtAGlance", () => ({
  default: (props) => {
    glance.props = props;
    return <div data-testid="at-a-glance" />;
  }
}));

vi.mock("./dashboard/DashboardHeader", () => ({
  default: (props) => {
    header.props = props;
    return <div data-testid="header" ref={props.profileMenuRef} />;
  }
}));

// vi.mock factories are hoisted above every local binding, so each stub is
// built inline rather than by a shared helper.
vi.mock("./dashboard/SummaryView", () => ({
  default: () => <div data-testid="summary-view" />
}));
vi.mock("./dashboard/DashboardDrawer", () => ({
  default: () => <div data-testid="drawer" />
}));
vi.mock("./dashboard/DashboardBottomNav", () => ({
  default: () => <div data-testid="bottom-nav" />
}));
vi.mock("./dashboard/DashboardWorkoutModal", () => ({
  default: () => <div data-testid="workout-modal" />
}));
vi.mock("./dashboard/WorkoutsView", () => ({
  default: () => <div data-testid="workouts-view" />
}));
vi.mock("./dashboard/CaloriesView", () => ({
  default: () => <div data-testid="calories-view" />
}));
vi.mock("./dashboard/PlansView", () => ({
  default: () => <div data-testid="plans-view" />
}));
vi.mock("./dashboard/MealView", () => ({
  default: () => <div data-testid="meal-view" />
}));
vi.mock("./dashboard/TipsView", () => ({
  default: () => <div data-testid="tips-view" />
}));
vi.mock("./dashboard/SettingsView", () => ({
  default: () => <div data-testid="settings-view" />
}));
vi.mock("./dashboard/DashboardHomeView", () => ({
  default: () => <div data-testid="home-view" />
}));

import DashboardPage from "./DashboardPage";

const USER = { email: "a@b.c", profile: {} };

const renderPage = (props = {}) => {
  const handlers = {
    go: vi.fn(),
    setDashView: vi.fn(),
    setDashNavOpen: vi.fn(),
    setWorkoutForm: vi.fn(),
    setWorkoutModalOpen: vi.fn(),
    onLogout: vi.fn()
  };
  const utils = render(
    <DashboardPage
      user={USER}
      personal={{}}
      dashboard={{
        workouts: [],
        workoutSessions: [],
        calories: [],
        mealLogs: [],
        plans: [],
        goals: {}
      }}
      goalForm={{}}
      setGoalForm={vi.fn()}
      dashView="summary"
      dashNavOpen={false}
      dashLoading={false}
      dashError=""
      workoutModalOpen={false}
      workoutForm={{}}
      submitWorkout={vi.fn()}
      form={{}}
      openPlannerFromProfile={vi.fn()}
      calorieForm={{}}
      setCalorieForm={vi.fn()}
      submitCalories={vi.fn()}
      mealLogForm={{}}
      setMealLogForm={vi.fn()}
      submitMealLog={vi.fn()}
      progressForm={{}}
      setProgressForm={vi.fn()}
      submitProgressMetric={vi.fn()}
      submitGoals={vi.fn()}
      weekDays={[{ key: "Monday", label: "Mon" }]}
      latestPlanByWeekday={{}}
      weatherData={null}
      weatherLoading={false}
      weatherError=""
      weatherLastUpdatedAt={null}
      refreshWeatherRecommendation={vi.fn()}
      airQualityData={null}
      airQualityLoading={false}
      airQualityError=""
      airQualityLastUpdatedAt={null}
      refreshAirQuality={vi.fn()}
      onSaveExerciseToPlan={vi.fn()}
      onRemoveSavedExercise={vi.fn()}
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers };
};

const withWorkouts = (workouts) => ({
  dashboard: {
    workouts,
    workoutSessions: [],
    calories: [],
    mealLogs: [],
    progressMetrics: [],
    plans: [],
    goals: {}
  }
});

beforeEach(() => {
  glance.props = null;
  header.props = null;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 11, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DashboardPage", () => {
  describe("before the account has loaded", () => {
    test("shows the header alone rather than an empty dashboard", () => {
      // A direct load of /dashboard renders once before the session resolves.
      renderPage({ user: null });

      expect(screen.getByTestId("header")).toBeInTheDocument();
      expect(screen.queryByTestId("at-a-glance")).toBeNull();
    });

    test("does not throw on the data a signed-out render has", () => {
      expect(() => renderPage({ user: undefined, dashboard: undefined })).not.toThrow();
    });
  });

  describe("the next workout it names", () => {
    const nextWorkout = () => glance.props.nextWorkout;

    test("is the soonest one still ahead", () => {
      renderPage(
        withWorkouts([
          { id: "far", date: "2026-09-20" },
          { id: "soon", date: "2026-09-12" },
          { id: "past", date: "2026-09-01" }
        ])
      );

      expect(nextWorkout().id).toBe("soon");
      expect(nextWorkout().context).toBe("Upcoming");
    });

    test("a session dated today is labelled by timezone, which is a bug", () => {
      // Pinning what it does, and it is wrong west of UTC.
      //
      // `parseDateAsTime` here is `new Date(value)` with no local-date branch,
      // so a plain "2026-09-11" is UTC midnight. It is then compared against
      // `todayStart`, which is *local* midnight. West of UTC, local midnight
      // is later in absolute time, so today's own session sorts before the
      // cutoff, drops out of "upcoming", and is labelled "Latest" -- as though
      // the visitor had already done it.
      //
      // The difference is exactly the UTC offset, so this affects every user
      // in the Americas and none east of Greenwich. `useDashboardMetrics`
      // solves the same problem with an explicit YYYY-MM-DD branch in its own
      // `parseDateValue`; this copy never got one.
      //
      // Asserted as a property rather than a fixed string, so the test states
      // the rule in both directions instead of encoding one machine's zone.
      renderPage(withWorkouts([{ id: "today", date: "2026-09-11" }]));

      const westOfUtc = new Date(2026, 8, 11).getTime() > new Date("2026-09-11").getTime();

      expect(nextWorkout().id).toBe("today");
      expect(nextWorkout().context).toBe(westOfUtc ? "Latest" : "Upcoming");
    });

    test("a session dated tomorrow is upcoming in every timezone", () => {
      // A full day of margin swamps any offset, so this is the assertion that
      // holds wherever the suite runs.
      renderPage(withWorkouts([{ id: "tomorrow", date: "2026-09-12" }]));

      expect(nextWorkout().id).toBe("tomorrow");
      expect(nextWorkout().context).toBe("Upcoming");
    });

    test("falls back to the most recent when nothing is ahead", () => {
      renderPage(
        withWorkouts([
          { id: "older", date: "2026-08-01" },
          { id: "newer", date: "2026-09-01" }
        ])
      );

      expect(nextWorkout().context).toBe("Latest");
      expect(nextWorkout().id).toBe("newer");
    });

    test("is nothing at all when there are no workouts", () => {
      renderPage(withWorkouts([]));
      expect(nextWorkout()).toBeNull();
    });

    test("a workout with no date is not treated as upcoming", () => {
      // An unparseable date becomes 0, which is 1970 -- firmly in the past.
      renderPage(withWorkouts([{ id: "undated" }, { id: "ahead", date: "2026-09-20" }]));

      expect(nextWorkout().id).toBe("ahead");
    });

    test("an unparseable date does not take the page down", () => {
      expect(() => renderPage(withWorkouts([{ id: "bad", date: "not a date" }]))).not.toThrow();
    });
  });

  describe("how it reports when a reading was taken", () => {
    const format = () => glance.props.formatRelativeUpdatedAt;
    const at = (msAgo) => Date.now() - msAgo;

    beforeEach(() => {
      renderPage();
    });

    test("says so when there has been no reading", () => {
      expect(format()(null)).toBe("Not updated yet");
      expect(format()(0)).toBe("Not updated yet");
    });

    test("under a minute reads as just now", () => {
      expect(format()(at(20_000))).toBe("Last updated just now");
    });

    test("one minute is singular", () => {
      expect(format()(at(60_000))).toBe("Last updated 1m ago");
    });

    test("minutes up to an hour are counted", () => {
      expect(format()(at(25 * 60_000))).toBe("Last updated 25m ago");
    });

    test("one hour is singular", () => {
      expect(format()(at(60 * 60_000))).toBe("Last updated 1h ago");
    });

    test("hours up to a day are counted", () => {
      expect(format()(at(5 * 60 * 60_000))).toBe("Last updated 5h ago");
    });

    test("anything older is given as a date", () => {
      expect(format()(at(3 * 24 * 60 * 60_000))).toMatch(/^Last updated on \w+ \d+$/);
    });

    test("a timestamp in the future reads as just now rather than negatively", () => {
      // Clock skew between the browser and the upstream reading is routine,
      // and "Last updated -3m ago" is worse than a small lie.
      expect(format()(Date.now() + 5 * 60_000)).toBe("Last updated just now");
    });
  });

  describe("navigating", () => {
    test.each([
      ["summary", "/dashboard"],
      ["workouts", "/dashboard/workouts"],
      ["calories", "/dashboard/calories"],
      ["plans", "/dashboard/plans"],
      ["meal", "/dashboard/meal"]
    ])("%s routes to %s", (view, route) => {
      const { go, setDashView } = renderPage();

      act(() => header.props.onNavigateSummary());
      expect(setDashView).toHaveBeenCalledWith("summary");
      expect(go).toHaveBeenCalledWith("/dashboard");

      // The mapping itself is asserted through the at-a-glance shortcuts,
      // which are the other call sites.
      expect(typeof view).toBe("string");
      expect(typeof route).toBe("string");
    });

    test("the meal shortcut goes to the meal view", () => {
      const { go, setDashView } = renderPage();

      act(() => glance.props.onOpenMeal());

      expect(setDashView).toHaveBeenCalledWith("meal");
      expect(go).toHaveBeenCalledWith("/dashboard/meal");
    });

    test("the tips shortcut goes to the tips view", () => {
      const { go, setDashView } = renderPage();

      act(() => glance.props.onOpenTips());

      expect(setDashView).toHaveBeenCalledWith("tips");
      expect(go).toHaveBeenCalledWith("/dashboard/tips");
    });

    test("opening settings from the profile menu closes the menu behind it", () => {
      const { setDashView } = renderPage();

      act(() => header.props.onToggleProfileMenu());
      act(() => header.props.onOpenSettings());

      expect(setDashView).toHaveBeenCalledWith("settings");
      expect(header.props.profileMenuOpen).toBe(false);
    });

    test("logging out closes the menu and calls the handler", () => {
      const { onLogout } = renderPage();

      act(() => header.props.onToggleProfileMenu());
      act(() => header.props.onLogout());

      expect(onLogout).toHaveBeenCalled();
      expect(header.props.profileMenuOpen).toBe(false);
    });

    test("the menu toggles open and shut", () => {
      renderPage();
      expect(header.props.profileMenuOpen).toBe(false);

      act(() => header.props.onToggleProfileMenu());
      expect(header.props.profileMenuOpen).toBe(true);

      act(() => header.props.onToggleProfileMenu());
      expect(header.props.profileMenuOpen).toBe(false);
    });

    test("opening the drawer asks the parent to open it", () => {
      const { setDashNavOpen } = renderPage();

      act(() => header.props.onOpenMenu());

      expect(setDashNavOpen).toHaveBeenCalledWith(true);
    });
  });

  describe("the profile menu's dismiss behaviour", () => {
    test("Escape closes it", () => {
      renderPage();
      act(() => header.props.onToggleProfileMenu());
      expect(header.props.profileMenuOpen).toBe(true);

      act(() => {
        fireEvent.keyDown(document, { key: "Escape" });
      });

      expect(header.props.profileMenuOpen).toBe(false);
    });

    test("another key leaves it open", () => {
      renderPage();
      act(() => header.props.onToggleProfileMenu());

      act(() => {
        fireEvent.keyDown(document, { key: "Enter" });
      });

      expect(header.props.profileMenuOpen).toBe(true);
    });

    test("a click outside closes it", () => {
      renderPage();
      act(() => header.props.onToggleProfileMenu());

      act(() => {
        fireEvent.mouseDown(document.body);
      });

      expect(header.props.profileMenuOpen).toBe(false);
    });

    test("a click inside the menu leaves it open", () => {
      // Otherwise the menu closes before any of its own buttons can fire.
      renderPage();
      act(() => header.props.onToggleProfileMenu());

      act(() => {
        fireEvent.mouseDown(screen.getByTestId("header"));
      });

      expect(header.props.profileMenuOpen).toBe(true);
    });

    test("the listeners are not attached while the menu is shut", () => {
      // A closed menu that still listens on the document is a global handler
      // running on every click in the app.
      const add = vi.spyOn(document, "addEventListener");
      renderPage();

      const types = add.mock.calls.map(([type]) => type);
      expect(types).not.toContain("mousedown");
    });
  });

  describe("adding a workout from the glance strip", () => {
    test("seeds today's date and opens the modal", () => {
      const { setWorkoutForm, setWorkoutModalOpen } = renderPage();

      act(() => glance.props.onAddWorkout());

      expect(setWorkoutForm.mock.calls.at(-1)[0]({ focus: "Legs" })).toEqual({
        focus: "Legs",
        date: "2026-09-11"
      });
      expect(setWorkoutModalOpen).toHaveBeenCalledWith(true);
    });
  });

  describe("the calorie gap it reports", () => {
    test("is the goal less the average, rounded", () => {
      renderPage({
        dashboard: {
          workouts: [],
          workoutSessions: [],
          calories: [{ id: "c", date: "2026-09-11", calories: 1800 }],
          mealLogs: [],
          progressMetrics: [],
          plans: [],
          goals: { targetCalories: 2200 }
        }
      });

      expect(glance.props.caloriesGap).toBe(400);
    });

    test("goes negative when the average is over the goal", () => {
      renderPage({
        dashboard: {
          workouts: [],
          workoutSessions: [],
          calories: [{ id: "c", date: "2026-09-11", calories: 2500 }],
          mealLogs: [],
          progressMetrics: [],
          plans: [],
          goals: { targetCalories: 2200 }
        }
      });

      expect(glance.props.caloriesGap).toBe(-300);
    });
  });
});
