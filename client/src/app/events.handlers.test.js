import { beforeEach, describe, expect, test, vi } from "vitest";
import { createAppEventHandlers } from "./events.js";

const jsonResponse = (body, ok = true) => ({
  ok,
  json: async () => body
});

const buildDeps = (overrides = {}) => {
  const deps = {
    apiFetch: vi.fn(async () => jsonResponse({ dashboard: { workouts: [] } })),
    queueOptimisticLogCommit: vi.fn(),
    setWorkoutForm: vi.fn(),
    setWorkoutModalOpen: vi.fn(),
    setCalorieForm: vi.fn(),
    setDashboard: vi.fn(),
    setDashError: vi.fn(),
    showDashboardToast: vi.fn(),
    workoutForm: {
      date: "2026-03-01",
      focus: "Push",
      duration: "45",
      exercises: " bench , , squat ,",
      sets: "3",
      reps: "10",
      intensityRpe: "7.5",
      notes: "felt good"
    },
    calorieForm: { calories: "2200" },
    ...overrides
  };
  return { deps, handlers: createAppEventHandlers(deps) };
};

const submitEvent = () => ({ preventDefault: vi.fn() });

describe("submitWorkout", () => {
  test("splits the exercise field into trimmed, non-empty entries", async () => {
    const { deps, handlers } = buildDeps();

    await handlers.submitWorkout(submitEvent());

    const commit = deps.queueOptimisticLogCommit.mock.calls[0][0];
    expect(commit.item.exercises).toEqual(["bench", "squat"]);
  });

  test("coerces numeric fields and keeps the supplied date and focus", async () => {
    const { deps, handlers } = buildDeps();

    await handlers.submitWorkout(submitEvent());

    const { item, type } = deps.queueOptimisticLogCommit.mock.calls[0][0];
    expect(type).toBe("workout");
    expect(item).toMatchObject({
      date: "2026-03-01",
      focus: "Push",
      duration: 45,
      sets: 3,
      reps: 10,
      intensityRpe: 7.5,
      notes: "felt good"
    });
  });

  test("falls back to General focus and null numerics when fields are blank", async () => {
    const { deps, handlers } = buildDeps({
      workoutForm: {
        date: "",
        focus: "",
        duration: "",
        exercises: "",
        sets: "",
        reps: "",
        intensityRpe: "",
        notes: ""
      }
    });

    await handlers.submitWorkout(submitEvent());

    const { item } = deps.queueOptimisticLogCommit.mock.calls[0][0];
    expect(item.focus).toBe("General");
    expect(item.duration).toBeNull();
    expect(item.sets).toBeNull();
    expect(item.reps).toBeNull();
    expect(item.intensityRpe).toBeNull();
    expect(item.exercises).toEqual([]);
    // A blank date falls back to today rather than posting an empty string.
    expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("posts the normalized payload when the queued request runs", async () => {
    const { deps, handlers } = buildDeps();
    await handlers.submitWorkout(submitEvent());

    const { request } = deps.queueOptimisticLogCommit.mock.calls[0][0];
    await request();

    const [url, options] = deps.apiFetch.mock.calls[0];
    expect(url).toBe("/api/dashboard/workout-sessions");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body).exercises).toEqual(["bench", "squat"]);
  });

  test("surfaces the server's error message when the request fails", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ error: "duration too long" }, false))
    });
    await handlers.submitWorkout(submitEvent());

    const { request } = deps.queueOptimisticLogCommit.mock.calls[0][0];
    await expect(request()).rejects.toThrow("duration too long");
  });

  test("falls back to a generic message when the error body is unreadable", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => ({
        ok: false,
        json: async () => {
          throw new Error("not json");
        }
      }))
    });
    await handlers.submitWorkout(submitEvent());

    const { request } = deps.queueOptimisticLogCommit.mock.calls[0][0];
    await expect(request()).rejects.toThrow("Unable to save workout.");
  });

  test("clears the form and closes the modal", async () => {
    const { deps, handlers } = buildDeps();

    await handlers.submitWorkout(submitEvent());

    expect(deps.setWorkoutForm).toHaveBeenCalledWith(
      expect.objectContaining({ focus: "", exercises: "", notes: "" })
    );
    expect(deps.setWorkoutModalOpen).toHaveBeenCalledWith(false);
  });
});

