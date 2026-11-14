import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAppEventHandlers } from "../events";
import { defaultPersonalForm, defaultSignupProfileForm } from "../constants";
import { newCard } from "../exerciseSets";
import { createDefaultPlannerForm } from "../requestBodies";
import { toCmFromFeetInches, toFeetInchesFromCm, toKg } from "../units";
import { logSet, sessionFromPlanDay } from "../workoutSession";

// The exact JSON each handler sends, as a string, so key order is pinned as
// well as every value. Each was pinned against the inline code before its body
// moved to requestBodies.js (roadmap D1 phase 2), and the move kept them.

const jsonResponse = (body, ok = true) => ({ ok, json: async () => body });

const submitEvent = () => ({ preventDefault: vi.fn() });

// The body of the nth request the handlers sent.
const sentBody = (call = 0) => deps.apiFetch.mock.calls[call][1].body;

let deps;

const build = (overrides = {}) => createAppEventHandlers({ ...deps, ...overrides });

beforeEach(() => {
  deps = {
    apiFetch: vi.fn(async () => jsonResponse({ user: { id: "u-1" }, profile: {} })),
    go: vi.fn(),
    toCmFromFeetInches,
    toFeetInchesFromCm,
    toKg,
    heightUnit: "cm",
    weightUnit: "kg",
    authMode: "login",
    authForm: { email: "a@b.co", password: "password1" },
    authAutoSignIn: false,
    signupProfileForm: { ...defaultSignupProfileForm },
    signupHeightUnit: "cm",
    signupWeightUnit: "kg",
    setAuthForm: vi.fn(),
    setAuthLoading: vi.fn(),
    setAuthError: vi.fn(),
    setSignupProfileForm: vi.fn(),
    setSignupHeightUnit: vi.fn(),
    setSignupWeightUnit: vi.fn(),
    setUser: vi.fn(),
    setDashError: vi.fn(),
    showDashboardToast: vi.fn(),
    captureAccount: () => () => true,
    flushOptimisticOperations: vi.fn(async () => {}),
    clearOptimisticOperations: vi.fn(),
    clearDashboardDataState: vi.fn(),
    clearDashboardToast: vi.fn(),
    resetPersonalFlow: vi.fn()
  };
});

describe("account bodies", () => {
  test("sign-up in feet and pounds sends the profile in cm and kg", async () => {
    await build({
      authMode: "signup",
      signupProfileForm: {
        ...defaultSignupProfileForm,
        firstName: "Sam",
        heightFeet: "5",
        heightInches: "10",
        weight: "170"
      },
      signupHeightUnit: "ft",
      signupWeightUnit: "lb"
    }).onAuthSubmit(submitEvent());

    expect(sentBody()).toBe(
      '{"email":"a@b.co","password":"password1","profile":{"firstName":"Sam","lastName":"",' +
        '"age":"","heightCm":"178","heightFeet":"5","heightInches":"10","weight":"170",' +
        '"weightKg":"77","sex":"","bodyFat":"","activity":"Moderate","notes":""}}'
    );
  });

  test("sign-up in cm and kg falls back to weightKg when weight is blank", async () => {
    await build({
      authMode: "signup",
      signupProfileForm: { ...defaultSignupProfileForm, heightCm: "180", weightKg: "80" }
    }).onAuthSubmit(submitEvent());

    expect(sentBody()).toBe(
      '{"email":"a@b.co","password":"password1","profile":{"firstName":"","lastName":"",' +
        '"age":"","heightCm":"180","heightFeet":"","heightInches":"","weight":"",' +
        '"weightKg":"80","sex":"","bodyFat":"","activity":"Moderate","notes":""}}'
    );
  });

  test.each([
    [true, '{"email":"a@b.co","password":"password1","rememberMe":true}'],
    [false, '{"email":"a@b.co","password":"password1","rememberMe":false}']
  ])("sign-in with keep-me-signed-in %s", async (authAutoSignIn, expected) => {
    await build({ authAutoSignIn }).onAuthSubmit(submitEvent());

    expect(sentBody()).toBe(expected);
  });

  test("a password change", async () => {
    await build().changePassword({ currentPassword: "old-pass", newPassword: "new-pass-123" });

    expect(sentBody()).toBe('{"currentPassword":"old-pass","newPassword":"new-pass-123"}');
  });

  test("an account delete", async () => {
    await build().deleteAccount("old-pass");

    expect(sentBody()).toBe('{"password":"old-pass"}');
  });

  test("a profile save in cm and kg", async () => {
    const draft = { ...defaultPersonalForm, name: "Sam Fields", age: "30", heightCm: "180" };
    await build().submitProfile({ ...draft, weight: "80" }, { heightUnit: "cm", weightUnit: "kg" });

    expect(sentBody()).toBe(
      '{"firstName":"Sam","lastName":"Fields","name":"Sam Fields","age":30,"heightCm":180,' +
        '"weightKg":80,"sex":"","bodyFat":null,"activity":"Moderate","notes":"","sleep":"",' +
        '"timeline":"","experience":"","nutrition":"","cardio":"","goal":"","trainingDays":[]}'
    );
  });

  test("a profile save in feet and pounds", async () => {
    const draft = { ...defaultPersonalForm, name: "Sam", heightFeet: "5", heightInches: "10" };
    await build().submitProfile(
      { ...draft, weight: "170" },
      { heightUnit: "ft", weightUnit: "lb" }
    );

    expect(sentBody()).toBe(
      '{"firstName":"Sam","lastName":"","name":"Sam","age":null,"heightCm":178,' +
        '"weightKg":77,"sex":"","bodyFat":null,"activity":"Moderate","notes":"","sleep":"",' +
        '"timeline":"","experience":"","nutrition":"","cardio":"","goal":"","trainingDays":[]}'
    );
  });
});

