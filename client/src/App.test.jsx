import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const home = vi.hoisted(() => ({ props: null }));
const dash = vi.hoisted(() => ({ props: null }));
const planner = vi.hoisted(() => ({ props: null }));

vi.mock("./app/components/PlannerSetupModal", () => ({
  default: (props) => {
    planner.props = props;
    return <div data-testid="planner" />;
  }
}));

vi.mock("./pages/HomePage", () => ({
  default: (props) => {
    home.props = props;
    return <div data-testid="home-page">{props.plannerModal}</div>;
  }
}));

vi.mock("./pages/AuthPage", () => ({
  default: () => <div data-testid="auth-page">Auth page</div>
}));

vi.mock("./pages/DashboardPage", () => ({
  default: (props) => {
    dash.props = props;
    return <div data-testid="dashboard-page">Dashboard page</div>;
  }
}));

vi.mock("./pages/WorkoutResultPage", () => ({
  default: () => <div data-testid="workout-result-page">Workout result page</div>
}));

import App from "./App";
import { goalOptions } from "./app/constants";

const setPath = (path) => {
  window.history.pushState({}, "", path);
};

// The session lookup fires on mount whatever the route, so every test needs a
// fetch that settles.
const stubSession = (impl) => vi.stubGlobal("fetch", vi.fn(impl));
const sessionResponse =
  (body, ok = true) =>
  async () => ({ ok, json: async () => body });

// The session effect is three microtasks deep (fetch, json, setUser). Until it
// settles, `user` is still its initial null -- so asserting "nobody is signed
// in" without flushing first passes before the lookup has even been read.
const renderSettled = async (path) => {
  setPath(path);
  const utils = render(<App />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return utils;
};

const useLocale = (locale) => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue([locale]);
  vi.spyOn(navigator, "language", "get").mockReturnValue(locale);
};

