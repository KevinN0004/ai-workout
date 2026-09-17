import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, test, vi } from "vitest";
import HomeWorkoutStage from "./HomeWorkoutStage";

// The generate step. Three things here are behaviour rather than markup: the
// error line appears only when there is an error, the sample plan is driven
// entirely by its prop, and the back control is gated on either transition.
//
// Each disable arm is asserted separately -- with both flags set, dropping one
// still reads as disabled, so a combined test cannot discriminate.
//
// The back button is icon-only, so its accessible name comes from aria-label.
// It is queried by that name throughout: if the label is dropped the button
// becomes unnameable to a screen reader, and every query below fails rather
// than silently falling back to matching on the svg.

const SAMPLE_PLAN = [
  { day: "Monday", blocks: ["Back squat 5x5", "Barbell row 3x8"] },
  { day: "Wednesday", blocks: ["Bench press 5x5"] }
];

const renderStage = (overrides = {}) =>
  render(
    <HomeWorkoutStage
      samplePlan={SAMPLE_PLAN}
      isIntroTransitioning={false}
      isStageTransitioning={false}
      onBack={() => {}}
      openPlannerFromProfile={() => {}}
      {...overrides}
    />
  );

const backButton = () => screen.getByRole("button", { name: "Back" });
const generateButton = () => screen.getByRole("button", { name: "Generate Workout" });

describe("HomeWorkoutStage", () => {
  test("opens the planner when Generate Workout is clicked", () => {
    const openPlannerFromProfile = vi.fn();
    renderStage({ openPlannerFromProfile });

    fireEvent.click(generateButton());

    expect(openPlannerFromProfile).toHaveBeenCalledTimes(1);
  });

  test("calls onBack when the back arrow is clicked", () => {
    const onBack = vi.fn();
    renderStage({ onBack });

    fireEvent.click(backButton());

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("gives the icon-only back control an accessible name", () => {
    renderStage();
    expect(backButton()).toHaveAttribute("aria-label", "Back");
  });

  test("allows going back when no transition is running", () => {
    renderStage();
    expect(backButton()).toBeEnabled();
  });

  test("disables going back while the intro is transitioning", () => {
    renderStage({ isIntroTransitioning: true });
    expect(backButton()).toBeDisabled();
  });

  test("disables going back while a stage transition is running", () => {
    renderStage({ isStageTransitioning: true });
    expect(backButton()).toBeDisabled();
  });

  test("shows no error line when there is no error", () => {
    const { container } = renderStage();
    expect(container.querySelector(".error")).toBeNull();
  });

  test("shows the error line when generation fails", () => {
    renderStage({ error: "Gemini is unavailable." });
    expect(screen.getByText("Gemini is unavailable.")).toHaveClass("error");
  });

  test("treats an empty error string as no error", () => {
    const { container } = renderStage({ error: "" });
    expect(container.querySelector(".error")).toBeNull();
  });

  test("renders a card per plan day with each of its lines", () => {
    const { container } = renderStage();
    const cards = container.querySelectorAll(".plan-card");

    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole("heading", { name: "Monday" })).toBeInTheDocument();
    expect(
      within(cards[0])
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual(["Back squat 5x5", "Barbell row 3x8"]);
    expect(
      within(cards[1])
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual(["Bench press 5x5"]);
  });

  test("renders no cards for an empty plan", () => {
    const { container } = renderStage({ samplePlan: [] });
    expect(container.querySelectorAll(".plan-card")).toHaveLength(0);
  });

  test("forwards the refs the stage animation measures", () => {
    const workoutShellRef = createRef();
    const workoutPanelRef = createRef();
    renderStage({ workoutShellRef, workoutPanelRef });

    expect(workoutShellRef.current).toHaveClass("workout-stage-shell");
    expect(workoutPanelRef.current).toHaveClass("workout-stage-panel");
  });
});
