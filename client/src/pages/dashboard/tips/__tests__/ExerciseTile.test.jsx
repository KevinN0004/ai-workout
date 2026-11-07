/**
 * Pins ExerciseTile's Save button: its three labels, what it hands onSave, and
 * that it waits for a connection while offline.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ExerciseTile from "../ExerciseTile";
import { markUnanswered } from "../../../../app/connection";

const exercise = { id: 7, name: "Barbell Squat", category: { name: "Legs" }, equipment: [] };

const renderTile = (props = {}) => {
  const handlers = { onOpen: vi.fn(), onSave: vi.fn() };
  render(
    <ExerciseTile exercise={exercise} saved={false} isSaving={false} {...handlers} {...props} />
  );
  return handlers;
};

describe("ExerciseTile", () => {
  test("saves the exercise with its recommendation", () => {
    const recommendation = { reasons: ["Matches your focus."] };
    const { onSave } = renderTile({ recommendation });

    fireEvent.click(screen.getByRole("button", { name: "Save to plan" }));

    expect(onSave).toHaveBeenCalledWith(exercise, recommendation);
  });

  // A saved exercise cannot be kept for later, so Save waits for a
  // connection (docs/specs/2026-11-06-offline-ready-pwa-design.md).
  test("offline, Save is disabled and says why", () => {
    markUnanswered();
    const { onSave } = renderTile();

    const save = screen.getByRole("button", { name: "Save to plan" });
    expect(save).toBeDisabled();
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("online, Save is open and nothing is said", () => {
    renderTile();

    expect(screen.getByRole("button", { name: "Save to plan" })).toBeEnabled();
    expect(screen.queryByText("You're offline")).not.toBeInTheDocument();
  });
});
