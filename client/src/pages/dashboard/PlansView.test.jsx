import { fireEvent, render, screen } from "@testing-library/react";
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
  });
});
