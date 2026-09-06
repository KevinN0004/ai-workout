import { beforeEach, describe, expect, test, vi } from "vitest";
import { createAppEventHandlers } from "./events";
import { defaultAuthForm, defaultSignupProfileForm } from "./constants";
import { toCmFromFeetInches, toFeetInchesFromCm, toKg } from "./units";

// jspdf is loaded on demand so it stays out of the initial bundle, which means
// the export path has a failure mode the static import did not: the chunk
// fetch itself. Mocking the module lets both halves be driven without pulling
// a quarter of the bundle into the test run.
const pdfDoc = {
  internal: { pageSize: { getWidth: () => 612, getHeight: () => 792 } },
  splitTextToSize: vi.fn((text) => String(text).split("\n")),
  addPage: vi.fn(),
  text: vi.fn(),
  save: vi.fn()
};
const jsPDF = vi.fn(() => pdfDoc);
// The export has to be constructable: the module does `new jsPDF(...)`, and an
// arrow -- which is what vi.fn hands back -- throws "is not a constructor"
// before the spy is ever reached. A function expression delegates to the spy
// and, by returning an object, makes `new` yield pdfDoc.
vi.mock("jspdf", () => ({
  jsPDF: function jsPDFMock(...args) {
    return jsPDF(...args);
  }
}));

// The auth and sign-out handlers out of app/events.js, which was at 39%.
// These decide what the client does with a session: what it sends to the auth
// endpoints, and what it clears when a user signs out.
//
// The unit conversions are the real ones from units.js, since the signup body
// is built from them and a stub would prove nothing about what gets sent.

const jsonResponse = (body, ok = true) => ({ ok, json: async () => body });

let deps;

const build = (overrides = {}) => createAppEventHandlers({ ...deps, ...overrides });

const submitEvent = () => ({ preventDefault: vi.fn() });

beforeEach(() => {
  deps = {
    apiFetch: vi.fn(async () => jsonResponse({ user: { id: "u-1" } })),
    form: {},
    setLoading: vi.fn(),
    setError: vi.fn(),
    setResult: vi.fn(),
    setDashboard: vi.fn(),
    closePlanner: vi.fn(),
    isDashboardRoute: false,
    setPlanModalOpen: vi.fn(),
    setDashView: vi.fn(),
    go: vi.fn(),
    personal: {},
    heightUnit: "cm",
    weightUnit: "kg",
    setAuthForm: vi.fn(),
    setAuthMode: vi.fn(),
    setAuthError: vi.fn(),
    setShowPassword: vi.fn(),
    setAuthAutoSignIn: vi.fn(),
    setSignupHeightUnit: vi.fn(),
    setSignupWeightUnit: vi.fn(),
    setSignupProfileForm: vi.fn(),
    toCmFromFeetInches,
    toFeetInchesFromCm,
    toKg,
    result: "",
    authMode: "login",
    setAuthLoading: vi.fn(),
    signupProfileForm: { ...defaultSignupProfileForm },
    signupHeightUnit: "cm",
    signupWeightUnit: "kg",
    authForm: { email: "person@example.com", password: "StrongPass123!" },
    setUser: vi.fn(),
    authAutoSignIn: false,
    clearOptimisticOperations: vi.fn(),
    clearDashboardDataState: vi.fn(),
    clearDashboardToast: vi.fn(),
    resetPersonalFlow: vi.fn(),
    queueOptimisticLogCommit: vi.fn(),
    workoutForm: { exercises: "" },
    setWorkoutForm: vi.fn(),
    setWorkoutModalOpen: vi.fn(),
    calorieForm: {},
    setCalorieForm: vi.fn(),
    goalForm: {},
    setDashError: vi.fn(),
    showDashboardToast: vi.fn(),
    mealLogForm: {},
    setMealLogForm: vi.fn(),
    progressForm: {},
    setProgressForm: vi.fn()
  };
});