describe("submitCalories", () => {
  test("logs against today rather than any date held in the form", async () => {
    const { deps, handlers } = buildDeps({
      calorieForm: { calories: "2200", date: "1999-01-01" }
    });

    await handlers.submitCalories(submitEvent());

    const { request, item, type } = deps.queueOptimisticLogCommit.mock.calls[0][0];
    expect(type).toBe("calorie");
    expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(item.date).not.toBe("1999-01-01");

    await request();
    expect(JSON.parse(deps.apiFetch.mock.calls[0][1].body).date).not.toBe("1999-01-01");
  });

  test("treats a blank calorie field as zero", async () => {
    const { deps, handlers } = buildDeps({ calorieForm: { calories: "" } });

    await handlers.submitCalories(submitEvent());

    expect(deps.queueOptimisticLogCommit.mock.calls[0][0].item.calories).toBe(0);
  });

  test("resets the field after submitting", async () => {
    const { deps, handlers } = buildDeps();

    await handlers.submitCalories(submitEvent());

    expect(deps.setCalorieForm).toHaveBeenCalledWith({ calories: "" });
  });
});

describe("saveExerciseToPlan", () => {
  beforeEach(() => vi.clearAllMocks());

  test("stores the returned dashboard and confirms via toast", async () => {
    const dashboard = { savedExercises: [{ id: "e1" }] };
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ dashboard }))
    });

    const result = await handlers.saveExerciseToPlan({ name: "Squat" });

    expect(result).toEqual({ ok: true, data: { dashboard } });
    expect(deps.setDashboard).toHaveBeenCalledWith(dashboard);
    expect(deps.showDashboardToast).toHaveBeenCalledWith("Exercise saved to your plan.");
    expect(deps.setDashError).toHaveBeenCalledWith("");
  });

  test("reports failure through both the error state and an error toast", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ error: "already saved" }, false))
    });

    const result = await handlers.saveExerciseToPlan({ name: "Squat" });

    expect(result).toEqual({ ok: false, error: "already saved" });
    expect(deps.setDashError).toHaveBeenLastCalledWith("already saved");
    expect(deps.showDashboardToast).toHaveBeenCalledWith("already saved", "error");
    expect(deps.setDashboard).not.toHaveBeenCalled();
  });

  test("sends an empty object when no payload is supplied", async () => {
    const { deps, handlers } = buildDeps();

    await handlers.saveExerciseToPlan();

    expect(deps.apiFetch.mock.calls[0][1].body).toBe("{}");
  });
});

describe("removeSavedExercise", () => {
  beforeEach(() => vi.clearAllMocks());

  test("deletes by id and stores the returned dashboard", async () => {
    const dashboard = { savedExercises: [] };
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ dashboard }))
    });

    const result = await handlers.removeSavedExercise("entry-7");

    expect(deps.apiFetch).toHaveBeenCalledWith("/api/dashboard/saved-exercises/entry-7", {
      method: "DELETE"
    });
    expect(result).toEqual({ ok: true, data: { dashboard } });
    expect(deps.showDashboardToast).toHaveBeenCalledWith("Saved exercise removed.");
  });

  test("reports failure without clearing the dashboard", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ error: "not found" }, false))
    });

    const result = await handlers.removeSavedExercise("missing");

    expect(result).toEqual({ ok: false, error: "not found" });
    expect(deps.showDashboardToast).toHaveBeenCalledWith("not found", "error");
    expect(deps.setDashboard).not.toHaveBeenCalled();
  });
});

