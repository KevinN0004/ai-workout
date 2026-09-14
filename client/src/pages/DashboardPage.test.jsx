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
const drawer = vi.hoisted(() => ({ props: null }));
const bottomNav = vi.hoisted(() => ({ props: null }));
const summary = vi.hoisted(() => ({ props: null }));
const workoutsView = vi.hoisted(() => ({ props: null }));
const plansView = vi.hoisted(() => ({ props: null }));

vi.mock("./dashboard/components/DashboardAtAGlance", () => ({
  default: (props) => {
    glance.props = props;
    return <div data-testid="at-a-glance" />;
  }
}));

vi.mock("./dashboard/components/DashboardHeader", () => ({
  default: (props) => {
    header.props = props;
    return <div data-testid="header" ref={props.profileMenuRef} />;
  }
}));

// vi.mock factories are hoisted above every local binding, so each stub is
// built inline rather than by a shared helper.
vi.mock("./dashboard/views/SummaryView", () => ({
  default: (props) => {
    summary.props = props;
    return <div data-testid="summary-view" />;
  }
}));
vi.mock("./dashboard/components/DashboardDrawer", () => ({
  default: (props) => {
    drawer.props = props;
    return <div data-testid="drawer" />;
  }
}));
vi.mock("./dashboard/components/DashboardBottomNav", () => ({
  default: (props) => {
    bottomNav.props = props;
    return <div data-testid="bottom-nav" />;
  }
}));
vi.mock("./dashboard/components/DashboardWorkoutModal", () => ({
  default: () => <div data-testid="workout-modal" />
}));
vi.mock("./dashboard/views/WorkoutsView", () => ({
  default: (props) => {
    workoutsView.props = props;
    return <div data-testid="workouts-view" />;
  }
}));
vi.mock("./dashboard/views/CaloriesView", () => ({
  default: () => <div data-testid="calories-view" />
}));
vi.mock("./dashboard/views/PlansView", () => ({
  default: (props) => {
    plansView.props = props;
    return <div data-testid="plans-view" />;
  }
}));
vi.mock("./dashboard/views/MealView", () => ({
  default: () => <div data-testid="meal-view" />
}));
vi.mock("./dashboard/views/TipsView", () => ({
  default: () => <div data-testid="tips-view" />
}));
vi.mock("./dashboard/views/SettingsView", () => ({
  default: () => <div data-testid="settings-view" />
}));
vi.mock("./dashboard/views/DashboardHomeView", () => ({
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
    onLogout: vi.fn(),
    clearDashboardToast: vi.fn()
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

  describe("which view it opens", () => {
    // Six of the eight are lazy-loaded behind Suspense, so they arrive a tick
    // after the render rather than with it.
    //
    // The suite freezes the clock for the tests that report how long ago a
    // reading was taken. Nothing here depends on the time, and findBy* polls on
    // timers, so a frozen clock would leave it waiting for a view that has
    // already arrived.
    beforeEach(() => {
      vi.useRealTimers();
    });
    test.each([
      ["summary", "summary-view"],
      ["workouts", "workouts-view"],
      ["calories", "calories-view"],
      ["plans", "plans-view"],
      ["meal", "meal-view"],
      ["tips", "tips-view"],
      ["settings", "settings-view"],
      ["home", "home-view"]
    ])("%s opens its own view", async (dashView, testId) => {
      renderPage({ dashView });

      expect(await screen.findByTestId(testId)).toBeInTheDocument();
    });

    test("only the chosen view is mounted", async () => {
      renderPage({ dashView: "plans" });
      await screen.findByTestId("plans-view");

      ["summary-view", "workouts-view", "calories-view", "meal-view", "tips-view"].forEach(
        (testId) => expect(screen.queryByTestId(testId)).not.toBeInTheDocument()
      );
    });

    test("a view name it does not know falls back to the summary", async () => {
      // dashView comes from the route, so a stale or hand-typed URL reaches
      // here. Falling through to a blank panel would look like a broken page.
      renderPage({ dashView: "not-a-view" });

      expect(await screen.findByTestId("summary-view")).toBeInTheDocument();
    });
  });

  describe("navigating from the drawer and the bottom bar", () => {
    test("the drawer sends the visitor on and closes itself behind them", () => {
      const { go, setDashView, setDashNavOpen } = renderPage();

      act(() => drawer.props.onNavigate("workouts"));

      expect(setDashView).toHaveBeenCalledWith("workouts");
      expect(go).toHaveBeenCalledWith("/dashboard/workouts");
      expect(setDashNavOpen).toHaveBeenCalledWith(false);
    });

    test("the bottom bar sends them on but leaves the drawer alone", () => {
      const { go, setDashView, setDashNavOpen } = renderPage();

      act(() => bottomNav.props.onNavigate("meal"));

      expect(setDashView).toHaveBeenCalledWith("meal");
      expect(go).toHaveBeenCalledWith("/dashboard/meal");
      expect(setDashNavOpen).not.toHaveBeenCalled();
    });

    test.each([
      ["summary", "/dashboard"],
      ["calories", "/dashboard/calories"],
      ["settings", "/dashboard/settings"],
      ["home", "/dashboard/home"]
    ])("%s routes to %s", (view, route) => {
      const { go } = renderPage();

      act(() => bottomNav.props.onNavigate(view));

      expect(go).toHaveBeenCalledWith(route);
    });

    test("a view with no route of its own lands on the dashboard root", () => {
      const { go } = renderPage();

      act(() => bottomNav.props.onNavigate("not-a-view"));

      expect(go).toHaveBeenCalledWith("/dashboard");
    });
  });

  describe("what it says while loading and when something breaks", () => {
    test("a first load shows a skeleton in place of the grid", () => {
      renderPage({ dashLoading: true, dashboard: null });

      expect(document.querySelector(".dashboard-loading-skeleton")).toBeTruthy();
      expect(screen.queryByText("Refreshing dashboard data...")).toBeNull();
    });

    test("a refresh over existing data says so instead of blanking the page", () => {
      renderPage({ dashLoading: true });

      expect(document.querySelector(".dashboard-loading-skeleton")).toBeNull();
      expect(screen.getByText("Refreshing dashboard data...")).toBeTruthy();
    });

    test("neither appears once the data has settled", () => {
      renderPage();

      expect(document.querySelector(".dashboard-loading-skeleton")).toBeNull();
      expect(screen.queryByText("Refreshing dashboard data...")).toBeNull();
    });

    test("an error is shown to the visitor", () => {
      renderPage({ dashError: "Could not reach the server" });

      expect(screen.getByText("Could not reach the server")).toBeTruthy();
    });

    test("no error element when there is no error", () => {
      renderPage();

      expect(document.querySelector(".error")).toBeNull();
    });
  });

  describe("the toast", () => {
    const toastEl = () => document.querySelector(".dashboard-toast");

    test("is absent until there is something to say", () => {
      renderPage();

      expect(toastEl()).toBeNull();
    });

    test("carries its message and defaults to the success tone", () => {
      renderPage({ dashboardToast: { message: "Workout saved" } });

      expect(toastEl().className).toContain("dashboard-toast-success");
      expect(screen.getByText("Workout saved")).toBeTruthy();
    });

    test("uses the tone it is given", () => {
      renderPage({ dashboardToast: { message: "Could not save", tone: "error" } });

      expect(toastEl().className).toContain("dashboard-toast-error");
      expect(toastEl().className).not.toContain("dashboard-toast-success");
    });

    test("offers an action, and dismisses itself before running it", () => {
      // The handler is read out before the toast is cleared, so clearing it
      // cannot pull the action out from under the click.
      const onAction = vi.fn();
      const { clearDashboardToast } = renderPage({
        dashboardToast: { message: "Workout saved", actionLabel: "Undo", onAction }
      });

      fireEvent.click(screen.getByRole("button", { name: "Undo" }));

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(clearDashboardToast).toHaveBeenCalledTimes(1);
      expect(clearDashboardToast.mock.invocationCallOrder[0]).toBeLessThan(
        onAction.mock.invocationCallOrder[0]
      );
    });

    test("can be dismissed without running the action", () => {
      const onAction = vi.fn();
      const { clearDashboardToast } = renderPage({
        dashboardToast: { message: "Workout saved", actionLabel: "Undo", onAction }
      });

      fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));

      expect(clearDashboardToast).toHaveBeenCalledTimes(1);
      expect(onAction).not.toHaveBeenCalled();
    });

    test.each([
      ["a label with no handler", { message: "Saved", actionLabel: "Undo" }],
      [
        "a handler that is not callable",
        { message: "Saved", actionLabel: "Undo", onAction: "nope" }
      ],
      ["a handler with no label", { message: "Saved", onAction: () => {} }]
    ])("offers no action for %s", (_label, dashboardToast) => {
      // A button that does nothing is worse than no button. Asserted on the
      // element rather than on its accessible name: with the label missing the
      // button would render nameless, and a name-based query would pass while
      // an empty button sat there.
      renderPage({ dashboardToast });

      expect(document.querySelector(".dashboard-toast-action")).toBeNull();
      expect(document.querySelector(".dashboard-toast-close")).toBeTruthy();
    });
  });

  describe("the props each child is handed", () => {
    // A sweep found that 32 of the 43 prop lines in this file could be deleted
    // without a single test noticing -- the seam between this page and the two
    // components that read the most from it was almost entirely unguarded.
    // Asserting the whole set at once catches a dropped line without needing an
    // assertion per prop, and catches an added one too, which is the moment to
    // decide whether it wants a test of its own.
    const GLANCE_PROPS = [
      "nextWorkout",
      "caloriesGap",
      "avgCalories",
      "calorieGoal",
      "weatherLoading",
      "weatherRecommendation",
      "weatherError",
      "weatherLastUpdatedAt",
      "refreshWeatherRecommendation",
      "airQualityLoading",
      "airSummary",
      "airQualityError",
      "airQualityLastUpdatedAt",
      "refreshAirQuality",
      "formatRelativeUpdatedAt",
      "onAddWorkout",
      "onOpenMeal",
      "onOpenTips"
    ];

    const SUMMARY_PROPS = [
      "form",
      "openPlannerFromProfile",
      "last7Workouts",
      "avgCalories",
      "goals",
      "goalForm",
      "weeklyGoal",
      "workoutProgress",
      "calorieGoal",
      "calorieProgress",
      "workouts",
      "weeklyTrends",
      "buildLinePath",
      "trendRanges",
      "todayRecommendation",
      "weatherData",
      "weatherLoading",
      "weatherError",
      "weatherLastUpdatedAt",
      "refreshWeatherRecommendation",
      "airQualityData",
      "airQualityLoading",
      "airQualityError",
      "airQualityLastUpdatedAt",
      "refreshAirQuality",
      "onOpenPlans",
      "onOpenMeal"
    ];

    test("the glance strip gets exactly the props it expects", () => {
      renderPage();

      expect(Object.keys(glance.props).sort()).toEqual([...GLANCE_PROPS].sort());
    });

    test("the summary view gets exactly the props it expects", () => {
      renderPage({ dashView: "summary" });

      expect(Object.keys(summary.props).sort()).toEqual([...SUMMARY_PROPS].sort());
    });

    test.each([
      ["the glance strip", () => glance.props],
      ["the summary view", () => summary.props]
    ])("%s does not have its weather and air values crossed", (_label, propsOf) => {
      // Every one of these pairs is the same shape, so a transposed line type
      // checks fine and shows the wrong reading on the wrong card.
      renderPage({
        dashView: "summary",
        weatherLoading: true,
        weatherError: "weather is down",
        weatherLastUpdatedAt: 1000,
        airQualityLoading: false,
        airQualityError: "air is down",
        airQualityLastUpdatedAt: 2000
      });
      const props = propsOf();

      expect(props.weatherError).toBe("weather is down");
      expect(props.airQualityError).toBe("air is down");
      expect(props.weatherLoading).toBe(true);
      expect(props.airQualityLoading).toBe(false);
      expect(props.weatherLastUpdatedAt).toBe(1000);
      expect(props.airQualityLastUpdatedAt).toBe(2000);
    });
  });

  describe("what the glance strip is handed", () => {
    test("both ambient cards get their own refresh handler", () => {
      // The strip renders a Retry only when it has a handler, so a missing
      // prop here would silently leave a failed card with no way out.
      const refreshWeatherRecommendation = vi.fn();
      const refreshAirQuality = vi.fn();
      renderPage({ refreshWeatherRecommendation, refreshAirQuality });

      glance.props.refreshWeatherRecommendation();
      glance.props.refreshAirQuality();

      expect(refreshWeatherRecommendation).toHaveBeenCalledTimes(1);
      expect(refreshAirQuality).toHaveBeenCalledTimes(1);
    });

    test("the summary view gets them too", () => {
      // Found by a mutation that removed this prop and survived: nothing
      // covered the summary view copy of the same wiring, only the strip.
      const refreshWeatherRecommendation = vi.fn();
      const refreshAirQuality = vi.fn();
      renderPage({ dashView: "summary", refreshWeatherRecommendation, refreshAirQuality });

      summary.props.refreshWeatherRecommendation();
      summary.props.refreshAirQuality();

      expect(refreshWeatherRecommendation).toHaveBeenCalledTimes(1);
      expect(refreshAirQuality).toHaveBeenCalledTimes(1);
    });
  });

  describe("the shortcuts each view offers", () => {
    // Every view hands its own jump-off points back to the shell, and each one
    // has to land somewhere different. These are the arrow functions defined
    // inline in the render, so nothing ran them until now.
    beforeEach(() => {
      vi.useRealTimers();
    });

    test("the summary jumps to the plan and the meal views", () => {
      const { go } = renderPage({ dashView: "summary" });

      act(() => summary.props.onOpenPlans());
      expect(go).toHaveBeenCalledWith("/dashboard/plans");

      act(() => summary.props.onOpenMeal());
      expect(go).toHaveBeenCalledWith("/dashboard/meal");
    });

    test("the workouts view jumps to calories and the meal view", async () => {
      const { go } = renderPage({ dashView: "workouts" });
      await screen.findByTestId("workouts-view");

      act(() => workoutsView.props.onOpenCalories());
      expect(go).toHaveBeenCalledWith("/dashboard/calories");

      act(() => workoutsView.props.onOpenMeal());
      expect(go).toHaveBeenCalledWith("/dashboard/meal");
    });

    test("the plans view jumps to the guides", async () => {
      const { go } = renderPage({ dashView: "plans" });
      await screen.findByTestId("plans-view");

      act(() => plansView.props.onOpenGuides());

      expect(go).toHaveBeenCalledWith("/dashboard/tips");
    });

    test("the drawer can close itself without navigating", () => {
      const { setDashNavOpen, go } = renderPage();

      act(() => drawer.props.onClose());

      expect(setDashNavOpen).toHaveBeenCalledWith(false);
      expect(go).not.toHaveBeenCalled();
    });

    test("the header returns to the dashboard root before the account loads", () => {
      // The signed-out branch renders its own header, with its own handler.
      const { go } = renderPage({ user: null });

      act(() => header.props.onNavigateSummary());

      expect(go).toHaveBeenCalledWith("/dashboard");
    });
  });
});