describe("onLogout", () => {
  test("tells the server to end the session", async () => {
    await build().onLogout();

    expect(deps.apiFetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });

  test("clears the signed-in user and sends them home", async () => {
    await build().onLogout();

    expect(deps.setUser).toHaveBeenCalledWith(null);
    expect(deps.go).toHaveBeenCalledWith("/");
  });

  // Everything holding the previous account's data has to go, or the next
  // person at the same browser sees it.
  test("clears every piece of local dashboard state", async () => {
    await build().onLogout();

    expect(deps.clearOptimisticOperations).toHaveBeenCalledTimes(1);
    expect(deps.clearDashboardDataState).toHaveBeenCalledTimes(1);
    expect(deps.clearDashboardToast).toHaveBeenCalledTimes(1);
    expect(deps.resetPersonalFlow).toHaveBeenCalledTimes(1);
  });

  // Signing out locally must not depend on the request succeeding. A user who
  // clicks Log out on a shared machine, with the network down or the CSRF
  // token unobtainable, still expects their data off the screen.
  describe("when the request fails", () => {
    const failing = () => ({
      apiFetch: vi.fn(async () => {
        throw new Error("network down");
      })
    });

    test("does not reject at the caller", async () => {
      await expect(build(failing()).onLogout()).resolves.toBeUndefined();
    });

    test("still signs the user out locally", async () => {
      await build(failing()).onLogout();

      expect(deps.setUser).toHaveBeenCalledWith(null);
      expect(deps.go).toHaveBeenCalledWith("/");
    });

    test("still clears the dashboard data", async () => {
      await build(failing()).onLogout();

      expect(deps.clearOptimisticOperations).toHaveBeenCalledTimes(1);
      expect(deps.clearDashboardDataState).toHaveBeenCalledTimes(1);
      expect(deps.clearDashboardToast).toHaveBeenCalledTimes(1);
      expect(deps.resetPersonalFlow).toHaveBeenCalledTimes(1);
    });

    // apiFetch throws before sending anything when it cannot get a CSRF token,
    // which is the other way a sign-out can fail.
    test("still signs out when no csrf token could be obtained", async () => {
      const handlers = build({
        apiFetch: vi.fn(async () => {
          throw new Error("Security token unavailable. Refresh and try again.");
        })
      });

      await handlers.onLogout();

      expect(deps.setUser).toHaveBeenCalledWith(null);
      expect(deps.clearDashboardDataState).toHaveBeenCalledTimes(1);
    });
  });
});

describe("onAuthSubmit", () => {
  describe("signing in", () => {
    test("posts the credentials to the login endpoint", async () => {
      const event = submitEvent();

      await build().onAuthSubmit(event);

      expect(event.preventDefault).toHaveBeenCalled();
      const [url, options] = deps.apiFetch.mock.calls[0];
      expect(url).toBe("/api/auth/login");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toMatchObject({
        email: "person@example.com",
        password: "StrongPass123!"
      });
    });

    test("passes the remember-me choice through", async () => {
      await build({ authAutoSignIn: true }).onAuthSubmit(submitEvent());

      expect(JSON.parse(deps.apiFetch.mock.calls[0][1].body).rememberMe).toBe(true);
    });

    test("stores the returned user and moves to the dashboard", async () => {
      await build().onAuthSubmit(submitEvent());

      expect(deps.setUser).toHaveBeenCalledWith({ id: "u-1" });
      expect(deps.go).toHaveBeenCalledWith("/dashboard");
    });

    // The password must not be left sitting in component state afterwards.
    test("empties the credentials form", async () => {
      await build().onAuthSubmit(submitEvent());

      expect(deps.setAuthForm).toHaveBeenCalledWith({ ...defaultAuthForm });
    });

    test("reports the server's message and stays put on a rejection", async () => {
      const handlers = build({
        apiFetch: vi.fn(async () => jsonResponse({ error: "Invalid credentials." }, false))
      });

      await handlers.onAuthSubmit(submitEvent());

      expect(deps.setAuthError).toHaveBeenCalledWith("Invalid credentials.");
      expect(deps.setUser).not.toHaveBeenCalled();
      expect(deps.go).not.toHaveBeenCalled();
    });

    test("falls back to a generic message when the body is unreadable", async () => {
      const handlers = build({
        apiFetch: vi.fn(async () => ({
          ok: false,
          json: async () => {
            throw new Error("not json");
          }
        }))
      });

      await handlers.onAuthSubmit(submitEvent());

      expect(deps.setAuthError).toHaveBeenCalledWith("Unable to authenticate.");
    });

    test("reports a network failure rather than hanging", async () => {
      const handlers = build({
        apiFetch: vi.fn(async () => {
          throw new Error("network down");
        })
      });

      await handlers.onAuthSubmit(submitEvent());

      expect(deps.setAuthError).toHaveBeenCalledWith("network down");
    });

    // The button has to come back regardless of the outcome.
    test.each([
      ["success", async () => jsonResponse({ user: { id: "u-1" } })],
      ["rejection", async () => jsonResponse({ error: "no" }, false)],
      [
        "network failure",
        async () => {
          throw new Error("network down");
        }
      ]
    ])("clears the loading flag after a %s", async (_label, apiFetch) => {
      await build({ apiFetch: vi.fn(apiFetch) }).onAuthSubmit(submitEvent());

      expect(deps.setAuthLoading).toHaveBeenNthCalledWith(1, true);
      expect(deps.setAuthLoading).toHaveBeenLastCalledWith(false);
    });

    test("tolerates a success body with no user on it", async () => {
      const handlers = build({ apiFetch: vi.fn(async () => jsonResponse({})) });

      await handlers.onAuthSubmit(submitEvent());

      expect(deps.setUser).toHaveBeenCalledWith(null);
    });
  });

  describe("signing up", () => {
    const signupDeps = (overrides = {}) => ({
      authMode: "signup",
      signupProfileForm: {
        ...defaultSignupProfileForm,
        firstName: "Jordan",
        lastName: "Kim",
        heightFeet: "5",
        heightInches: "10",
        weight: "168"
      },
      signupHeightUnit: "ft",
      signupWeightUnit: "lb",
      ...overrides
    });

    const bodyOf = () => JSON.parse(deps.apiFetch.mock.calls[0][1].body);

    test("posts to the signup endpoint", async () => {
      await build(signupDeps()).onAuthSubmit(submitEvent());

      expect(deps.apiFetch.mock.calls[0][0]).toBe("/api/auth/signup");
    });

    // The form collects feet and inches but the API stores centimetres, so the
    // conversion has to happen before the body is built.
    test("converts an imperial height to centimetres", async () => {
      await build(signupDeps()).onAuthSubmit(submitEvent());

      expect(bodyOf().profile.heightCm).toBe("178");
    });

    test("converts an imperial weight to kilograms", async () => {
      await build(signupDeps()).onAuthSubmit(submitEvent());

      expect(bodyOf().profile.weightKg).toBe("76");
    });

    test("leaves a metric height and weight alone", async () => {
      await build(
        signupDeps({
          signupHeightUnit: "cm",
          signupWeightUnit: "kg",
          signupProfileForm: {
            ...defaultSignupProfileForm,
            heightCm: "178",
            weight: "76"
          }
        })
      ).onAuthSubmit(submitEvent());

      expect(bodyOf().profile.heightCm).toBe("178");
      expect(bodyOf().profile.weightKg).toBe("76");
    });

    test("sends the credentials alongside the profile", async () => {
      await build(signupDeps()).onAuthSubmit(submitEvent());

      expect(bodyOf()).toMatchObject({
        email: "person@example.com",
        password: "StrongPass123!"
      });
      expect(bodyOf().profile.firstName).toBe("Jordan");
    });

    test("clears both forms and resets the unit choices on success", async () => {
      await build(signupDeps()).onAuthSubmit(submitEvent());

      expect(deps.setAuthForm).toHaveBeenCalledWith({ ...defaultAuthForm });
      expect(deps.setSignupProfileForm).toHaveBeenCalledWith({ ...defaultSignupProfileForm });
      expect(deps.setSignupHeightUnit).toHaveBeenCalledWith("ft");
      expect(deps.setSignupWeightUnit).toHaveBeenCalledWith("lb");
      expect(deps.go).toHaveBeenCalledWith("/dashboard");
    });

    test("reports the server's message and keeps the form on a rejection", async () => {
      const handlers = build(
        signupDeps({
          apiFetch: vi.fn(async () => jsonResponse({ error: "Account already exists." }, false))
        })
      );

      await handlers.onAuthSubmit(submitEvent());

      expect(deps.setAuthError).toHaveBeenCalledWith("Account already exists.");
      expect(deps.setSignupProfileForm).not.toHaveBeenCalled();
      expect(deps.go).not.toHaveBeenCalled();
    });

    test("falls back to a signup-specific message", async () => {
      const handlers = build(
        signupDeps({
          apiFetch: vi.fn(async () => ({
            ok: false,
            json: async () => {
              throw new Error("not json");
            }
          }))
        })
      );

      await handlers.onAuthSubmit(submitEvent());

      expect(deps.setAuthError).toHaveBeenCalledWith("Unable to create account.");
    });
  });
});

describe("onAuthModeChange", () => {
  test("switches the mode and drops any standing error", () => {
    build({ authMode: "login" }).onAuthModeChange("signup");

    expect(deps.setAuthMode).toHaveBeenCalledWith("signup");
    expect(deps.setAuthError).toHaveBeenCalledWith("");
  });

  // Switching away from a half-filled form should not leave the password or
  // the profile behind for the other mode.
  test("empties both forms when the mode actually changes", () => {
    build({ authMode: "login" }).onAuthModeChange("signup");

    expect(deps.setAuthForm).toHaveBeenCalledWith({ ...defaultAuthForm });
    expect(deps.setSignupProfileForm).toHaveBeenCalledWith({ ...defaultSignupProfileForm });
    expect(deps.setAuthAutoSignIn).toHaveBeenCalledWith(false);
    expect(deps.setShowPassword).toHaveBeenCalledWith(false);
  });

  // Re-selecting the mode already showing must not wipe what is being typed.
  test("leaves the forms alone when the mode is unchanged", () => {
    build({ authMode: "login" }).onAuthModeChange("login");

    expect(deps.setAuthMode).toHaveBeenCalledWith("login");
    expect(deps.setAuthError).toHaveBeenCalledWith("");
    expect(deps.setAuthForm).not.toHaveBeenCalled();
    expect(deps.setSignupProfileForm).not.toHaveBeenCalled();
    expect(deps.setShowPassword).not.toHaveBeenCalled();
  });
});

describe("form field handlers", () => {
  const changeEvent = (name, value) => ({ target: { name, value } });

  test("onAuthChange updates only the named field", () => {
    build().onAuthChange(changeEvent("email", "new@example.com"));

    const updater = deps.setAuthForm.mock.calls[0][0];
    expect(updater({ email: "old@example.com", password: "keep" })).toEqual({
      email: "new@example.com",
      password: "keep"
    });
  });

  test("onSignupProfileChange updates only the named field", () => {
    build().onSignupProfileChange(changeEvent("firstName", "Jordan"));

    const updater = deps.setSignupProfileForm.mock.calls[0][0];
    expect(updater({ firstName: "", lastName: "Kim" })).toEqual({
      firstName: "Jordan",
      lastName: "Kim"
    });
  });
});

// The three handlers that go through the optimistic queue covered in
// useOptimisticLogs. They build the entry shown before anything is sent and
// the request closure that eventually sends it, so this is where a form value
// turns into what the API receives.
describe("optimistic submissions", () => {
  const queued = () => deps.queueOptimisticLogCommit.mock.calls[0][0];

  describe("submitWorkout", () => {
    const workoutForm = (overrides = {}) => ({
      date: "2026-03-02",
      focus: "Push",
      duration: "45",
      exercises: "Bench press, Overhead press",
      sets: "4",
      reps: "6",
      intensityRpe: "8",
      notes: "felt strong",
      ...overrides
    });

    test("queues an optimistic workout rather than posting straight away", async () => {
      await build({ workoutForm: workoutForm() }).submitWorkout(submitEvent());

      expect(deps.queueOptimisticLogCommit).toHaveBeenCalledTimes(1);
      expect(deps.apiFetch).not.toHaveBeenCalled();
      expect(queued().type).toBe("workout");
    });

    test("splits the exercises on commas and trims them", async () => {
      await build({
        workoutForm: workoutForm({ exercises: " Bench press ,, Squat ,  " })
      }).submitWorkout(submitEvent());

      expect(queued().item.exercises).toEqual(["Bench press", "Squat"]);
    });

    test("turns the numeric fields into numbers", async () => {
      await build({ workoutForm: workoutForm() }).submitWorkout(submitEvent());

      expect(queued().item).toMatchObject({
        duration: 45,
        sets: 4,
        reps: 6,
        intensityRpe: 8
      });
    });

    // An empty field is absent, not zero. A workout logged with no duration
    // must not read as a zero-minute session in the totals.
    test("leaves an empty numeric field null rather than zero", async () => {
      await build({
        workoutForm: workoutForm({ duration: "", sets: "", reps: "", intensityRpe: "" })
      }).submitWorkout(submitEvent());

      expect(queued().item).toMatchObject({
        duration: null,
        sets: null,
        reps: null,
        intensityRpe: null
      });
    });

    test("falls back to today and a general focus", async () => {
      await build({
        workoutForm: workoutForm({ date: "", focus: "" })
      }).submitWorkout(submitEvent());

      expect(queued().item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(queued().item.focus).toBe("General");
    });

    test("clears the form and closes the modal without waiting for the save", async () => {
      await build({ workoutForm: workoutForm() }).submitWorkout(submitEvent());

      expect(deps.setWorkoutModalOpen).toHaveBeenCalledWith(false);
      expect(deps.setWorkoutForm).toHaveBeenCalledWith(
        expect.objectContaining({ focus: "", exercises: "", duration: "" })
      );
    });

    describe("the queued request", () => {
      test("posts the normalised payload", async () => {
        await build({ workoutForm: workoutForm() }).submitWorkout(submitEvent());
        deps.apiFetch.mockResolvedValue(jsonResponse({ dashboard: {} }));

        await queued().request();

        const [url, options] = deps.apiFetch.mock.calls[0];
        expect(url).toBe("/api/dashboard/workout-sessions");
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body).exercises).toEqual(["Bench press", "Overhead press"]);
      });

      test("returns the parsed body on success", async () => {
        await build({ workoutForm: workoutForm() }).submitWorkout(submitEvent());
        const dashboard = { workouts: [{ id: "w1" }] };
        deps.apiFetch.mockResolvedValue(jsonResponse({ dashboard }));

        await expect(queued().request()).resolves.toEqual({ dashboard });
      });

      test("throws the server's message when the save is refused", async () => {
        await build({ workoutForm: workoutForm() }).submitWorkout(submitEvent());
        deps.apiFetch.mockResolvedValue(jsonResponse({ error: "Duration is required." }, false));

        await expect(queued().request()).rejects.toThrow("Duration is required.");
      });

      test("throws a generic message when the body is unreadable", async () => {
        await build({ workoutForm: workoutForm() }).submitWorkout(submitEvent());
        deps.apiFetch.mockResolvedValue({
          ok: false,
          json: async () => {
            throw new Error("not json");
          }
        });

        await expect(queued().request()).rejects.toThrow("Unable to save workout.");
      });
    });
  });

  describe("submitCalories", () => {
    test("queues an entry dated today", async () => {
      await build({ calorieForm: { calories: "2200" } }).submitCalories(submitEvent());

      expect(queued().type).toBe("calorie");
      expect(queued().item.calories).toBe(2200);
      expect(queued().item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    // Recorded as it behaves: an empty field becomes 0 here rather than null,
    // unlike the workout numbers above.
    test("treats an empty field as zero calories", async () => {
      await build({ calorieForm: { calories: "" } }).submitCalories(submitEvent());

      expect(queued().item.calories).toBe(0);
    });

    test("clears the form", async () => {
      await build({ calorieForm: { calories: "2200" } }).submitCalories(submitEvent());

      expect(deps.setCalorieForm).toHaveBeenCalledWith({ calories: "" });
    });

    test("posts to the calories endpoint", async () => {
      await build({ calorieForm: { calories: "2200" } }).submitCalories(submitEvent());
      deps.apiFetch.mockResolvedValue(jsonResponse({ dashboard: {} }));

      await queued().request();

      expect(deps.apiFetch.mock.calls[0][0]).toBe("/api/dashboard/calories");
    });
  });

  describe("submitMealLog", () => {
    const mealLogForm = (overrides = {}) => ({
      date: "2026-03-02",
      mealType: "lunch",
      name: "Porridge",
      calories: "420",
      proteinG: "18",
      carbsG: "60",
      fatG: "9",
      notes: "",
      ...overrides
    });

    test("queues the meal with its macros as numbers", async () => {
      await build({ mealLogForm: mealLogForm() }).submitMealLog(submitEvent());

      expect(queued().type).toBe("meal");
      expect(queued().item).toMatchObject({
        name: "Porridge",
        mealType: "lunch",
        calories: 420,
        proteinG: 18,
        carbsG: 60,
        fatG: 9
      });
    });

    // A macro nobody filled in is unknown, not zero -- averaging it as zero
    // would drag the daily figures down.
    test("leaves an unfilled macro null", async () => {
      await build({
        mealLogForm: mealLogForm({ calories: "", proteinG: "", carbsG: "", fatG: "" })
      }).submitMealLog(submitEvent());

      expect(queued().item).toMatchObject({
        calories: null,
        proteinG: null,
        carbsG: null,
        fatG: null
      });
    });

    test("falls back to today and an other meal type", async () => {
      await build({
        mealLogForm: mealLogForm({ date: "", mealType: "" })
      }).submitMealLog(submitEvent());

      expect(queued().item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(queued().item.mealType).toBe("other");
    });

    test("resets the form to breakfast and today", async () => {
      await build({ mealLogForm: mealLogForm() }).submitMealLog(submitEvent());

      expect(deps.setMealLogForm).toHaveBeenCalledWith(
        expect.objectContaining({ mealType: "breakfast", name: "", calories: "" })
      );
    });

    test("posts to the meal-logs endpoint", async () => {
      await build({ mealLogForm: mealLogForm() }).submitMealLog(submitEvent());
      deps.apiFetch.mockResolvedValue(jsonResponse({ dashboard: {} }));

      await queued().request();

      expect(deps.apiFetch.mock.calls[0][0]).toBe("/api/dashboard/meal-logs");
    });
  });

  // Each queued entry needs its own id, or two logs in the same second would
  // collide in the operation map and one would never commit.
  test("gives every queued entry a distinct id", async () => {
    const handlers = build({ calorieForm: { calories: "100" } });

    await handlers.submitCalories(submitEvent());
    await handlers.submitCalories(submitEvent());

    const ids = deps.queueOptimisticLogCommit.mock.calls.map(([o]) => o.item.id);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

// The handlers that write directly, without the undo window.
describe("direct submissions", () => {
  const ok = (dashboard = { workouts: [] }) => jsonResponse({ dashboard });

  describe("submitGoals", () => {
    test("posts the goal form and stores the returned dashboard", async () => {
      const dashboard = { goals: { weeklyWorkouts: 4 } };
      deps.apiFetch.mockResolvedValue(ok(dashboard));

      await build({ goalForm: { weeklyWorkouts: 4 } }).submitGoals(submitEvent());

      const [url, options] = deps.apiFetch.mock.calls[0];
      expect(url).toBe("/api/dashboard/goals");
      expect(JSON.parse(options.body)).toEqual({ weeklyWorkouts: 4 });
      expect(deps.setDashboard).toHaveBeenCalledWith(dashboard);
      expect(deps.showDashboardToast).toHaveBeenCalledWith("Goals updated.");
    });

    test("clears any standing error first", async () => {
      deps.apiFetch.mockResolvedValue(ok());

      await build().submitGoals(submitEvent());

      expect(deps.setDashError).toHaveBeenNthCalledWith(1, "");
    });

    test("reports the server's message on a rejection", async () => {
      deps.apiFetch.mockResolvedValue(jsonResponse({ error: "Goal must be positive." }, false));

      await build().submitGoals(submitEvent());

      expect(deps.setDashError).toHaveBeenLastCalledWith("Goal must be positive.");
      expect(deps.showDashboardToast).toHaveBeenCalledWith("Goal must be positive.", "error");
      expect(deps.setDashboard).not.toHaveBeenCalled();
    });

    test("reports a network failure rather than throwing at the caller", async () => {
      deps.apiFetch.mockRejectedValue(new Error("network down"));

      await expect(build().submitGoals(submitEvent())).resolves.toBeUndefined();
      expect(deps.setDashError).toHaveBeenLastCalledWith("network down");
    });
  });

  describe("submitProgressMetric", () => {
    test("posts the form and stores the returned dashboard", async () => {
      const dashboard = { progressMetrics: [{ id: "p1" }] };
      deps.apiFetch.mockResolvedValue(ok(dashboard));

      await build({ progressForm: { weightLb: "168" } }).submitProgressMetric(submitEvent());

      expect(deps.apiFetch.mock.calls[0][0]).toBe("/api/dashboard/progress-metrics");
      expect(deps.setDashboard).toHaveBeenCalledWith(dashboard);
    });

    // The form is only emptied once the write has actually landed, unlike the
    // optimistic handlers above.
    test("clears the form only on success", async () => {
      deps.apiFetch.mockResolvedValue(ok());

      await build().submitProgressMetric(submitEvent());

      expect(deps.setProgressForm).toHaveBeenCalledWith(
        expect.objectContaining({ weightLb: "", bodyFatPct: "" })
      );
    });

    test("keeps the form when the save is refused", async () => {
      deps.apiFetch.mockResolvedValue(jsonResponse({ error: "Weight is required." }, false));

      await build().submitProgressMetric(submitEvent());

      expect(deps.setProgressForm).not.toHaveBeenCalled();
      expect(deps.setDashError).toHaveBeenLastCalledWith("Weight is required.");
    });
  });

  describe("saveExerciseToPlan", () => {
    test("reports success to its caller", async () => {
      const dashboard = { savedExercises: [{ id: "s1" }] };
      deps.apiFetch.mockResolvedValue(ok(dashboard));

      const result = await build().saveExerciseToPlan({ name: "Bench press" });

      expect(deps.apiFetch.mock.calls[0][0]).toBe("/api/dashboard/saved-exercises");
      expect(result).toEqual({ ok: true, data: { dashboard } });
      expect(deps.setDashboard).toHaveBeenCalledWith(dashboard);
    });

    // Returns rather than throws, because the caller is a button that needs to
    // know whether to change its own label.
    test("reports failure to its caller instead of throwing", async () => {
      deps.apiFetch.mockResolvedValue(jsonResponse({ error: "Already saved." }, false));

      const result = await build().saveExerciseToPlan({ name: "Bench press" });

      expect(result).toEqual({ ok: false, error: "Already saved." });
      expect(deps.showDashboardToast).toHaveBeenCalledWith("Already saved.", "error");
    });

    test("sends an empty object when given nothing", async () => {
      deps.apiFetch.mockResolvedValue(ok());

      await build().saveExerciseToPlan();

      expect(JSON.parse(deps.apiFetch.mock.calls[0][1].body)).toEqual({});
    });
  });

  describe("removeSavedExercise", () => {
    test("deletes by id and stores the returned dashboard", async () => {
      const dashboard = { savedExercises: [] };
      deps.apiFetch.mockResolvedValue(ok(dashboard));

      const result = await build().removeSavedExercise("s1");

      const [url, options] = deps.apiFetch.mock.calls[0];
      expect(url).toBe("/api/dashboard/saved-exercises/s1");
      expect(options.method).toBe("DELETE");
      expect(result).toEqual({ ok: true, data: { dashboard } });
    });

    test("reports failure to its caller instead of throwing", async () => {
      deps.apiFetch.mockResolvedValue(jsonResponse({ error: "Not found." }, false));

      const result = await build().removeSavedExercise("missing");

      expect(result).toEqual({ ok: false, error: "Not found." });
      expect(deps.setDashboard).not.toHaveBeenCalled();
    });
  });
});

// The app's main feature: send the planner form to Gemini and route the user to
// the plan that comes back.
describe("onSubmit", () => {
  const generated = (overrides = {}) =>
    jsonResponse({ plan: "Monday - Push\nBench press", ...overrides });

  test("posts the planner form to the generate endpoint", async () => {
    deps.apiFetch.mockResolvedValue(generated());
    const event = submitEvent();

    await build({ form: { goal: "build muscle", days: 4 } }).onSubmit(event);

    expect(event.preventDefault).toHaveBeenCalled();
    const [url, options] = deps.apiFetch.mock.calls[0];
    expect(url).toBe("/api/generate");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ goal: "build muscle", days: 4 });
  });

  test("clears the previous result and error before starting", async () => {
    deps.apiFetch.mockResolvedValue(generated());

    await build().onSubmit(submitEvent());

    expect(deps.setError).toHaveBeenNthCalledWith(1, "");
    expect(deps.setResult).toHaveBeenNthCalledWith(1, "");
  });

  test("stores the generated plan", async () => {
    deps.apiFetch.mockResolvedValue(generated());

    await build().onSubmit(submitEvent());

    expect(deps.setResult).toHaveBeenLastCalledWith("Monday - Push\nBench press");
  });

  // Generation takes long enough that the spinner is the only thing telling a
  // user anything is happening.
  test.each([
    ["success", async () => jsonResponse({ plan: "Monday" })],
    ["rejection", async () => jsonResponse({ error: "no" }, false)],
    [
      "network failure",
      async () => {
        throw new Error("network down");
      }
    ]
  ])("clears the loading flag after a %s", async (_label, apiFetch) => {
    await build({ apiFetch: vi.fn(apiFetch) }).onSubmit(submitEvent());

    expect(deps.setLoading).toHaveBeenNthCalledWith(1, true);
    expect(deps.setLoading).toHaveBeenLastCalledWith(false);
  });

  describe("the saved plan", () => {
    const savedPlan = { id: "p-new", plan: "Monday - Push" };

    test("is put at the front of the dashboard's plans", async () => {
      deps.apiFetch.mockResolvedValue(generated({ savedPlan }));

      await build().onSubmit(submitEvent());

      const updater = deps.setDashboard.mock.calls[0][0];
      expect(updater({ plans: [{ id: "p-old" }] }).plans).toEqual([
        savedPlan,
        { id: "p-old" }
      ]);
    });

    test("becomes the only plan when there were none", async () => {
      deps.apiFetch.mockResolvedValue(generated({ savedPlan }));

      await build().onSubmit(submitEvent());

      const updater = deps.setDashboard.mock.calls[0][0];
      expect(updater({}).plans).toEqual([savedPlan]);
    });

    // Generating a plan while signed out leaves nothing to merge into.
    test("does not invent a dashboard when there is none", async () => {
      deps.apiFetch.mockResolvedValue(generated({ savedPlan }));

      await build().onSubmit(submitEvent());

      const updater = deps.setDashboard.mock.calls[0][0];
      expect(updater(null)).toBeNull();
    });

    test("is not merged when the server saved nothing", async () => {
      deps.apiFetch.mockResolvedValue(generated());

      await build().onSubmit(submitEvent());

      expect(deps.setDashboard).not.toHaveBeenCalled();
    });
  });

  describe("where it sends the user", () => {
    test("stays on the dashboard when that is where the request came from", async () => {
      deps.apiFetch.mockResolvedValue(generated());

      await build({ isDashboardRoute: true }).onSubmit(submitEvent());

      expect(deps.setDashView).toHaveBeenCalledWith("summary");
      expect(deps.go).toHaveBeenCalledWith("/dashboard");
    });

    test("opens the plan page otherwise", async () => {
      deps.apiFetch.mockResolvedValue(generated());

      await build({ isDashboardRoute: false }).onSubmit(submitEvent());

      expect(deps.go).toHaveBeenCalledWith("/plan");
      expect(deps.setDashView).not.toHaveBeenCalled();
    });

    test("closes the planner and its modal either way", async () => {
      deps.apiFetch.mockResolvedValue(generated());

      await build().onSubmit(submitEvent());

      expect(deps.closePlanner).toHaveBeenCalledTimes(1);
      expect(deps.setPlanModalOpen).toHaveBeenCalledWith(false);
    });
  });

  describe("when generation fails", () => {
    test("surfaces the server's message", async () => {
      deps.apiFetch.mockResolvedValue(
        jsonResponse({ error: "The model is overloaded." }, false)
      );

      await build().onSubmit(submitEvent());

      expect(deps.setError).toHaveBeenLastCalledWith("The model is overloaded.");
    });

    test("falls back to a generic message when the body is unreadable", async () => {
      deps.apiFetch.mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error("not json");
        }
      });

      await build().onSubmit(submitEvent());

      expect(deps.setError).toHaveBeenLastCalledWith("Something went wrong.");
    });

    test("reports a network failure rather than throwing at the caller", async () => {
      deps.apiFetch.mockRejectedValue(new Error("network down"));

      await expect(build().onSubmit(submitEvent())).resolves.toBeUndefined();
      expect(deps.setError).toHaveBeenLastCalledWith("network down");
    });

    // A failed generation must not navigate away from the form the user just
    // filled in.
    test("leaves the user where they were", async () => {
      deps.apiFetch.mockResolvedValue(jsonResponse({ error: "no" }, false));

      await build().onSubmit(submitEvent());

      expect(deps.go).not.toHaveBeenCalled();
      expect(deps.closePlanner).not.toHaveBeenCalled();
      expect(deps.setResult).toHaveBeenCalledTimes(1);
    });
  });
});

describe("downloadPlanPdf", () => {
  beforeEach(() => {
    jsPDF.mockClear();
    pdfDoc.save.mockClear();
    pdfDoc.text.mockClear();
    pdfDoc.addPage.mockClear();
  });

  test("renders the current plan and saves it", async () => {
    await build({ result: "Monday - Push\nBench press" }).downloadPlanPdf();

    expect(jsPDF).toHaveBeenCalledTimes(1);
    expect(pdfDoc.text).toHaveBeenCalledTimes(2);
    expect(pdfDoc.save).toHaveBeenCalledWith("ai-workout-plan.pdf");
  });

  test("does nothing when there is no plan to export", async () => {
    await build({ result: "" }).downloadPlanPdf();

    expect(jsPDF).not.toHaveBeenCalled();
    expect(deps.setError).not.toHaveBeenCalled();
  });

  // Enough lines to run past the bottom of a page.
  test("starts a new page when the text runs off the bottom", async () => {
    const manyLines = Array.from({ length: 60 }, (_, i) => `Line ${i}`).join("\n");

    await build({ result: manyLines }).downloadPlanPdf();

    expect(pdfDoc.addPage).toHaveBeenCalled();
  });

  // The reason the handler catches at all: loading jspdf on demand can fail on
  // a flaky network or against a stale deploy, and an unhandled rejection would
  // leave the button looking like it did nothing.
  test("reports a failure instead of rejecting", async () => {
    jsPDF.mockImplementationOnce(() => {
      throw new Error("chunk load failed");
    });

    await expect(build({ result: "Monday" }).downloadPlanPdf()).resolves.toBeUndefined();
    expect(deps.setError).toHaveBeenCalledWith("chunk load failed");
  });

  test("falls back to a readable message when the failure has none", async () => {
    jsPDF.mockImplementationOnce(() => {
      throw new Error("");
    });

    await build({ result: "Monday" }).downloadPlanPdf();

    expect(deps.setError).toHaveBeenCalledWith("Could not prepare the PDF. Please try again.");
  });
});

// The bridge from the signed-out planner into signup: whatever the visitor
// already typed should not have to be typed again.
describe("openSignupWithPrefilledProfile", () => {
  const personal = (overrides = {}) => ({
    name: "Jordan Kim",
    age: "29",
    heightFeet: "5",
    heightInches: "10",
    heightCm: "",
    weight: "168",
    sex: "Male",
    bodyFat: "18",
    activity: "High",
    notes: "knee trouble",
    ...overrides
  });

  const profile = () => deps.setSignupProfileForm.mock.calls[0][0];

  test("switches to signup and goes to the auth page", () => {
    build({ personal: personal() }).openSignupWithPrefilledProfile();

    expect(deps.setAuthMode).toHaveBeenCalledWith("signup");
    expect(deps.go).toHaveBeenCalledWith("/auth");
  });

  test("splits the name the visitor gave into first and last", () => {
    build({ personal: personal() }).openSignupWithPrefilledProfile();

    expect(profile()).toMatchObject({ firstName: "Jordan", lastName: "Kim" });
  });

  test("carries the rest of the profile across", () => {
    build({ personal: personal() }).openSignupWithPrefilledProfile();

    expect(profile()).toMatchObject({
      age: "29",
      sex: "Male",
      bodyFat: "18",
      activity: "High",
      notes: "knee trouble"
    });
  });

  test("converts an imperial height and weight for the signup form", () => {
    build({ personal: personal(), heightUnit: "ft", weightUnit: "lb" })
      .openSignupWithPrefilledProfile();

    expect(profile()).toMatchObject({ heightCm: "178", weightKg: "76" });
    expect(deps.setSignupHeightUnit).toHaveBeenCalledWith("ft");
    expect(deps.setSignupWeightUnit).toHaveBeenCalledWith("lb");
  });

  // Coming from a metric planner, the feet and inches still have to be filled
  // in so the signup form can offer either unit.
  test("derives feet and inches from a metric height", () => {
    build({
      personal: personal({ heightFeet: "", heightInches: "", heightCm: "178" }),
      heightUnit: "cm",
      weightUnit: "kg"
    }).openSignupWithPrefilledProfile();

    expect(profile()).toMatchObject({ heightCm: "178", heightFeet: "5", heightInches: "10" });
    expect(deps.setSignupHeightUnit).toHaveBeenCalledWith("cm");
  });

  test("falls back to the centimetre value when the imperial fields are empty", () => {
    build({
      personal: personal({ heightFeet: "", heightInches: "", heightCm: "180" }),
      heightUnit: "ft"
    }).openSignupWithPrefilledProfile();

    expect(profile().heightCm).toBe("180");
  });

  test("keeps the default activity when the visitor chose none", () => {
    build({ personal: personal({ activity: "" }) }).openSignupWithPrefilledProfile();

    expect(profile().activity).toBe(defaultSignupProfileForm.activity);
  });

  // A visitor who typed nothing must still get a usable, empty signup form.
  test("survives an empty planner", () => {
    build({ personal: {} }).openSignupWithPrefilledProfile();

    expect(profile()).toMatchObject({ firstName: "", lastName: "", age: "" });
    expect(deps.go).toHaveBeenCalledWith("/auth");
  });

  test("starts the credentials form empty", () => {
    build({ personal: personal() }).openSignupWithPrefilledProfile();

    expect(deps.setAuthForm).toHaveBeenCalledWith({ ...defaultAuthForm });
    expect(deps.setShowPassword).toHaveBeenCalledWith(false);
    expect(deps.setAuthError).toHaveBeenCalledWith("");
  });
});