describe("App", () => {
  beforeEach(() => {
    home.props = null;
    dash.props = null;
    stubSession(sessionResponse({}, false));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setPath("/");
  });

  describe("routing", () => {
    test.each([
      ["/", "home-page"],
      ["/auth", "auth-page"],
      ["/dashboard", "dashboard-page"],
      ["/plan", "workout-result-page"]
    ])("%s renders its page", (path, testId) => {
      setPath(path);
      render(<App />);

      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

    test("follows the browser's back button", () => {
      // The route is component state, so without the popstate listener the
      // page would stay put while the URL changed underneath it.
      setPath("/");
      render(<App />);
      expect(screen.getByTestId("home-page")).toBeInTheDocument();

      act(() => {
        window.history.pushState({}, "", "/auth");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(screen.getByTestId("auth-page")).toBeInTheDocument();
    });

    test("stops listening once it is gone", () => {
      // React no longer complains about setting state after unmount, so a
      // leaked listener is invisible from the outside -- the removal itself is
      // what has to be asserted.
      const removed = vi.spyOn(window, "removeEventListener");
      setPath("/");
      const { unmount } = render(<App />);

      unmount();

      expect(removed.mock.calls.some(([type]) => type === "popstate")).toBe(true);
    });

    test("a trailing slash on the dashboard is normalised away", () => {
      setPath("/");
      render(<App />);

      act(() => home.props.go("/dashboard/"));

      expect(window.location.pathname).toBe("/dashboard");
      expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    });

    test("any other path is navigated to as given", () => {
      setPath("/");
      render(<App />);

      act(() => home.props.go("/auth"));

      expect(window.location.pathname).toBe("/auth");
    });
  });

  describe("the dashboard view the URL asks for", () => {
    test.each([
      ["/dashboard", "summary"],
      ["/dashboard/meal", "meal"],
      ["/dashboard/workouts", "workouts"],
      ["/dashboard/settings", "settings"]
    ])("%s opens the %s view", (path, expected) => {
      setPath(path);
      render(<App />);

      expect(dash.props.dashView).toBe(expected);
    });

    test("a dashboard path it does not recognise leaves the view alone", () => {
      // The route still renders the dashboard; only the view selection is
      // skipped, so the visitor keeps whichever view they were on.
      setPath("/dashboard/not-a-view");
      render(<App />);

      expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
      expect(dash.props.dashView).toBe("summary");
    });

    test("navigating between dashboard views follows the URL", () => {
      setPath("/dashboard");
      render(<App />);
      expect(dash.props.dashView).toBe("summary");

      act(() => dash.props.go("/dashboard/tips"));

      expect(dash.props.dashView).toBe("tips");
    });
  });

  describe("picking up the session on arrival", () => {
    test("signs in the user the server returns", async () => {
      stubSession(sessionResponse({ user: { email: "ada@example.com" } }));
      setPath("/dashboard");
      render(<App />);

      await waitFor(() => expect(dash.props.user).toEqual({ email: "ada@example.com" }));
    });

    test("a response with no user leaves nobody signed in", async () => {
      // `data.user || null` -- an empty body must sign in null, not undefined.
      stubSession(sessionResponse({}));
      await renderSettled("/dashboard");

      expect(dash.props.user).toBeNull();
      expect(dash.props.user).not.toBeUndefined();
    });

    test("a rejected lookup is not read at all", async () => {
      // The body carries a user, so reading it would sign that user in. The
      // point of the `res.ok` guard is that it never gets that far.
      stubSession(sessionResponse({ user: { email: "ada@example.com" } }, false));
      await renderSettled("/dashboard");

      expect(dash.props.user).toBeNull();
    });

    test("a lookup that throws does not take the page down", async () => {
      // Equivalent-mutant note: the catch's `setUser(null)` cannot be
      // distinguished from doing nothing, because `user` is already null on the
      // only render where this effect runs. Kept for the "does not throw" half.
      stubSession(() => Promise.reject(new Error("offline")));
      await renderSettled("/dashboard");

      expect(dash.props.user).toBeNull();
      expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    });

    test("asks the session endpoint with credentials", async () => {
      setPath("/");
      render(<App />);

      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith("/api/auth/me", { credentials: "include" })
      );
    });
  });

  describe("the measurement system it starts in", () => {
    test.each([
      ["an imperial visitor", "en-US", "ft", "lb"],
      ["a metric visitor", "en-GB", "cm", "kg"]
    ])("%s starts in their own units", (_label, locale, heightUnit, weightUnit) => {
      useLocale(locale);
      setPath("/");
      render(<App />);

      expect(home.props.heightUnit).toBe(heightUnit);
      expect(home.props.weightUnit).toBe(weightUnit);
    });

    test("resetting the profile returns to those units rather than the last ones", () => {
      useLocale("en-US");
      setPath("/");
      render(<App />);

      act(() => home.props.setHeightUnit("cm"));
      act(() => home.props.setWeightUnit("kg"));
      expect(home.props.heightUnit).toBe("cm");

      act(() => home.props.onResetPersonalFlow());

      expect(home.props.heightUnit).toBe("ft");
      expect(home.props.weightUnit).toBe("lb");
    });

    test("resetting a metric visitor returns them to metric", () => {
      useLocale("en-GB");
      setPath("/");
      render(<App />);

      act(() => home.props.setHeightUnit("ft"));
      act(() => home.props.onResetPersonalFlow());

      expect(home.props.heightUnit).toBe("cm");
      expect(home.props.weightUnit).toBe("kg");
    });

    test("resetting clears what was typed and returns to the basic form", () => {
      setPath("/");
      render(<App />);
      act(() => home.props.onPersonalChange({ target: { name: "name", value: "Ada" } }));
      act(() => home.props.setPersonalMode("advanced"));
      expect(home.props.personal.name).toBe("Ada");

      act(() => home.props.onResetPersonalFlow());

      expect(home.props.personal.name).toBe("");
      expect(home.props.personalMode).toBe("basic");
    });
  });

  describe("editing the profile", () => {
    test("each field is set by its own name", () => {
      setPath("/");
      render(<App />);

      act(() => home.props.onPersonalChange({ target: { name: "age", value: "34" } }));
      act(() => home.props.onPersonalChange({ target: { name: "sex", value: "female" } }));

      expect(home.props.personal.age).toBe("34");
      expect(home.props.personal.sex).toBe("female");
    });

    test("setting one field leaves the others alone", () => {
      setPath("/");
      render(<App />);
      act(() => home.props.onPersonalChange({ target: { name: "age", value: "34" } }));

      act(() => home.props.onPersonalChange({ target: { name: "age", value: "35" } }));

      expect(home.props.personal.age).toBe("35");
      expect(home.props.personal.sex).toBe("");
    });
  });

  describe("opening the planner from the profile", () => {
    test("clears whatever the last plan left behind", () => {
      setPath("/");
      render(<App />);
      act(() => home.props.openPlannerFromProfile());
      const original = planner.props.form.goal;

      act(() => planner.props.onChange({ target: { name: "goal", value: "Run a marathon" } }));
      expect(planner.props.form.goal).toBe("Run a marathon");

      act(() => home.props.openPlannerFromProfile());

      // Reopening has to start from the default, not from the half-finished
      // plan the visitor abandoned last time.
      expect(planner.props.form.goal).toBe(original);
    });

    test("shows the planner", () => {
      setPath("/");
      render(<App />);

      act(() => home.props.openPlannerFromProfile());

      expect(screen.getByTestId("planner")).toBeInTheDocument();
    });

    // PlannerSetupModal offers days, duration, level and injuries -- never the
    // goal -- so before the profile seeded it, every generated plan for every
    // visitor carried the same hardcoded goal into the Gemini prompt.
    //
    // Seeded from resetPlannerFlow rather than an effect, because every path
    // that opens the planner resets it first. That is why this asserts after
    // opening rather than on arrival.
    test("a signed-in visitor's planner starts on their own goal", async () => {
      stubSession(
        sessionResponse({ user: { email: "ada@example.com", profile: { goal: "Recovery" } } })
      );
      await renderSettled("/dashboard");
      // The seed reads user.profile, so the session lookup has to have landed
      // before the planner is opened -- otherwise this asserts the fallback and
      // would pass against code that never reads the profile at all.
      await waitFor(() => expect(dash.props.user).toBeTruthy());

      act(() => dash.props.openPlannerFromProfile());

      // Read from dash.props, not planner.props: the DashboardPage mock does not
      // render props.plannerModal, so planner.props would be whatever the last
      // HomePage-based test left behind. That stale value is the default goal,
      // which means the fallback assertion below would pass against code that
      // never reads the profile at all.
      expect(dash.props.form.goal).toBe("Recovery");
    });

    test("a visitor with no stored goal gets the default", async () => {
      stubSession(sessionResponse({ user: { email: "ada@example.com", profile: {} } }));
      await renderSettled("/dashboard");
      await waitFor(() => expect(dash.props.user).toBeTruthy());

      act(() => dash.props.openPlannerFromProfile());

      expect(dash.props.form.goal).toBe(goalOptions[0]);
    });
  });

  describe("where a signed-in visitor is sent", () => {
    test.each([
      ["the landing page", "/"],
      ["the sign-in page", "/auth"],
      ["the sign-in page with a trailing slash", "/auth/"]
    ])("%s redirects to the dashboard", async (_label, path) => {
      stubSession(sessionResponse({ user: { email: "ada@example.com" } }));
      await renderSettled(path);

      expect(window.location.pathname).toBe("/dashboard");
    });

    test("a signed-out visitor is left where they are", async () => {
      stubSession(sessionResponse({}, false));
      await renderSettled("/");

      expect(window.location.pathname).toBe("/");
      expect(screen.getByTestId("home-page")).toBeInTheDocument();
    });

    test("a signed-in visitor already inside the dashboard is not moved", async () => {
      stubSession(sessionResponse({ user: { email: "ada@example.com" } }));
      await renderSettled("/dashboard/meal");

      expect(window.location.pathname).toBe("/dashboard/meal");
    });

    test("a signed-in visitor reading a plan is not pulled away from it", async () => {
      stubSession(sessionResponse({ user: { email: "ada@example.com" } }));
      await renderSettled("/plan");

      expect(window.location.pathname).toBe("/plan");
    });
  });
});