// The optimistic log actions hand a `request` closure to
// `queueOptimisticLogCommit` rather than calling the API themselves, and every
// test above mocks that queue -- so the closure, and the failure handling
// inside it, was never run. These capture it and drive it directly.
describe("the optimistic log requests", () => {
  const queuedRequest = (queueMock) => queueMock.mock.calls.at(-1)[0].request;

  const mealForm = {
    date: "2026-03-01",
    mealType: "lunch",
    name: "Rice bowl",
    calories: "600",
    proteinG: "40",
    carbsG: "70",
    fatG: "12",
    notes: "post-workout"
  };

  describe.each([
    ["calories", "submitCalories", "/api/dashboard/calories", "Unable to save calories.", {}],
    [
      "meal log",
      "submitMealLog",
      "/api/dashboard/meal-logs",
      "Unable to save meal log.",
      { mealLogForm: mealForm, setMealLogForm: () => {} }
    ]
  ])("%s", (_label, method, path, fallbackMessage, extraDeps) => {
    test("posts to its own endpoint", async () => {
      const { deps, handlers } = buildDeps(extraDeps);
      await handlers[method](submitEvent());

      await queuedRequest(deps.queueOptimisticLogCommit)();

      const [url, options] = deps.apiFetch.mock.calls.at(-1);
      expect(url).toBe(path);
      expect(options.method).toBe("POST");
    });

    test("surfaces the server's own refusal", async () => {
      const { deps, handlers } = buildDeps({
        ...extraDeps,
        apiFetch: vi.fn(async () => jsonResponse({ error: "Daily limit reached." }, false))
      });
      await handlers[method](submitEvent());

      await expect(queuedRequest(deps.queueOptimisticLogCommit)()).rejects.toThrow(
        "Daily limit reached."
      );
    });

    test("falls back to its own message when the refusal carries none", async () => {
      // Every write action in this file has its own default. A shared or
      // missing one tells the visitor the wrong thing failed.
      const { deps, handlers } = buildDeps({
        ...extraDeps,
        apiFetch: vi.fn(async () => jsonResponse({}, false))
      });
      await handlers[method](submitEvent());

      await expect(queuedRequest(deps.queueOptimisticLogCommit)()).rejects.toThrow(fallbackMessage);
    });

    test("falls back when the refusal body cannot be read at all", async () => {
      // A proxy timeout answers with an error status and an HTML body.
      const { deps, handlers } = buildDeps({
        ...extraDeps,
        apiFetch: vi.fn(async () => ({
          ok: false,
          json: async () => {
            throw new Error("not json");
          }
        }))
      });
      await handlers[method](submitEvent());

      await expect(queuedRequest(deps.queueOptimisticLogCommit)()).rejects.toThrow(fallbackMessage);
    });

    test("returns the server's payload on success", async () => {
      const dashboard = { workouts: [] };
      const { deps, handlers } = buildDeps({
        ...extraDeps,
        apiFetch: vi.fn(async () => jsonResponse({ dashboard }))
      });
      await handlers[method](submitEvent());

      await expect(queuedRequest(deps.queueOptimisticLogCommit)()).resolves.toEqual({
        dashboard
      });
    });
  });

  test("a meal with no name is queued as an empty one rather than as undefined", () => {
    // The optimistic row is rendered before the server answers, and
    // "undefined" would appear in the list beside the date.
    // The field must be *absent*, not empty: an empty string is already ""
    // and cannot tell the fallback from its absence.
    const { name: _name, notes: _notes, ...withoutText } = mealForm;
    const { deps, handlers } = buildDeps({
      mealLogForm: withoutText,
      setMealLogForm: () => {}
    });

    handlers.submitMealLog(submitEvent());

    const { item } = deps.queueOptimisticLogCommit.mock.calls.at(-1)[0];
    expect(item.name).toBe("");
    expect(item.notes).toBe("");
  });

  test("a meal with no macros is queued as absent rather than as zero", () => {
    // A logged 0g of protein and an unrecorded one are different claims.
    const { deps, handlers } = buildDeps({
      mealLogForm: { ...mealForm, calories: "", proteinG: "", carbsG: "", fatG: "" },
      setMealLogForm: () => {}
    });

    handlers.submitMealLog(submitEvent());

    const { item } = deps.queueOptimisticLogCommit.mock.calls.at(-1)[0];
    expect(item.calories).toBeNull();
    expect(item.proteinG).toBeNull();
  });

  test("a meal with no type is queued as other", () => {
    const { deps, handlers } = buildDeps({
      mealLogForm: { ...mealForm, mealType: "" },
      setMealLogForm: () => {}
    });

    handlers.submitMealLog(submitEvent());

    expect(deps.queueOptimisticLogCommit.mock.calls.at(-1)[0].item.mealType).toBe("other");
  });
});

// Each direct write action carries its own default message for a refusal that
// carries none, and its own default for a thrown error with no message. The
// tests above supply a message every time, so only the server's own wording was
// ever seen.
describe("the direct write actions' fallback messages", () => {
  const goalForm = { targetWeight: "170", targetCalories: "2200", weeklyWorkouts: "4" };
  const progressForm = { date: "2026-03-01", weightLb: "170" };

  const cases = [
    ["submitGoals", "Unable to save goals.", { goalForm, setGoalForm: () => {} }, [submitEvent()]],
    [
      "submitProgressMetric",
      "Unable to save progress metric.",
      { progressForm, setProgressForm: () => {} },
      [submitEvent()]
    ],
    ["saveExerciseToPlan", "Unable to save exercise.", {}, [{ name: "Row" }]],
    ["removeSavedExercise", "Unable to remove saved exercise.", {}, ["entry-1"]]
  ];

  test.each(cases)(
    "%s uses its own default when the refusal carries none",
    async (method, fallbackMessage, extraDeps, args) => {
      const { deps, handlers } = buildDeps({
        ...extraDeps,
        apiFetch: vi.fn(async () => jsonResponse({}, false))
      });

      await handlers[method](...args);

      expect(deps.showDashboardToast).toHaveBeenCalledWith(fallbackMessage, "error");
      expect(deps.setDashError).toHaveBeenCalledWith(fallbackMessage);
    }
  );

  test.each(cases)(
    "%s uses it again when the refusal body is unreadable",
    async (method, fallbackMessage, extraDeps, args) => {
      const { deps, handlers } = buildDeps({
        ...extraDeps,
        apiFetch: vi.fn(async () => ({
          ok: false,
          json: async () => {
            throw new Error("not json");
          }
        }))
      });

      await handlers[method](...args);

      expect(deps.showDashboardToast).toHaveBeenCalledWith(fallbackMessage, "error");
    }
  );

  test.each(cases)(
    "%s uses it when the request throws without a message",
    async (method, fallbackMessage, extraDeps, args) => {
      // An aborted request rejects with an empty message, and an empty toast
      // tells the visitor nothing at all.
      const { deps, handlers } = buildDeps({
        ...extraDeps,
        apiFetch: vi.fn(async () => {
          throw new Error("");
        })
      });

      await handlers[method](...args);

      expect(deps.showDashboardToast).toHaveBeenCalledWith(fallbackMessage, "error");
    }
  );
});

