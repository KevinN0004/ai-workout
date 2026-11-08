import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import PlansView from "../PlansView";
import { markUnanswered } from "../../../../app/connection";
import { buildPlanDayPrefill } from "../../planUtils";

// Prop-driven throughout -- no fetching -- so this drives the parts a visitor
// actually operates: the two empty states, the three callbacks the dashboard
// hands in, and the saved-exercise paging.

const savedExercise = (id) => ({
  id,
  name: `Exercise ${id}`,
  muscles: ["Biceps"],
  equipment: ["Dumbbell"]
});

const renderView = (props = {}) => {
  const handlers = {
    openPlannerFromProfile: vi.fn(),
    onRemoveSavedExercise: vi.fn(),
    onOpenGuides: vi.fn()
  };
  const utils = render(
    <PlansView
      weekDays={[{ key: "monday", label: "Monday" }]}
      latestPlanByWeekday={{}}
      dashboard={{ plans: [], goals: {}, savedExercises: [] }}
      fallbackPlan={null}
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers };
};

const withSaved = (count) => ({
  dashboard: {
    plans: [],
    goals: {},
    savedExercises: Array.from({ length: count }, (_, i) => savedExercise(String(i + 1)))
  }
});

describe("PlansView", () => {
  describe("empty states", () => {
    test("says so when there is no weekly plan", () => {
      renderView();
      expect(screen.getByText("No weekly workout plan yet")).toBeInTheDocument();
    });

    test("the no-plan card goes away once a plan exists", () => {
      renderView({
        weekDays: [{ key: "monday", label: "Monday" }],
        latestPlanByWeekday: { monday: ["Squat 5x5"] }
      });

      expect(screen.queryByText("No weekly workout plan yet")).toBeNull();
      expect(screen.queryByText("Create weekly plan")).toBeNull();
    });

    test("says so when nothing has been saved", () => {
      renderView();
      expect(screen.getByText("No saved exercises yet")).toBeInTheDocument();
    });

    test("treats a non-array savedExercises as empty rather than throwing", () => {
      // The server has returned null for collection fields before.
      renderView({ dashboard: { plans: [], goals: {}, savedExercises: null } });
      expect(screen.getByText("No saved exercises yet")).toBeInTheDocument();
    });
  });

  describe("the handlers the dashboard passes in", () => {
    test("the header's update button opens the planner", () => {
      const { openPlannerFromProfile } = renderView();
      fireEvent.click(screen.getByText("Update plan"));
      expect(openPlannerFromProfile).toHaveBeenCalled();
    });

    test("the empty state's own button opens the planner too", () => {
      // Two separate call sites reach the same handler; a visitor with no plan
      // only ever sees this one.
      const { openPlannerFromProfile } = renderView();
      fireEvent.click(screen.getByText("Create weekly plan"));
      expect(openPlannerFromProfile).toHaveBeenCalled();
    });

    test("the guides button opens the guides", () => {
      const { onOpenGuides } = renderView();
      fireEvent.click(screen.getByText("Open guides"));
      expect(onOpenGuides).toHaveBeenCalled();
    });

    test("removing a saved exercise reports its id", () => {
      const { onRemoveSavedExercise } = renderView(withSaved(1));
      fireEvent.click(screen.getByText("Remove"));
      // The id, not the index -- the dashboard deletes by id.
      expect(onRemoveSavedExercise).toHaveBeenCalledWith("1");
    });

    test("a missing remove handler does not break the button", () => {
      renderView({ ...withSaved(1), onRemoveSavedExercise: undefined });
      expect(() => fireEvent.click(screen.getByText("Remove"))).not.toThrow();
    });
  });

  describe("saved exercise paging", () => {
    test("shows everything when it fits on one page", () => {
      renderView(withSaved(3));
      expect(screen.getByText("Exercise 3")).toBeInTheDocument();
      expect(screen.queryByText(/more exercise/i)).toBeNull();
    });

    test("holds back the overflow and offers to show more", () => {
      renderView(withSaved(30));
      expect(screen.getByText("Exercise 24")).toBeInTheDocument();
      expect(screen.queryByText("Exercise 25")).toBeNull();
    });

    test("counts a single overflow item in the singular", () => {
      // 25 saved against a page size of 24 leaves exactly one.
      renderView(withSaved(25));
      expect(screen.getByText(/1 more exercise\b/)).toBeInTheDocument();
      expect(screen.queryByText(/1 more exercises/)).toBeNull();
    });

    test("counts several in the plural", () => {
      renderView(withSaved(26));
      expect(screen.getByText(/2 more exercises/)).toBeInTheDocument();
    });

    test("showing more reveals the next page", () => {
      renderView(withSaved(30));
      expect(screen.queryByText("Exercise 25")).toBeNull();

      fireEvent.click(screen.getByText(/show more/i));

      expect(screen.getByText("Exercise 25")).toBeInTheDocument();
      expect(screen.queryByText(/more exercise/i)).toBeNull();
    });

    test("a new saved list collapses the paging back to one page", () => {
      // Removing an exercise re-renders with a shorter list; keeping the
      // expanded count would leave a Show more button with nothing behind it.
      const { rerender } = renderView(withSaved(30));
      fireEvent.click(screen.getByText(/show more/i));
      expect(screen.getByText("Exercise 25")).toBeInTheDocument();

      rerender(
        <PlansView
          weekDays={[{ key: "monday", label: "Monday" }]}
          latestPlanByWeekday={{}}
          {...withSaved(29)}
          fallbackPlan={null}
          openPlannerFromProfile={vi.fn()}
          onRemoveSavedExercise={vi.fn()}
          onOpenGuides={vi.fn()}
        />
      );

      expect(screen.queryByText("Exercise 25")).toBeNull();
    });
  });

  // Everything above renders an empty week, so the daily guidance was always
  // the recovery-day text and the rest of the classifier went untested.

  describe("the daily focus tip it picks", () => {
    const WEEK = [{ key: "monday", label: "Monday" }];

    const tipFor = (lines) => {
      const { unmount } = renderView({
        weekDays: WEEK,
        latestPlanByWeekday: { monday: lines }
      });
      const text = document.body.textContent;
      unmount();
      return text;
    };

    test("a rest day gets recovery guidance", () => {
      expect(tipFor([])).toContain("Recovery day:");
    });

    test.each([
      ["push", "Push focus:"],
      ["chest press", "Push focus:"],
      ["shoulder raise", "Push focus:"],
      ["triceps dip", "Push focus:"]
    ])("%s is read as a push day", (line, expected) => {
      expect(tipFor([line])).toContain(expected);
    });

    test.each([
      ["pull ups", "Pull focus:"],
      ["back extension", "Pull focus:"],
      ["biceps curl", "Pull focus:"],
      ["barbell row", "Pull focus:"]
    ])("%s is read as a pull day", (line, expected) => {
      expect(tipFor([line])).toContain(expected);
    });

    test.each([
      ["leg day", "Leg focus:"],
      ["quad extension", "Leg focus:"],
      ["hamstring curl", "Leg focus:"],
      ["glute bridge", "Leg focus:"],
      ["barbell squat", "Leg focus:"],
      ["deadlift", "Leg focus:"],
      ["walking lunge", "Leg focus:"]
    ])("%s is read as a leg day", (line, expected) => {
      expect(tipFor([line])).toContain(expected);
    });

    test.each([
      ["hiit intervals", "Conditioning focus:"],
      ["conditioning circuit", "Conditioning focus:"],
      ["cardio session", "Conditioning focus:"],
      ["easy run", "Conditioning focus:"],
      ["cycle 30 min", "Conditioning focus:"]
    ])("%s is read as a conditioning day", (line, expected) => {
      expect(tipFor([line])).toContain(expected);
    });

    test("anything else gets the general session tip", () => {
      expect(tipFor(["Mobility flow"])).toContain("Session focus:");
    });

    test("a back squat is read as a pull day, because of the word back", () => {
      // Pinning what it does, not what it should do. The pull check tests for
      // "back" and runs before the leg check, so a back squat session is given
      // pull guidance -- "drive elbows back, match pull volume to push volume"
      // -- for what is a leg day. Worth knowing before relying on these cues.
      expect(tipFor(["Back squat 5x5"])).toContain("Pull focus:");
    });

    test("the classifier is case-insensitive", () => {
      // Plan text comes back from Gemini with inconsistent casing.
      expect(tipFor(["BARBELL ROW"])).toContain("Pull focus:");
    });

    test("push is checked before pull, so a mixed line resolves to one tip", () => {
      // "Push and pull superset" matches both lists. The order decides, and a
      // day showing two contradictory tips is worse than either one.
      const text = tipFor(["Push and pull superset"]);

      expect(text).toContain("Push focus:");
      expect(text).not.toContain("Pull focus:");
    });

    test("every line on the day is considered, not just the first", () => {
      expect(tipFor(["Warmup", "Barbell row"])).toContain("Pull focus:");
    });
  });

  describe("the weekly tips", () => {
    const FULL_WEEK = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday"
    ].map((key) => ({ key, label: key }));

    test("count the recovery days left in the week", () => {
      const plan = { monday: ["Squat"], tuesday: ["Row"] };
      renderView({ weekDays: FULL_WEEK, latestPlanByWeekday: plan });

      expect(screen.getByText(/Keep at least 5 recovery days this week\./)).toBeInTheDocument();
    });

    test("say one day in the singular", () => {
      const plan = Object.fromEntries(FULL_WEEK.slice(0, 6).map(({ key }) => [key, ["Squat"]]));
      renderView({ weekDays: FULL_WEEK, latestPlanByWeekday: plan });

      expect(screen.getByText(/Keep at least 1 recovery day this week\./)).toBeInTheDocument();
    });

    test("still ask for one when every day is a training day", () => {
      // Zero would read as permission to train seven days a week.
      const plan = Object.fromEntries(FULL_WEEK.map(({ key }) => [key, ["Squat"]]));
      renderView({ weekDays: FULL_WEEK, latestPlanByWeekday: plan });

      expect(screen.getByText(/Keep at least 1 recovery day this week\./)).toBeInTheDocument();
    });
  });

  describe("the day detail", () => {
    const WEEK = [
      { key: "monday", label: "Monday" },
      { key: "tuesday", label: "Tuesday" }
    ];

    // The day label appears on the workout card, the meal card and the tips
    // line, so the click has to be scoped to the workout week row.
    const dayCard = (label) => {
      const row = Array.from(document.querySelectorAll(".plan-row")).find((el) =>
        el.textContent.startsWith("Workout week")
      );
      return Array.from(row.querySelectorAll(".hub-card-button")).find((el) =>
        el.textContent.includes(label)
      );
    };

    const openMonday = (props = {}) => {
      const utils = renderView({
        weekDays: WEEK,
        latestPlanByWeekday: { monday: ["Back squat 5x5"] },
        ...props
      });
      fireEvent.click(dayCard("Monday"));
      return utils;
    };

    test("opens on the day the visitor clicked", () => {
      openMonday();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("shows that day's workout lines", () => {
      openMonday();
      const dialog = screen.getByRole("dialog");

      expect(within(dialog).getByText("Back squat 5x5")).toBeInTheDocument();
    });

    test("Escape closes it", () => {
      openMonday();
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });

      expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("another key does not", () => {
      openMonday();
      fireEvent.keyDown(window, { key: "Enter" });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("the listener is gone once it closes, so a later Escape is inert", () => {
      openMonday();
      fireEvent.keyDown(window, { key: "Escape" });

      expect(() => fireEvent.keyDown(window, { key: "Escape" })).not.toThrow();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("removes the very listener it added, not a fresh reference", () => {
      // Nothing in the DOM distinguishes a leaked keydown listener here --
      // every copy closes the same already-closed detail -- so the teardown is
      // asserted directly. Removing a different function reference is the
      // usual way this breaks, and it fails silently.
      const added = vi.spyOn(window, "addEventListener");
      const removed = vi.spyOn(window, "removeEventListener");
      const keydownFns = (spy) =>
        spy.mock.calls.filter(([type]) => type === "keydown").map(([, fn]) => fn);

      try {
        openMonday();
        const listener = keydownFns(added).at(-1);
        expect(listener).toBeTypeOf("function");

        fireEvent.keyDown(window, { key: "Escape" });

        expect(keydownFns(removed)).toContain(listener);
      } finally {
        added.mockRestore();
        removed.mockRestore();
      }
    });

    test("a day with no plan opens with no workout lines rather than failing", () => {
      renderView({ weekDays: WEEK, latestPlanByWeekday: { monday: ["Squat"] } });

      fireEvent.click(dayCard("Tuesday"));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});

// A day of the newest plan, saved with its structure, can be logged against:
// the day details pre-fill the Log workout form and link it to that day, and
// the week marks a day once a session links to it.
describe("logging a plan day", () => {
  const WEEK = [
    { key: "Monday", label: "Mon" },
    { key: "Tuesday", label: "Tue" }
  ];
  const mondayDay = {
    index: 0,
    weekday: "Monday",
    title: "Monday",
    lines: ["Main lifts:", "- Back Squats: 3 x 5 (Rest: 3 mins)", "- Plank: 3 x 30s"]
  };
  const tuesdayDay = { index: 1, weekday: "Tuesday", title: "Tuesday", lines: ["Rest Day"] };
  const savedPlan = (overrides = {}) => ({
    id: "plan-1",
    goal: "Build lean strength and energy",
    plan: "Monday\nMain lifts:",
    payload: { version: 1, days: [mondayDay, tuesdayDay], notes: [] },
    ...overrides
  });

  const renderWithPlan = ({ plan = savedPlan(), workoutSessions = [] } = {}) => {
    const setWorkoutForm = vi.fn();
    const setWorkoutModalOpen = vi.fn();
    const onStartSession = vi.fn();
    const utils = renderView({
      weekDays: WEEK,
      latestPlanByWeekday: { Monday: mondayDay.lines, Tuesday: tuesdayDay.lines },
      dashboard: { plans: [plan], goals: {}, savedExercises: [], workoutSessions },
      setWorkoutForm,
      setWorkoutModalOpen,
      onStartSession
    });
    return { ...utils, setWorkoutForm, setWorkoutModalOpen, onStartSession };
  };

  // Roadmap B6: the day's session, built from the same cards the Log workout
  // form opens with, and linked to the plan day.
  test("Start workout starts an in-gym session from the day", () => {
    const { onStartSession } = renderWithPlan();
    openDay("Mon");
    expect(screen.getByRole("button", { name: "Log this workout" })).toHaveClass("ghost");

    fireEvent.click(screen.getByRole("button", { name: "Start workout" }));

    const session = onStartSession.mock.calls[0][0];
    expect(session).toMatchObject({ title: "Monday", planId: "plan-1", planDayIndex: 0 });
    expect(session.exercises.map((exercise) => exercise.name)).toEqual(
      buildPlanDayPrefill(mondayDay).exerciseSets.map((card) => card.name)
    );
    // The day's details close, so App's question about an open session is the
    // only modal on screen.
    expect(screen.queryByRole("button", { name: "Log this workout" })).toBeNull();
  });

  test("offers no Start workout where it offers no log", () => {
    renderWithPlan({ plan: savedPlan({ payload: null }) });
    openDay("Mon");

    expect(screen.queryByRole("button", { name: "Start workout" })).toBeNull();
  });
  // The workout week's cards: the meals week has a card per day as well.
  const workoutWeek = () =>
    within(screen.getByRole("heading", { name: "Workout week" }).closest("section"));
  const card = (label) => workoutWeek().getByRole("button", { name: new RegExp(`^${label}`) });
  const openDay = (label) => fireEvent.click(card(label));

  test("fills the Log workout form from the day, links it, and opens it", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 11, 9, 0, 0));
    const { setWorkoutForm, setWorkoutModalOpen } = renderWithPlan();
    openDay("Mon");

    fireEvent.click(screen.getByRole("button", { name: "Log this workout" }));

    // Each card carries a fresh key, so the cards are compared by what they
    // hold rather than by the object a second pre-fill would build.
    const { exerciseSets, ...form } = setWorkoutForm.mock.calls[0][0];
    const { exerciseSets: expectedCards, ...prefill } = buildPlanDayPrefill(mondayDay);
    expect(form).toEqual({
      date: "2026-09-11",
      duration: "",
      ...prefill,
      planId: "plan-1",
      planDayIndex: 0,
      planDayLabel: "Monday"
    });
    expect(exerciseSets.map((card) => card.name)).toEqual(expectedCards.map((card) => card.name));
    expect(exerciseSets.length).toBeGreaterThan(0);
    expect(setWorkoutModalOpen).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    vi.useRealTimers();
  });

  test.each([
    ["the plan was saved without a structure", savedPlan({ payload: null })],
    ["the plan's structure is not one this version reads", savedPlan({ payload: {} })]
  ])("offers no log when %s", (_label, plan) => {
    renderWithPlan({ plan });
    openDay("Mon");

    expect(screen.queryByRole("button", { name: "Log this workout" })).toBeNull();
  });

  test("offers no log for a weekday the saved plan does not have", () => {
    renderWithPlan({
      plan: savedPlan({ payload: { version: 1, days: [mondayDay], notes: [] } })
    });
    openDay("Tue");

    expect(screen.queryByRole("button", { name: "Log this workout" })).toBeNull();
  });

  test("marks a day once a session links to it", () => {
    renderWithPlan({ workoutSessions: [{ id: "w1", planId: "plan-1", planDayIndex: 0 }] });

    expect(within(card("Mon")).getByText("Logged")).toBeInTheDocument();
    expect(within(card("Tue")).queryByText("Logged")).toBeNull();
  });

  test.each([
    ["another plan's day", { id: "w1", planId: "plan-0", planDayIndex: 0 }],
    ["an off-plan session", { id: "w1", planId: null, planDayIndex: null }]
  ])("does not mark a day for %s", (_label, session) => {
    renderWithPlan({ workoutSessions: [session] });

    expect(within(card("Mon")).queryByText("Logged")).toBeNull();
  });

  // A rest day is not a planned session, so nothing is logged against it.
  describe("a rest day", () => {
    test("is labelled on its card", () => {
      renderWithPlan();

      expect(within(card("Tue")).getByText("Rest day")).toBeInTheDocument();
      expect(within(card("Mon")).queryByText("Rest day")).toBeNull();
    });

    test("offers no log", () => {
      renderWithPlan();
      openDay("Tue");

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Log this workout" })).toBeNull();
    });

    test("is not marked by a session linked to it before rest days were told apart", () => {
      renderWithPlan({ workoutSessions: [{ id: "w1", planId: "plan-1", planDayIndex: 1 }] });

      expect(within(card("Tue")).queryByText("Logged")).toBeNull();
    });
  });

  test("labels no rest day for a weekday the plan has no lines for", () => {
    renderView({
      weekDays: [...WEEK, { key: "Wednesday", label: "Wed" }],
      latestPlanByWeekday: { Monday: mondayDay.lines },
      dashboard: { plans: [savedPlan()], goals: {}, savedExercises: [], workoutSessions: [] }
    });

    expect(within(card("Wed")).queryByText("Rest day")).toBeNull();
  });
});

// Roadmap B4: the day details show the week's load for each of the day's lifts,
// and logging the day opens its cards at the week's sets and loads.
describe("the week's progression", () => {
  const squat = {
    name: "Back Squats",
    sets: 3,
    reps: { min: 3, max: 5 },
    seconds: null,
    perSide: false,
    targetRpe: { min: 8, max: 8 }
  };
  const plank = { ...squat, name: "Plank", reps: null, seconds: { min: 20, max: 30 } };
  const mondayDay = {
    index: 0,
    weekday: "Monday",
    title: "Monday - Full body A",
    lines: ["- Back Squats: 3 x 3-5", "- Plank: 3 x 20-30 seconds"],
    prescriptions: [squat, plank]
  };
  const plan = {
    id: "plan-1",
    goal: "Build lean strength and energy",
    plan: "Monday - Full body A",
    payload: { version: 1, days: [mondayDay], notes: [] }
  };
  const squatWeek = {
    name: "Back Squats",
    key: "back squats",
    change: "up",
    kg: { from: 100, target: 102.5 },
    lb: { from: 220, target: 225 },
    sets: 3,
    why: "Every set reached 5 reps at RPE 8 or below on Mon 2 Nov",
    decision: null
  };
  const weekOf = (deloadWeek = { active: false, count: 1, reason: null, decision: null }) => ({
    weekStart: "2026-11-09",
    deloadWeek,
    lifts: [squatWeek]
  });

  const renderWeek = ({ progression = weekOf(), progressionError = "" } = {}) => {
    const setWorkoutForm = vi.fn();
    const onAnswerProgression = vi.fn();
    renderView({
      weekDays: [{ key: "Monday", label: "Mon" }],
      latestPlanByWeekday: { Monday: mondayDay.lines },
      dashboard: { plans: [plan], goals: {}, savedExercises: [], workoutSessions: [] },
      setWorkoutForm,
      setWorkoutModalOpen: vi.fn(),
      progression,
      onAnswerProgression,
      progressionError
    });
    fireEvent.click(
      within(screen.getByRole("heading", { name: "Workout week" }).closest("section")).getByRole(
        "button",
        { name: /^Mon/ }
      )
    );
    return { setWorkoutForm, onAnswerProgression };
  };
  const loads = () => within(screen.getByRole("region", { name: "This week's loads" }));
  const loggedCards = (setWorkoutForm) => {
    fireEvent.click(screen.getByRole("button", { name: "Log this workout" }));
    return setWorkoutForm.mock.calls[0][0].exerciseSets;
  };

  test("the day details show each lift's load in the region's unit, with its reason", () => {
    renderWeek();

    expect(loads().getByText(/Up to 225 lb, from 220/)).toBeInTheDocument();
    expect(
      loads().getByText("Every set reached 5 reps at RPE 8 or below on Mon 2 Nov")
    ).toBeInTheDocument();
  });

  test("shows kilograms outside an imperial region", () => {
    const languages = vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB"]);
    try {
      renderWeek();
      expect(loads().getByText(/Up to 102.5 kg, from 100/)).toBeInTheDocument();
    } finally {
      languages.mockRestore();
    }
  });

  test("an answer goes to the dashboard, and a failed one is announced", () => {
    const { onAnswerProgression } = renderWeek({
      progressionError: "Answers can only be given for this week."
    });

    fireEvent.click(loads().getByRole("button", { name: "Undo the step up for Back Squats" }));

    expect(onAnswerProgression).toHaveBeenCalledWith({ liftKey: "back squats", decision: "undo" });
    expect(loads().getByRole("alert")).toHaveTextContent(
      "Answers can only be given for this week."
    );
  });

  test("logging the day opens its cards at the week's load", () => {
    const { setWorkoutForm } = renderWeek();

    const [squatCard] = loggedCards(setWorkoutForm);

    expect(squatCard.targets.load).toBe("225");
  });

  test("logging a deload week opens every card at half its sets", () => {
    const { setWorkoutForm } = renderWeek({
      progression: {
        ...weekOf({ active: true, count: 5, reason: "Your 6th week in a row", decision: null }),
        lifts: [{ ...squatWeek, change: "hold", sets: 2 }]
      }
    });

    expect(loggedCards(setWorkoutForm).map((card) => card.sets.length)).toEqual([2, 2]);
  });

  test("without a week read, the details show no loads and the log opens as before", () => {
    const { setWorkoutForm } = renderWeek({ progression: null });

    expect(screen.queryByRole("region", { name: "This week's loads" })).toBeNull();
    const [squatCard] = loggedCards(setWorkoutForm);
    expect(squatCard.targets).toEqual({ amount: "3-5", rpe: "8" });
    expect(squatCard.sets).toHaveLength(3);
  });
});

// Removing a saved exercise cannot be kept for later, so it waits for a
// connection (docs/specs/2026-11-06-offline-ready-pwa-design.md).
describe("PlansView offline", () => {
  test("disables Remove on a saved exercise and says why", () => {
    markUnanswered();
    const { onRemoveSavedExercise } = renderView(withSaved(1));

    const remove = screen.getByRole("button", { name: "Remove" });
    expect(remove).toBeDisabled();
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    fireEvent.click(remove);
    expect(onRemoveSavedExercise).not.toHaveBeenCalled();
  });
});
