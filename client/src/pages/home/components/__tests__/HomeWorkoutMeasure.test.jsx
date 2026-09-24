import { render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, test } from "vitest";
import HomeWorkoutMeasure from "../HomeWorkoutMeasure";

// An offscreen clone of HomeWorkoutStage that exists only to be measured, so
// the stage animation knows how tall the real panel will be before it opens.
//
// That makes its two defining properties accessibility ones, and they are the
// whole point of the component: the subtree is aria-hidden, and its buttons are
// removed from the tab order. Without both, the page announces a second
// "Workout Generation" heading and a duplicate "Generate Workout" button that
// does nothing, and a keyboard user tabs into a panel they cannot see.
//
// The role queries below are the assertion for the first property rather than a
// convenience: testing-library ignores an aria-hidden subtree, so the clone's
// controls are unreachable by role exactly when it is correctly hidden.

const SAMPLE_PLAN = [
  { day: "Monday", blocks: ["Back squat 5x5", "Barbell row 3x8"] },
  { day: "Wednesday", blocks: ["Bench press 5x5"] }
];

const renderMeasure = (overrides = {}) =>
  render(<HomeWorkoutMeasure samplePlan={SAMPLE_PLAN} {...overrides} />);

describe("HomeWorkoutMeasure", () => {
  test("hides the whole measurement clone from assistive technology", () => {
    const { container } = renderMeasure();

    expect(container.querySelector(".stage-measure")).toHaveAttribute("aria-hidden", "true");
  });

  test("exposes none of its duplicated controls or headings by role", () => {
    renderMeasure();

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Workout Generation" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Sample Weekly Plan" })).toBeNull();
  });

  test("keeps both cloned buttons out of the tab order", () => {
    const { container } = renderMeasure();
    const buttons = container.querySelectorAll("button");

    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toHaveAttribute("tabindex", "-1");
    }
  });

  test("renders the same plan content the real stage will show", () => {
    const { container } = renderMeasure();
    const cards = container.querySelectorAll(".plan-card");

    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("Monday")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Back squat 5x5")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Barbell row 3x8")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Bench press 5x5")).toBeInTheDocument();
  });

  test("renders nothing for an empty plan without failing", () => {
    const { container } = renderMeasure({ samplePlan: [] });

    expect(container.querySelectorAll(".plan-card")).toHaveLength(0);
  });

  test("forwards the refs the stage animation measures", () => {
    const workoutMeasureShellRef = createRef();
    const workoutMeasureRef = createRef();
    renderMeasure({ workoutMeasureShellRef, workoutMeasureRef });

    expect(workoutMeasureShellRef.current).toHaveClass("workout-stage-shell");
    expect(workoutMeasureRef.current).toHaveClass("workout-stage-panel");
  });
});