describe("submitProfile", () => {
  test("posts the mapped profile and refreshes the signed-in user", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () =>
        jsonResponse({ profile: { firstName: "Sam", lastName: "Fields", heightCm: 178 } })
      ),
      setUser: vi.fn()
    });

    await handlers.submitProfile({ name: "Sam Fields", heightCm: "178" });

    const [url, options] = deps.apiFetch.mock.calls[0];
    expect(url).toBe("/api/profile");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toMatchObject({ firstName: "Sam", lastName: "Fields" });
    expect(deps.setUser).toHaveBeenCalled();
  });

  // The handler is where units reach the mapper. Drop them and a user weighing
  // 170 lb is stored as 170 kg -- so these assert the converted value, not just
  // that a request was made.
  test("falls back to the app's active units when the caller passes none", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ profile: {} })),
      setUser: vi.fn(),
      weightUnit: "lb",
      heightUnit: "ft"
    });

    await handlers.submitProfile({ weight: "170", heightFeet: "5", heightInches: "10" });

    expect(JSON.parse(deps.apiFetch.mock.calls[0][1].body)).toMatchObject({
      weightKg: 77,
      heightCm: 178
    });
  });

  // Settings renders in the visitor's locale units, which are not the home
  // flow's toggles. If the caller's units were ignored in favour of the
  // app-level ones, this stores 170 lb as 170 kg.
  test("uses the caller's units over the app's when given them", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ profile: {} })),
      setUser: vi.fn(),
      weightUnit: "kg",
      heightUnit: "cm"
    });

    await handlers.submitProfile({ weight: "170" }, { weightUnit: "lb", heightUnit: "ft" });

    expect(JSON.parse(deps.apiFetch.mock.calls[0][1].body)).toMatchObject({ weightKg: 77 });
  });

  // SettingsView closes the edit form on `ok`. Without this the save succeeds,
  // the toast appears, and the form stays open as though it had failed.
  test("reports success so the caller can close the form", async () => {
    const { handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ profile: {} })),
      setUser: vi.fn()
    });

    await expect(handlers.submitProfile({})).resolves.toEqual({ ok: true });
  });

  // The read-only rows in Settings render from user.profile, not from personal,
  // so leaving the user untouched shows the visitor their OLD values straight
  // after a save that succeeded.
  test("refreshes the signed-in user so the read rows are not stale", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ profile: { name: "Sam Fields" } })),
      setUser: vi.fn()
    });

    await handlers.submitProfile({});

    const update = deps.setUser.mock.calls[0][0];
    expect(update({ email: "a@b.c", profile: { name: "Jordan" } })).toEqual({
      email: "a@b.c",
      profile: { name: "Sam Fields" }
    });
  });

  // Nobody signed in means nothing to refresh -- the updater must not conjure
  // a user object out of a profile response.
  test("leaves a signed-out visitor signed out", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ profile: {} })),
      setUser: vi.fn()
    });

    await handlers.submitProfile({});

    expect(deps.setUser.mock.calls[0][0](null)).toBeNull();
  });

  test("surfaces a server error and leaves the signed-in user alone", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () =>
        jsonResponse({ error: "Age must be between 10 and 120." }, false)
      ),
      setUser: vi.fn()
    });

    const result = await handlers.submitProfile({ age: "3" });

    expect(result).toMatchObject({ ok: false, error: "Age must be between 10 and 120." });
    expect(deps.setUser).not.toHaveBeenCalled();
  });
});