// The logs reach the outbox, which stores a body and replays it later, so a
// body queued before a deploy must replay unchanged after it. The clock and the
// replay key are fixed so each body is one exact string.
describe("log bodies", () => {
  const ID = "00000000-0000-4000-8000-000000000001";
  const today = "2026-03-01";

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 1, 12, 0, 0));
    vi.spyOn(crypto, "randomUUID").mockReturnValue(ID);
    deps.queueOptimisticLogCommit = vi.fn();
    deps.setWorkoutForm = vi.fn();
    deps.setWorkoutModalOpen = vi.fn();
    deps.setCalorieForm = vi.fn();
    deps.setMealLogForm = vi.fn();
    deps.setProgressForm = vi.fn();
    deps.setDashboard = vi.fn();
    deps.apiFetch = vi.fn(async () => jsonResponse({ dashboard: {} }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Runs the queued commit's request and answers the body it sent, after
  // checking the outbox holds that same body for a replay.
  const queuedBody = async () => {
    const commit = deps.queueOptimisticLogCommit.mock.calls[0][0];
    await commit.request();
    expect(JSON.stringify(commit.outbox.body)).toBe(sentBody());
    return sentBody();
  };

  const squatCard = () => {
    const card = newCard({ name: "Squat" });
    return { ...card, sets: [{ ...card.sets[0], amount: "5", rpe: "8" }] };
  };
  const workoutForm = {
    date: today,
    focus: "Push",
    duration: "45",
    notes: "felt good",
    exerciseSets: [squatCard()]
  };
  const SQUAT_SETS =
    '"exercises":["Squat"],"exerciseSets":[{"name":"Squat","sets":[{"reps":5,"seconds":null,' +
    '"loadKg":null,"rpe":8}]}]';

  test("a workout from the form, with no plan day", async () => {
    await build({ workoutForm }).submitWorkout(submitEvent());

    expect(await queuedBody()).toBe(
      `{"id":"${ID}","date":"${today}","focus":"Push","duration":"45","notes":"felt good",` +
        `${SQUAT_SETS}}`
    );
  });

  test("a workout from the form, logged against a plan day", async () => {
    await build({
      workoutForm: { ...workoutForm, planId: "plan-1", planDayIndex: 2 }
    }).submitWorkout(submitEvent());

    expect(await queuedBody()).toBe(
      `{"id":"${ID}","date":"${today}","focus":"Push","duration":"45","notes":"felt good",` +
        `${SQUAT_SETS},"planId":"plan-1","planDayIndex":2}`
    );
  });

  test("a finished in-gym session", async () => {
    const NOW = Date.UTC(2026, 10, 9, 17, 0, 0);
    vi.setSystemTime(NOW + 40 * 60 * 1000);
    const started = sessionFromPlanDay({
      day: { index: 1, weekday: "Tuesday", title: "Lower A", lines: [], prescriptions: [] },
      cards: [newCard({ name: "Squat", targets: { amount: "5", rpe: "", load: "100" } })],
      planId: "plan-1",
      system: "metric",
      now: NOW
    });
    const session = logSet(started, { amount: 5, loadKg: 100, rpe: 8 }, NOW + 60 * 1000);

    build({ user: { email: "person@example.com" } }).finishSession(session);

    expect(await queuedBody()).toBe(
      `{"id":"${session.clientId}","date":"${session.date}","focus":"Lower A","duration":40,` +
        '"notes":"","exercises":["Squat"],"exerciseSets":[{"name":"Squat","sets":[{"reps":5,' +
        '"seconds":null,"loadKg":100,"rpe":8}]}],"planId":"plan-1","planDayIndex":1}'
    );
  });

  test("a calorie entry", async () => {
    await build({ calorieForm: { calories: "2200" } }).submitCalories(submitEvent());

    expect(await queuedBody()).toBe(`{"calories":"2200","id":"${ID}","date":"${today}"}`);
  });

  test("a meal, filled in", async () => {
    const mealLogForm = {
      date: today,
      mealType: "lunch",
      name: "Rice bowl",
      calories: "600",
      proteinG: "30",
      carbsG: "80",
      fatG: "12",
      notes: "post-run"
    };
    await build({ mealLogForm }).submitMealLog(submitEvent());

    expect(await queuedBody()).toBe(
      `{"date":"${today}","mealType":"lunch","name":"Rice bowl","calories":"600",` +
        `"proteinG":"30","carbsG":"80","fatG":"12","notes":"post-run","id":"${ID}"}`
    );
  });

  test("a meal with only its name", async () => {
    const mealLogForm = {
      date: today,
      mealType: "breakfast",
      name: "Toast",
      calories: "",
      proteinG: "",
      carbsG: "",
      fatG: "",
      notes: ""
    };
    await build({ mealLogForm }).submitMealLog(submitEvent());

    expect(await queuedBody()).toBe(
      `{"date":"${today}","mealType":"breakfast","name":"Toast","calories":"","proteinG":"",` +
        `"carbsG":"","fatG":"","notes":"","id":"${ID}"}`
    );
  });

  test("a progress metric, and the blank form it resets to", async () => {
    const progressForm = {
      date: today,
      weightLb: "170",
      bodyFatPct: "",
      waistCm: "81",
      restingHr: "",
      notes: ""
    };
    await build({ progressForm }).submitProgressMetric(submitEvent());

    expect(sentBody()).toBe(
      `{"date":"${today}","weightLb":"170","bodyFatPct":"","waistCm":"81","restingHr":"",` +
        '"notes":""}'
    );
    expect(JSON.stringify(deps.setProgressForm.mock.calls[0][0])).toBe(
      `{"date":"${today}","weightLb":"","bodyFatPct":"","waistCm":"","restingHr":"","notes":""}`
    );
  });
});

