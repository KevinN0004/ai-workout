import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import PlansView from "./PlansView";

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
