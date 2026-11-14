import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const home = vi.hoisted(() => ({ props: null }));
const dash = vi.hoisted(() => ({ props: null }));
const planner = vi.hoisted(() => ({ props: null }));

vi.mock("../app/components/PlannerSetupModal", () => ({
  default: (props) => {
    planner.props = props;
    return <div data-testid="planner" />;
  }
}));

vi.mock("../pages/home/HomePage", () => ({
  default: (props) => {
    home.props = props;
    return <div data-testid="home-page">{props.plannerModal}</div>;
  }
}));

const auth = vi.hoisted(() => ({ props: null }));
vi.mock("../pages/auth/AuthPage", () => ({
  default: (props) => {
    auth.props = props;
    return <div data-testid="auth-page">Auth page</div>;
  }
}));

vi.mock("../pages/dashboard/DashboardPage", () => ({
  default: (props) => {
    dash.props = props;
    return <div data-testid="dashboard-page">Dashboard page</div>;
  }
}));

const resultPage = vi.hoisted(() => ({ props: null }));
vi.mock("../pages/workout-result/WorkoutResultPage", () => ({
  default: (props) => {
    resultPage.props = props;
    return <div data-testid="workout-result-page">Workout result page</div>;
  }
}));

const sessionPage = vi.hoisted(() => ({ props: null }));
vi.mock("../pages/workout/SessionPage", () => ({
  default: (props) => {
    sessionPage.props = props;
    return <div data-testid="session-page">Session page</div>;
  }
}));

const workerUpdate = vi.hoisted(() => ({ ready: false, reload: null }));
vi.mock("../app/hooks/useWorkerUpdate", () => ({
  default: () => ({ ready: workerUpdate.ready, reload: workerUpdate.reload })
}));

import App from "../App";
import { DASHBOARD_CACHE_PREFIX, SESSION_CACHE_KEY, goalOptions } from "../app/constants";
import { markUnanswered } from "../app/connection";
import { addToOutbox, readOutbox } from "../app/outbox";
import { readActiveSession, writeActiveSession } from "../app/activeSession";
import { addExercise, blankSession, logSet } from "../app/workoutSession";

const setPath = (path) => {
  window.history.pushState({}, "", path);
};

// The session lookup fires on mount whatever the route, so every test needs a
// fetch that settles.
const stubSession = (impl) => vi.stubGlobal("fetch", vi.fn(impl));
// A refusal is a 401 unless the test names another status.
const sessionResponse =
  (body, ok = true, status = ok ? 200 : 401) =>
  async () => ({ ok, status, json: async () => body });