describe("plan and dashboard bodies", () => {
  beforeEach(() => {
    deps.setLoading = vi.fn();
    deps.setError = vi.fn();
    deps.setResult = vi.fn();
    deps.setResultPayload = vi.fn();
    deps.setDashboard = vi.fn();
    deps.apiFetch = vi.fn(async () => jsonResponse({ dashboard: {} }));
  });

  test("the planner form, sent whole to generate a plan", async () => {
    await build({ form: createDefaultPlannerForm("Mobility") }).onSubmit(submitEvent());

    expect(sentBody()).toBe(
      '{"goal":"Mobility","equipment":[],"duration":"45","level":"Intermediate",' +
        '"injuries":"None","days":"3","focuses":[],"environment":"Home","health":' +
        '{"condition":false,"symptoms":false,"supervised":false,"pregnant":false}}'
    );
  });

  test("the goals form, sent whole", async () => {
    const goalForm = { targetWeight: "", targetCalories: "2200", weeklyWorkouts: "3" };
    await build({ goalForm }).submitGoals(submitEvent());

    expect(sentBody()).toBe('{"targetWeight":"","targetCalories":"2200","weeklyWorkouts":"3"}');
  });

  test("a saved exercise is sent as the view built it, and none as {}", async () => {
    await build().saveExerciseToPlan({ exerciseId: 7, name: "Row" });
    await build().saveExerciseToPlan(undefined);

    expect(sentBody(0)).toBe('{"exerciseId":7,"name":"Row"}');
    expect(sentBody(1)).toBe("{}");
  });
});
