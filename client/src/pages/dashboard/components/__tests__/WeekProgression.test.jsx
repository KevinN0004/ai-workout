import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import WeekProgression from "../WeekProgression";
import { markUnanswered } from "../../../../app/connection";

// The week's loads for one plan day (roadmap B4): each lift's change, its
// reason and its controls, and the deload week's banner.

const rx = (name, reps = { min: 8, max: 10 }) => ({
  name,
  sets: 3,
  reps,
  seconds: reps ? null : { min: 20, max: 30 },
  perSide: false,
  targetRpe: null
});

const lift = (name, change, fields = {}) => ({
  name,
  key: name.toLowerCase(),
  change,
  kg: change === "none" ? null : { from: 40, target: 42.5 },
  lb: change === "none" ? null : { from: 90, target: 95 },
  sets: 3,
  why: `${name} because`,
  decision: null,
  ...fields
});

const weekOf = (lifts, deloadWeek = { active: false, count: 2, reason: null, decision: null }) => ({
  weekStart: "2026-11-09",
  deloadWeek,
  lifts
});

const DAY = [rx("Leg press"), rx("Dumbbell box squat"), rx("Seated cable row"), rx("Plank", null)];

const renderWeek = ({ week, prescriptions = DAY, system = "metric", error = "" } = {}) => {
  const onAnswer = vi.fn();
  render(
    <WeekProgression
      week={week}
      prescriptions={prescriptions}
      system={system}
      onAnswer={onAnswer}
      error={error}
    />
  );
  return onAnswer;
};

const itemFor = (name) =>
  screen.getAllByRole("listitem").find((item) => item.textContent.startsWith(name));

