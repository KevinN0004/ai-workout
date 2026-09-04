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
