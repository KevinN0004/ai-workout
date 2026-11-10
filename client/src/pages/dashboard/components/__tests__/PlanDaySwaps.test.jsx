/**
 * Pins a plan day's exercise list for swapping (roadmap C4): Swap on each
 * exercise, the line a swapped one carries with its Undo, and both disabled
 * offline. apiFetch, the network boundary, is stubbed.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import PlanDaySwaps from "../PlanDaySwaps";
import { markUnanswered } from "../../../../app/connection";

const prescription = (name, extra = {}) => ({
  name,
  sets: 3,
  reps: { min: 8, max: 10 },
  seconds: null,
  perSide: false,
  targetRpe: null,
  ...extra
});
const swappedFrom = (name) => ({
  prescription: prescription(name),
  line: `- ${name}: 3 x 8-10`,
  rampLine: null
});
const PLAN = { id: "plan-1", payload: { days: [] } };
const respond = (body, ok = true) => ({ ok, json: async () => body });

const renderList = (prescriptions, apiFetch = vi.fn(async () => respond({ plan: PLAN }))) => {
  const handlers = { onSwap: vi.fn(), onPlanChanged: vi.fn() };
  render(
    <PlanDaySwaps apiFetch={apiFetch} planId="plan-1" prescriptions={prescriptions} {...handlers} />
  );
  return { apiFetch, ...handlers };
};

describe("PlanDaySwaps", () => {
  test("offers Swap on each exercise, and hands back the one chosen", () => {
    const { onSwap } = renderList([prescription("Dumbbell goblet squat"), prescription("Push-up")]);

    fireEvent.click(screen.getByRole("button", { name: "Swap Push-up" }));

    expect(screen.getByRole("button", { name: "Swap Dumbbell goblet squat" })).toBeEnabled();
    expect(onSwap).toHaveBeenCalledWith("Push-up");
  });

  test("says what a swapped exercise replaced, and why when an area was named", () => {
    renderList([
      prescription("Incline push-up, hands on a counter", {
        swappedFrom: swappedFrom("Dumbbell bench press"),
        swapReason: "shoulder"
      }),
      prescription("Dumbbell sumo squat", {
        swappedFrom: swappedFrom("Dumbbell goblet squat"),
        swapReason: null
      })
    ]);

    expect(screen.getByText("Swapped from Dumbbell bench press (shoulder)")).toBeInTheDocument();
    expect(screen.getByText("Swapped from Dumbbell goblet squat")).toBeInTheDocument();
  });

  test("Undo takes the swap back and hands back the plan", async () => {
    const { apiFetch, onPlanChanged } = renderList([
      prescription("Dumbbell sumo squat", { swappedFrom: swappedFrom("Dumbbell goblet squat") })
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Undo the swap of Dumbbell sumo squat" }));

    await waitFor(() => expect(onPlanChanged).toHaveBeenCalledWith(PLAN));
    expect(apiFetch.mock.calls[0][0]).toBe("/api/dashboard/plans/plan-1/swaps/undo");
  });

  test("a failed Undo says why", async () => {
    const { onPlanChanged } = renderList(
      [prescription("Dumbbell sumo squat", { swappedFrom: swappedFrom("Dumbbell goblet squat") })],
      vi.fn(async () => respond({ error: "That exercise has no swap to undo." }, false))
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo the swap of Dumbbell sumo squat" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That exercise has no swap to undo."
    );
    expect(onPlanChanged).not.toHaveBeenCalled();
  });

  test("offline, Swap and Undo are disabled, and it says why", () => {
    markUnanswered();
    renderList([
      prescription("Dumbbell goblet squat"),
      prescription("Dumbbell sumo squat", { swappedFrom: swappedFrom("Dumbbell box squat") })
    ]);

    expect(screen.getByRole("button", { name: "Swap Dumbbell goblet squat" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Undo the swap of Dumbbell sumo squat" })
    ).toBeDisabled();
    expect(screen.getByText("You're offline")).toBeInTheDocument();
  });
});