const SESSION_NOTICE = /can't reach the server to check your sign-in/i;
const sessionLookups = () => fetch.mock.calls.filter(([url]) => url === "/api/auth/me").length;

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
    // A signed-in test keeps its user on the device; the next test starts
    // with none, or a session check with no answer would sign that user in.
    localStorage.removeItem(SESSION_CACHE_KEY);
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

    test("a slug naming an inherited member opens the summary", () => {
      // As a view, Object itself is a function, and a function as dashView
      // turns off the summary's weather and air-quality load.
      setPath("/dashboard/constructor");
      render(<App />);

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
      stubSession(() => Promise.reject(new Error("offline")));
      await renderSettled("/dashboard");

      expect(dash.props.user).toBeNull();
      expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    });

    test("asks the session endpoint with credentials", async () => {
      setPath("/");
      render(<App />);

      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          "/api/auth/me",
          expect.objectContaining({ credentials: "include" })
        )
      );
    });
  });

  // A reload during a session-store outage gets a 503 from /api/auth/me. That
  // is the server saying it cannot tell, not that nobody is signed in, so the
  // visitor is told and the question is asked again until it has an answer.
  describe("a session check the server cannot answer", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test("a 503 is not read as signed out: it says so, then asks again", async () => {
      const answers = [
        sessionResponse({}, false, 503),
        sessionResponse({ user: { email: "ada@example.com" } })
      ];
      stubSession((url) =>
        url === "/api/auth/me" ? answers.shift()() : sessionResponse({}, false)()
      );
      await renderSettled("/dashboard");

      expect(screen.getByRole("status")).toHaveTextContent(SESSION_NOTICE);
      expect(sessionLookups()).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(sessionLookups()).toBe(2);
      expect(dash.props.user).toEqual({ email: "ada@example.com" });
      expect(screen.queryByText(SESSION_NOTICE)).not.toBeInTheDocument();
    });

    test("a network error is not read as signed out either", async () => {
      stubSession(() => Promise.reject(new TypeError("Failed to fetch")));
      await renderSettled("/");

      expect(screen.getByRole("status")).toHaveTextContent(SESSION_NOTICE);
    });

    test("a 401 is signed out, with no notice and no second ask", async () => {
      await renderSettled("/");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });

      expect(screen.queryByText(SESSION_NOTICE)).not.toBeInTheDocument();
      expect(sessionLookups()).toBe(1);
    });

    test("asks less often the longer the server cannot answer", async () => {
      stubSession(sessionResponse({}, false, 503));
      await renderSettled("/");
      const lookupsAfter = async (ms) => {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(ms);
        });
        return sessionLookups();
      };

      expect(await lookupsAfter(1999)).toBe(1);
      expect(await lookupsAfter(1)).toBe(2);
      expect(await lookupsAfter(5000)).toBe(3);
      expect(await lookupsAfter(15000)).toBe(4);
      expect(await lookupsAfter(30000)).toBe(5);
      expect(await lookupsAfter(30000)).toBe(6);
    });

    test("stops asking once App is gone", async () => {
      stubSession(sessionResponse({}, false, 503));
      const { unmount } = await renderSettled("/");

      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });

      expect(sessionLookups()).toBe(1);
    });

    test("an answer that arrives after App is gone schedules nothing", async () => {
      let answer;
      stubSession((url) =>
        url === "/api/auth/me"
          ? new Promise((resolve) => {
              answer = resolve;
            })
          : sessionResponse({}, false)()
      );
      setPath("/");
      const { unmount } = render(<App />);

      unmount();
      await act(async () => {
        answer({ ok: false, status: 503, json: async () => ({}) });
        await vi.advanceTimersByTimeAsync(60000);
      });

      expect(sessionLookups()).toBe(1);
    });
  });

  // The last signed-in user stays on the device, so the app opens with no
  // signal, and while the server wakes, from its cached dashboard
  // (docs/specs/2026-11-06-offline-ready-pwa-design.md).
  describe("opening offline", () => {
    const ada = { email: "ada@example.com", profile: { firstName: "Ada" } };
    const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
    const KEPT = "Entries you log are saved on this device and sent when you reconnect.";
    const OFFLINE_NOTICE = `Offline — showing your data from 2 h ago. ${KEPT}`;
    const cachedSession = () => JSON.parse(localStorage.getItem(SESSION_CACHE_KEY) || "null");
    const cacheSession = (user) =>
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ user }));
    const cacheDashboard = (user, updatedAt) =>
      localStorage.setItem(
        `${DASHBOARD_CACHE_PREFIX}:${user.email}`,
        JSON.stringify({ dashboard: { workouts: [] }, updatedAt })
      );
    const noAnswer = () => Promise.reject(new TypeError("Failed to fetch"));

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
      localStorage.clear();
    });

    test("a signed-in answer is kept on the device", async () => {
      stubSession(sessionResponse({ user: ada }));
      await renderSettled("/dashboard");

      expect(cachedSession()).toEqual({ user: ada });
    });

    test("with no answer, the kept user is signed in from the device, and told so", async () => {
      cacheSession(ada);
      cacheDashboard(ada, NOW - 2 * 60 * 60 * 1000);
      stubSession(noAnswer);
      await renderSettled("/dashboard");

      expect(dash.props.user).toEqual(ada);
      expect(screen.getByRole("status")).toHaveTextContent(OFFLINE_NOTICE);
      expect(screen.queryByText(SESSION_NOTICE)).not.toBeInTheDocument();
    });

    test("leaves the age out when no dashboard is kept", async () => {
      cacheSession(ada);
      stubSession(noAnswer);
      await renderSettled("/dashboard");

      expect(screen.getByRole("status")).toHaveTextContent(
        `Offline — showing the data saved on this device. ${KEPT}`
      );
    });

    test("keeps asking, and the server's answer takes over once it comes", async () => {
      const grace = { email: "grace@example.com" };
      cacheSession(ada);
      const answers = [noAnswer, noAnswer, sessionResponse({ user: grace })];
      stubSession((url) => (url === "/api/auth/me" ? answers.shift()() : noAnswer()));
      await renderSettled("/dashboard");
      expect(dash.props.user).toEqual(ada);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(dash.props.user).toEqual(ada);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(dash.props.user).toEqual(grace);
      expect(cachedSession()).toEqual({ user: grace });
    });

    // Two checks with no answer first: the kept user is read from the device
    // once, so the 401 still recognises the user it signed in.
    test("a 401 after that signs the kept user out and forgets them", async () => {
      cacheSession(ada);
      const answers = [noAnswer, noAnswer, sessionResponse({}, false)];
      stubSession((url) => (url === "/api/auth/me" ? answers.shift()() : noAnswer()));
      await renderSettled("/dashboard");
      expect(dash.props.user).toEqual(ada);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(dash.props.user).toEqual(ada);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(dash.props.user).toBeNull();
      expect(cachedSession()).toBeNull();
    });

    test("a 401 forgets a kept user it never showed", async () => {
      cacheSession(ada);
      await renderSettled("/");

      expect(cachedSession()).toBeNull();
      expect(home.props.user).toBeNull();
    });

    test("a 401 does not sign out someone who signed in while it was on its way", async () => {
      let answerCheck;
      stubSession((url) =>
        url === "/api/auth/me"
          ? new Promise((resolve) => {
              answerCheck = resolve;
            })
          : sessionResponse({ user: ada })()
      );
      document.cookie = "csrfToken=race-token";
      try {
        setPath("/auth");
        render(<App />);
        await act(async () => {
          await auth.props.onAuthSubmit({ preventDefault: () => {} });
        });
        expect(dash.props?.user ?? null).toEqual(ada);

        await act(async () => {
          answerCheck({ ok: false, status: 401, json: async () => ({}) });
        });

        expect(dash.props.user).toEqual(ada);
      } finally {
        document.cookie = "csrfToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
      }
    });

    // The device still holds Grace because it refuses to store Ada, as a full
    // or locked-down storage does while it still reads.
    test("a check with no answer does not replace someone who signed in meanwhile", async () => {
      cacheSession({ email: "grace@example.com" });
      const setItem = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
        if (key === SESSION_CACHE_KEY)
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        return setItem.call(this, key, value);
      });
      let failCheck;
      stubSession((url) =>
        url === "/api/auth/me"
          ? new Promise((_resolve, reject) => {
              failCheck = reject;
            })
          : sessionResponse({ user: ada })()
      );
      document.cookie = "csrfToken=race-token";
      try {
        setPath("/auth");
        render(<App />);
        await act(async () => {
          await auth.props.onAuthSubmit({ preventDefault: () => {} });
        });

        await act(async () => {
          failCheck(new TypeError("Failed to fetch"));
        });

        expect(dash.props.user).toEqual(ada);
      } finally {
        document.cookie = "csrfToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
      }
    });

    test("a request that gets no answer later shows the notice for a signed-in user", async () => {
      cacheDashboard(ada, NOW - 2 * 60 * 60 * 1000);
      stubSession(sessionResponse({ user: ada }));
      await renderSettled("/dashboard");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      act(() => markUnanswered());

      expect(screen.getByRole("status")).toHaveTextContent(OFFLINE_NOTICE);
    });

    test("a server that answers with an error is shown the same way", async () => {
      cacheSession(ada);
      stubSession(sessionResponse({}, false, 503));
      await renderSettled("/dashboard");

      expect(dash.props.user).toEqual(ada);
      expect(screen.getByRole("status")).toHaveTextContent(/^Offline — /);
    });
  });

  // Entries kept on the device are sent once App has a user and a connection,
  // and a sign-out that would lose them asks first
  // (docs/specs/2026-11-06-offline-ready-pwa-design.md).
  // Roadmap C2: the quiet Strava catch-up, and the two Strava handlers the
  // dashboard is handed.
  describe("Strava", () => {
    const ada = { email: "ada@example.com" };
    const callsTo = (path) => fetch.mock.calls.filter(([url]) => url === path);

    beforeEach(() => {
      document.cookie = "csrfToken=strava-token";
    });

    afterEach(() => {
      document.cookie = "csrfToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
      localStorage.clear();
    });

    const signedIn = (syncAnswer) =>
      stubSession((url) => {
        if (url === "/api/auth/me") return sessionResponse({ user: ada })();
        if (url === "/api/integrations/strava/sync") return sessionResponse(syncAnswer)();
        return sessionResponse({ dashboard: { workouts: [] } })();
      });

    test("syncs on entering the dashboard, and loads it again when workouts changed", async () => {
      signedIn({ imported: 1, updated: 0, removed: 0 });
      await renderSettled("/dashboard");

      await waitFor(() => expect(callsTo("/api/dashboard")).toHaveLength(2));
      expect(callsTo("/api/integrations/strava/sync")).toHaveLength(1);
    });

    test("a sync that changed nothing loads the dashboard once", async () => {
      signedIn({ skipped: true });
      await renderSettled("/dashboard");

      await waitFor(() => expect(callsTo("/api/integrations/strava/sync")).toHaveLength(1));
      await act(async () => {});
      expect(callsTo("/api/dashboard")).toHaveLength(1);
    });

    test("hands the dashboard the import delete and the reload", async () => {
      signedIn({ skipped: true });
      await renderSettled("/dashboard");
      await waitFor(() => expect(callsTo("/api/dashboard")).toHaveLength(1));

      await act(async () => {
        await dash.props.onDeleteImportedWorkout("import-1");
      });
      expect(callsTo("/api/dashboard/workouts/import-1")[0][1]).toMatchObject({
        method: "DELETE"
      });

      act(() => dash.props.reloadDashboard());
      await waitFor(() => expect(callsTo("/api/dashboard")).toHaveLength(2));
    });
  });

  describe("entries kept on the device", () => {
    const ada = { email: "ada@example.com" };
    const keepEntry = () =>
      addToOutbox(ada, {
        clientId: "k1",
        type: "workout",
        url: "/api/dashboard/workout-sessions",
        body: { id: "k1", focus: "Kept" },
        item: { id: "op-k1", focus: "Kept" },
        queuedAt: 1
      });

    beforeEach(() => {
      document.cookie = "csrfToken=kept-token";
    });

    afterEach(() => {
      document.cookie = "csrfToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
      localStorage.clear();
    });

    test("are sent once the user is signed in, and leave the device", async () => {
      keepEntry();
      stubSession((url) =>
        url === "/api/auth/me"
          ? sessionResponse({ user: ada })()
          : sessionResponse({ dashboard: { workouts: [] } })()
      );
      await renderSettled("/dashboard");
      await act(async () => {
        await Promise.resolve();
      });

      const sent = fetch.mock.calls.filter(([url]) => url === "/api/dashboard/workout-sessions");
      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0][1].body)).toEqual({ id: "k1", focus: "Kept" });
      expect(readOutbox(ada)).toEqual([]);
    });

    test("a sign-out that would lose them asks, and Sign out anyway signs out", async () => {
      keepEntry();
      stubSession((url) =>
        url === "/api/auth/me"
          ? sessionResponse({ user: ada })()
          : url === "/api/dashboard/workout-sessions"
            ? Promise.reject(new TypeError("Failed to fetch"))
            : sessionResponse({})()
      );
      await renderSettled("/dashboard");

      await act(async () => {
        await dash.props.onLogout();
      });
      expect(screen.getByRole("dialog", { name: "Sign out?" })).toBeInTheDocument();
      expect(dash.props.user).toEqual(ada);

      await act(async () => {
        screen.getByRole("button", { name: "Sign out anyway" }).click();
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(home.props.user).toBeNull();
      expect(readOutbox(ada)).toEqual([]);
    });

    test("Cancel keeps the visitor signed in, and the entries", async () => {
      keepEntry();
      stubSession((url) =>
        url === "/api/auth/me"
          ? sessionResponse({ user: ada })()
          : url === "/api/dashboard/workout-sessions"
            ? Promise.reject(new TypeError("Failed to fetch"))
            : sessionResponse({})()
      );
      await renderSettled("/dashboard");
      await act(async () => {
        await dash.props.onLogout();
      });

      await act(async () => {
        screen.getByRole("button", { name: "Cancel" }).click();
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(dash.props.user).toEqual(ada);
      expect(readOutbox(ada)).toHaveLength(1);
    });
  });

  // The in-gym session's route, its Resume notice, and the question when one is
  // already open (roadmap B6).
  describe("the in-gym session", () => {
    const ada = { email: "ada@example.com" };
    const STARTED = Date.UTC(2026, 10, 9, 17, 5, 0);
    const started = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    }).format(STARTED);
    const withSet = () =>
      logSet(
        addExercise(blankSession({ now: STARTED }), { name: "Squat", kind: "reps" }),
        { amount: 5, loadKg: 100, rpe: null },
        STARTED
      );

    beforeEach(() => {
      sessionPage.props = null;
      document.cookie = "csrfToken=session-token";
    });

    afterEach(() => {
      document.cookie = "csrfToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
      localStorage.clear();
    });

    test("/workout opens the session kept on the device", async () => {
      const open = withSet();
      writeActiveSession(ada, open);
      stubSession(sessionResponse({ user: ada }));
      await renderSettled("/workout");

      expect(await screen.findByTestId("session-page")).toBeInTheDocument();
      expect(sessionPage.props.initialSession).toEqual(open);
      expect(sessionPage.props.user).toEqual(ada);
    });

    test("/workout with no session open goes to the Logs", async () => {
      stubSession(sessionResponse({ user: ada }));
      await renderSettled("/workout");

      expect(window.location.pathname).toBe("/dashboard/workouts");
    });

    test("/workout with nobody signed in asks to sign in", async () => {
      await renderSettled("/workout");

      expect(screen.getByText("Sign in to continue your workout.")).toBeInTheDocument();
      await act(async () => {
        screen.getByRole("button", { name: "Sign in" }).click();
      });
      expect(window.location.pathname).toBe("/auth");
    });

    test("leaving keeps the session, and the dashboard offers to resume it", async () => {
      writeActiveSession(ada, withSet());
      stubSession(sessionResponse({ user: ada }));
      await renderSettled("/workout");
      await screen.findByTestId("session-page");

      await act(async () => sessionPage.props.onLeave());

      expect(window.location.pathname).toBe("/dashboard/workouts");
      expect(screen.getByRole("status")).toHaveTextContent(
        `Workout in progress, started ${started}.`
      );
      await act(async () => {
        screen.getByRole("button", { name: "Resume" }).click();
      });
      expect(window.location.pathname).toBe("/workout");
    });

    test("no Resume notice off the dashboard", async () => {
      writeActiveSession(ada, withSet());
      stubSession(sessionResponse({ user: ada }));
      await renderSettled("/plan");

      expect(screen.queryByText(/Workout in progress/)).not.toBeInTheDocument();
    });

    test("no Resume notice on the session screen itself", async () => {
      writeActiveSession(ada, withSet());
      stubSession(sessionResponse({ user: ada }));
      await renderSettled("/workout");
      await screen.findByTestId("session-page");

      expect(screen.queryByText(/Workout in progress/)).not.toBeInTheDocument();
    });

    test("starting one while another is open asks, and each answer does its part", async () => {
      const open = withSet();
      writeActiveSession(ada, open);
      stubSession(sessionResponse({ user: ada }));
      await renderSettled("/dashboard/plans");
      const draft = blankSession({ now: STARTED + 60 * 60 * 1000 });

      await act(async () => dash.props.onStartSession(draft));
      expect(screen.getByRole("dialog", { name: "A workout is in progress" })).toBeInTheDocument();

      await act(async () => {
        screen.getByRole("button", { name: "Discard and start" }).click();
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(readActiveSession(ada)).toEqual(draft);
      expect(window.location.pathname).toBe("/workout");
    });

    test("Resume opens the session already open, and drops the new one", async () => {
      const open = withSet();
      writeActiveSession(ada, open);
      stubSession(sessionResponse({ user: ada }));
      await renderSettled("/dashboard/plans");

      await act(async () => dash.props.onStartSession(blankSession({ now: STARTED })));
      await act(async () => {
        within(screen.getByRole("dialog")).getByRole("button", { name: "Resume" }).click();
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(readActiveSession(ada)).toEqual(open);
      expect(window.location.pathname).toBe("/workout");
    });

    test("closing the question leaves the open session as it was", async () => {
      const open = withSet();
      writeActiveSession(ada, open);
      stubSession(sessionResponse({ user: ada }));
      await renderSettled("/dashboard/plans");

      await act(async () => dash.props.onStartSession(blankSession({ now: STARTED })));
      await act(async () => {
        fireEvent.keyDown(document, { key: "Escape" });
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(readActiveSession(ada)).toEqual(open);
    });

    test("Finish and Cancel reach the session handlers", async () => {
      writeActiveSession(ada, withSet());
      stubSession(sessionResponse({ user: ada }));
      await renderSettled("/workout");
      await screen.findByTestId("session-page");

      await act(async () => sessionPage.props.onDiscard());

      expect(readActiveSession(ada)).toBeNull();
      expect(window.location.pathname).toBe("/dashboard/workouts");
    });
  });

  // A deploy reaches an open app as a waiting worker. It is offered, never
  // forced: nothing reloads until the visitor asks
  // (docs/specs/2026-11-06-offline-ready-pwa-design.md).
  describe("a new version of the app", () => {
    const UPDATE_NOTICE = /a new version is ready/i;

    beforeEach(() => {
      workerUpdate.ready = true;
      workerUpdate.reload = vi.fn();
    });

    afterEach(() => {
      workerUpdate.ready = false;
      workerUpdate.reload = null;
    });

    test("is offered with a Reload button, and reloads only when asked", async () => {
      await renderSettled("/");

      expect(screen.getByRole("status")).toHaveTextContent(UPDATE_NOTICE);
      expect(workerUpdate.reload).not.toHaveBeenCalled();

      await act(async () => {
        screen.getByRole("button", { name: "Reload" }).click();
      });

      expect(workerUpdate.reload).toHaveBeenCalledTimes(1);
    });

    test("is not offered while none is waiting", async () => {
      workerUpdate.ready = false;
      await renderSettled("/");

      expect(screen.queryByText(UPDATE_NOTICE)).not.toBeInTheDocument();
    });

    test("waits behind the session notice, which says the data is stale", async () => {
      stubSession(() => Promise.reject(new TypeError("Failed to fetch")));
      await renderSettled("/");

      expect(screen.getByRole("status")).toHaveTextContent(SESSION_NOTICE);
      expect(screen.queryByText(UPDATE_NOTICE)).not.toBeInTheDocument();
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

  // The whole path: the meal form's handler queues the entry behind its undo
  // window, and Log out, wired through createAppEventHandlers to the hook,
  // must send it before the session ends. The network is the only boundary
  // stubbed.
  describe("logging out", () => {
    test("sends a log still inside its undo window before the logout request", async () => {
      const posts = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url, options = {}) => {
          const path = String(url);
          if (options.method === "POST") posts.push(path);
          if (path === "/api/auth/me") {
            return { ok: true, json: async () => ({ user: { email: "ada@example.com" } }) };
          }
          if (path === "/api/csrf-token") {
            return { ok: true, json: async () => ({ csrfToken: "t" }) };
          }
          if (path.startsWith("/api/dashboard")) {
            return { ok: true, json: async () => ({ dashboard: { mealLogs: [] } }) };
          }
          return { ok: true, json: async () => ({}) };
        })
      );
      await renderSettled("/dashboard");
      await waitFor(() => expect(dash.props.user).toBeTruthy());

      // Awaited: submitMealLog is async, and an act scope left open holds back
      // every render in the tests after this one.
      await act(async () => dash.props.submitMealLog({ preventDefault() {} }));
      await act(async () => {
        await dash.props.onLogout();
      });

      // Entering the dashboard also posts the quiet Strava catch-up (roadmap
      // C2), which has no bearing on the order asked about here.
      expect(posts.filter((path) => path !== "/api/integrations/strava/sync")).toEqual([
        "/api/dashboard/meal-logs",
        "/api/auth/logout"
      ]);
    });

    // Sign-out clears this browser's cookies whatever happens, so a 503 means
    // the session itself is still valid in the store. The visitor is told,
    // can dismiss it, and does not see it once someone signs in again.
    describe("when the server could not end the session", () => {
      const SIGN_OUT_NOTICE = /the server could not end your session/i;

      const signedInThenOutage = () =>
        vi.stubGlobal(
          "fetch",
          vi.fn(async (url) => {
            const path = String(url);
            if (path === "/api/auth/me" || path === "/api/auth/login") {
              return {
                ok: true,
                status: 200,
                json: async () => ({ user: { email: "ada@example.com" } })
              };
            }
            if (path === "/api/csrf-token") {
              return { ok: true, status: 200, json: async () => ({ csrfToken: "t" }) };
            }
            if (path === "/api/auth/logout") {
              return { ok: false, status: 503, json: async () => ({ error: "Server error." }) };
            }
            return { ok: true, status: 200, json: async () => ({ dashboard: {} }) };
          })
        );

      const logOut = async () => {
        await renderSettled("/dashboard");
        await waitFor(() => expect(dash.props.user).toBeTruthy());
        await act(async () => {
          await dash.props.onLogout();
        });
      };

      test("says so after signing out here", async () => {
        signedInThenOutage();
        await logOut();

        expect(home.props.user).toBeNull();
        expect(screen.getByRole("status")).toHaveTextContent(SIGN_OUT_NOTICE);
      });

      test("can be dismissed", async () => {
        signedInThenOutage();
        await logOut();

        await act(async () => {
          screen.getByRole("button", { name: "Dismiss" }).click();
        });

        expect(screen.queryByText(SIGN_OUT_NOTICE)).not.toBeInTheDocument();
      });

      test("is gone once someone signs in again", async () => {
        signedInThenOutage();
        await logOut();
        act(() => home.props.go("/auth"));

        await act(async () => {
          await auth.props.onAuthSubmit({ preventDefault() {} });
        });

        expect(dash.props.user).toEqual({ email: "ada@example.com" });
        expect(screen.queryByText(SIGN_OUT_NOTICE)).not.toBeInTheDocument();
      });
    });
  });

  describe("the dashboard's pagination", () => {
    test("is handed from the dashboard response to the dashboard page", async () => {
      const pagination = { mealLogs: { total: 120 } };
      stubSession(async (url) => ({
        ok: true,
        json: async () =>
          String(url).startsWith("/api/dashboard")
            ? { dashboard: { mealLogs: [] }, pagination }
            : { user: { email: "ada@example.com" } }
      }));

      await renderSettled("/dashboard");

      await waitFor(() => expect(dash.props.dashboardPagination).toEqual(pagination));
    });
  });

  describe("a generated plan", () => {
    // The answer's structure, not its text, becomes the result page's plan: the
    // text names a different day, so the two cannot be confused.
    test("reaches the result page from the structure the server parsed", async () => {
      const payload = {
        version: 1,
        days: [
          { index: 0, weekday: "Tuesday", title: "Tuesday - Pull", lines: ["From the payload"] }
        ],
        notes: ["Sleep well"]
      };
      stubSession(async (url) => {
        const path = String(url);
        if (path === "/api/generate") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ plan: "Monday\nFrom the text", payload, savedPlan: null })
          };
        }
        if (path === "/api/csrf-token") {
          return { ok: true, status: 200, json: async () => ({ csrfToken: "t" }) };
        }
        return { ok: false, status: 401, json: async () => ({}) };
      });
      await renderSettled("/");

      act(() => home.props.openPlannerFromProfile());
      await act(async () => planner.props.onSubmit({ preventDefault() {} }));

      await waitFor(() =>
        expect(resultPage.props?.planSections).toEqual({
          days: payload.days,
          notes: ["Sleep well"]
        })
      );
    });
  });

  describe("the newest plan's week", () => {
    // A plan saved with its structure is read from that structure, not its
    // text, which here names a different day so the two cannot be confused.
    test("is handed to the dashboard from the plan's saved structure", async () => {
      const payload = {
        version: 1,
        days: [
          { index: 0, weekday: "Tuesday", title: "Tuesday - Pull", lines: ["From the payload"] }
        ],
        notes: []
      };
      stubSession(async (url) => ({
        ok: true,
        json: async () =>
          String(url).startsWith("/api/dashboard")
            ? { dashboard: { plans: [{ plan: "Monday\nFrom the text", payload }] } }
            : { user: { email: "ada@example.com" } }
      }));

      await renderSettled("/dashboard");

      await waitFor(() =>
        expect(dash.props.latestPlanByWeekday).toEqual({ Tuesday: ["From the payload"] })
      );
    });
  });

  describe("the ambient readings", () => {
    // jsdom has no navigator.geolocation, so the summary view's auto-load
    // fails before it requests anything: the location kind, for both cards.
    test("hands the dashboard the kind of each ambient failure", async () => {
      stubSession(sessionResponse({ user: { email: "ada@example.com" } }));
      await renderSettled("/dashboard");

      await waitFor(() => expect(dash.props.weatherErrorKind).toBe("location"));
      expect(dash.props.airQualityErrorKind).toBe("location");
    });
  });
});