describe("WeekProgression", () => {
  test("shows each of the day's lifts with its change and its reason, in the day's order", () => {
    renderWeek({
      week: weekOf([
        lift("Seated cable row", "deload", { kg: { from: 60, target: 55 } }),
        lift("Leg press", "up"),
        lift("Dumbbell box squat", "ask"),
        lift("Push-up", "none")
      ])
    });

    expect(screen.getByRole("heading", { name: "This week's loads" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("listitem").map((item) => item.querySelector("p").textContent)
    ).toEqual([
      "Leg press: Up to 42.5 kg, from 40",
      "Dumbbell box squat: Up to 42.5 kg? Now 40",
      "Seated cable row: Lighter: 55 kg, from 60"
    ]);
    expect(within(itemFor("Leg press")).getByText("Leg press because")).toBeInTheDocument();
  });

  test("a hold and a lift with no load say so", () => {
    renderWeek({
      week: weekOf([lift("Leg press", "hold"), lift("Dumbbell box squat", "none")])
    });

    expect(itemFor("Leg press").querySelector("p").textContent).toBe("Leg press: Hold at 40 kg");
    expect(itemFor("Dumbbell box squat").querySelector("p").textContent).toBe(
      "Dumbbell box squat: No load to set"
    );
  });

  test("shows loads in pounds under an imperial region", () => {
    renderWeek({ week: weekOf([lift("Leg press", "up")]), system: "imperial" });

    expect(itemFor("Leg press").querySelector("p").textContent).toBe(
      "Leg press: Up to 95 lb, from 90"
    );
  });

  test("Undo answers an automatic step up or lighter load, named for its lift", async () => {
    const onAnswer = renderWeek({
      week: weekOf([lift("Leg press", "up"), lift("Seated cable row", "deload")])
    });

    await userEvent.click(screen.getByRole("button", { name: "Undo the step up for Leg press" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Undo the lighter load for Seated cable row" })
    );

    expect(onAnswer.mock.calls).toEqual([
      [{ liftKey: "leg press", decision: "undo" }],
      [{ liftKey: "seated cable row", decision: "undo" }]
    ]);
  });

  test("Go up and Keep answer an asked step up", async () => {
    const onAnswer = renderWeek({ week: weekOf([lift("Dumbbell box squat", "ask")]) });

    await userEvent.click(screen.getByRole("button", { name: "Go up on Dumbbell box squat" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Keep the load on Dumbbell box squat" })
    );

    expect(onAnswer.mock.calls).toEqual([
      [{ liftKey: "dumbbell box squat", decision: "accept" }],
      [{ liftKey: "dumbbell box squat", decision: "decline" }]
    ]);
  });

  test("a hold and a lift with no load offer nothing to answer", () => {
    renderWeek({
      week: weekOf([lift("Leg press", "hold"), lift("Dumbbell box squat", "none")])
    });

    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  test("an answered lift offers to take the answer back, and nothing else", async () => {
    const onAnswer = renderWeek({
      week: weekOf([lift("Leg press", "hold", { decision: "undo" })])
    });

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Take back your answer for Leg press"
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Take back your answer for Leg press" })
    );
    expect(onAnswer).toHaveBeenCalledWith({ liftKey: "leg press", decision: null });
  });

  test("a deload week shows its banner, with Train normally", async () => {
    const onAnswer = renderWeek({
      week: weekOf([lift("Leg press", "hold")], {
        active: true,
        count: 5,
        reason: "Your 6th week in a row: same loads, half the sets",
        decision: null
      })
    });

    expect(screen.getByText(/^Lighter week:/).closest("p").textContent).toBe(
      "Lighter week: Your 6th week in a row: same loads, half the sets"
    );
    await userEvent.click(screen.getByRole("button", { name: "Train normally" }));
    expect(onAnswer).toHaveBeenCalledWith({ decision: "normal" });
  });

  test("a deload week trained normally offers to take that back", async () => {
    const onAnswer = renderWeek({
      week: weekOf([lift("Leg press", "up")], {
        active: true,
        count: 5,
        reason: "Your 6th week in a row: same loads, half the sets",
        decision: "normal"
      })
    });

    expect(screen.queryByText(/^Lighter week:/)).not.toBeInTheDocument();
    expect(screen.getByText("Training normally this week.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Take back training normally" }));
    expect(onAnswer).toHaveBeenCalledWith({ decision: null });
  });

  test("a deload week shows its banner on a day with none of the week's lifts", () => {
    renderWeek({
      week: weekOf([lift("Push-up", "hold")], {
        active: true,
        count: 5,
        reason: "Your 6th week in a row: same loads, half the sets",
        decision: null
      }),
      prescriptions: [rx("Plank", null)]
    });

    expect(screen.getByRole("button", { name: "Train normally" })).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  test("no banner outside a deload week", () => {
    renderWeek({ week: weekOf([lift("Leg press", "up")]) });

    expect(screen.queryByText(/^Lighter week:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Train normally" })).not.toBeInTheDocument();
  });

  test("a failed answer is announced", () => {
    renderWeek({
      week: weekOf([lift("Leg press", "up")]),
      error: "Answers can only be given for this week."
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Answers can only be given for this week.");
  });

  // A lift is prescribed in reps; a name timed in seconds on this day is not
  // that lift, even when another day prescribes it in reps.
  test("shows no load for a day that times an exercise the week holds as a lift", () => {
    renderWeek({ week: weekOf([lift("Plank", "up"), lift("Leg press", "up")]) });

    expect(
      screen.getAllByRole("listitem").map((item) => item.querySelector("strong").textContent)
    ).toEqual(["Leg press"]);
  });

  test("renders nothing without a week, or with nothing to show for the day", () => {
    const { container: none } = render(
      <WeekProgression
        week={null}
        prescriptions={DAY}
        system="metric"
        onAnswer={vi.fn()}
        error=""
      />
    );
    const { container: empty } = render(
      <WeekProgression
        week={weekOf([lift("Push-up", "up")])}
        prescriptions={[rx("Plank", null)]}
        system="metric"
        onAnswer={vi.fn()}
        error=""
      />
    );

    expect(none).toBeEmptyDOMElement();
    expect(empty).toBeEmptyDOMElement();
  });
});

// An answer to the week is saved by the server, so every answer waits for a
// connection (docs/specs/2026-11-06-offline-ready-pwa-design.md).
describe("WeekProgression offline", () => {
  test("disables every answer, the week's included, and says why once", () => {
    markUnanswered();
    renderWeek({
      week: weekOf([lift("Leg press", "up"), lift("Dumbbell box squat", "ask")], {
        active: true,
        count: 6,
        reason: "Sixth week in a row.",
        decision: null
      })
    });

    const answers = screen.getAllByRole("button");
    expect(answers.length).toBeGreaterThan(2);
    answers.forEach((button) => expect(button).toBeDisabled());
    expect(screen.getAllByText("You're offline")).toHaveLength(1);
  });

  test("online, every answer is open", () => {
    renderWeek({ week: weekOf([lift("Leg press", "up")]) });

    screen.getAllByRole("button").forEach((button) => expect(button).toBeEnabled());
    expect(screen.queryByText("You're offline")).not.toBeInTheDocument();
  });
});
