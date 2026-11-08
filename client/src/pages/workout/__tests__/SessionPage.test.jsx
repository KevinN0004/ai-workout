/**
 * Pins the in-gym session screen (roadmap B6): one exercise at a time, a set
 * pre-filled, stepped and logged with Done, Undo, moving between exercises,
 * adding one, and Finish, Cancel and leaving.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import SessionPage from "../SessionPage";
import { readActiveSession } from "../../../app/activeSession";
import { blankSession, sessionFromPlanDay } from "../../../app/workoutSession";
import { newCard } from "../../../app/exerciseSets";

const user = { email: "ada@example.com" };
const NOW = Date.UTC(2026, 10, 9, 17, 0, 0);

const planned = () =>
  sessionFromPlanDay({
    day: {
      index: 0,
      title: "Upper A",
      prescriptions: [{ restSeconds: 90 }, { restSeconds: null }]
    },
    cards: [
      newCard({
        name: "Bench press",
        targets: { amount: "8-10", rpe: "7-8", load: "22.5" },
        rows: 3
      }),
      newCard({ name: "Plank", kind: "seconds", targets: { amount: "30", rpe: "" }, rows: 2 })
    ],
    planId: "plan-1",
    system: "metric",
    now: NOW
  });

const renderPage = (initialSession = planned(), system = "metric") => {
  const handlers = { onFinish: vi.fn(), onDiscard: vi.fn(), onLeave: vi.fn() };
  render(<SessionPage user={user} initialSession={initialSession} system={system} {...handlers} />);
  return handlers;
};

const done = () => userEvent.click(screen.getByRole("button", { name: "Done" }));

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("SessionPage", () => {
  test("shows the session, the current exercise, its target and the set to log", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Upper A" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Bench press" })).toBeInTheDocument();
    expect(screen.getByText("Exercise 1 of 2 · Set 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("8-10 reps @ RPE 7-8 · 22.5 kg")).toBeInTheDocument();
    expect(screen.getByLabelText("Reps")).toHaveTextContent("10");
    expect(screen.getByLabelText("Load")).toHaveTextContent("22.5 kg");
  });

  test("the steppers move the reps by one and the load by a step", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "One rep fewer" }));
    await userEvent.click(screen.getByRole("button", { name: "2.5 kg heavier" }));

    expect(screen.getByLabelText("Reps")).toHaveTextContent("9");
    expect(screen.getByLabelText("Load")).toHaveTextContent("25 kg");
  });

  test("a seconds exercise steps by five, and a reps one back up by one", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "One rep more" }));
    expect(screen.getByLabelText("Reps")).toHaveTextContent("11");

    await userEvent.click(screen.getByRole("button", { name: "Next exercise" }));
    await userEvent.click(screen.getByRole("button", { name: "5 seconds more" }));
    expect(screen.getByLabelText("Seconds")).toHaveTextContent("35");
    await userEvent.click(screen.getByRole("button", { name: "5 seconds less" }));
    await userEvent.click(screen.getByRole("button", { name: "5 seconds less" }));
    expect(screen.getByLabelText("Seconds")).toHaveTextContent("25");
  });

  test("under imperial the load steps in pounds", async () => {
    renderPage(planned(), "imperial");

    await userEvent.click(screen.getByRole("button", { name: "5 lb lighter" }));

    expect(screen.getByLabelText("Load")).toHaveTextContent("44.6 lb");
  });

  test("below the lightest step the load is bodyweight", async () => {
    renderPage();
    const lighter = screen.getByRole("button", { name: "2.5 kg lighter" });

    for (let i = 0; i < 9; i += 1) await userEvent.click(lighter);

    expect(screen.getByLabelText("Load")).toHaveTextContent("Bodyweight");
  });

  test("an RPE is chosen with a tap, and a second tap clears it", async () => {
    renderPage();
    const eight = screen.getByRole("button", { name: "RPE 8" });

    await userEvent.click(eight);
    expect(eight).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(eight);
    expect(eight).toHaveAttribute("aria-pressed", "false");
  });

  test("Done logs the set shown, and the next set opens from it", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "RPE 8" }));

    await done();

    const sets = screen.getByRole("list", { name: "Sets done" });
    expect(within(sets).getByText("Set 1: 10 reps, 22.5 kg, RPE 8")).toBeInTheDocument();
    expect(screen.getByText("Exercise 1 of 2 · Set 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RPE 8" })).toHaveAttribute("aria-pressed", "false");
    expect(readActiveSession(user).exercises[0].sets).toEqual([
      { amount: 10, loadKg: 22.5, rpe: 8 }
    ]);
  });

  test("Done keeps focus, so the keyboard carries on from it to Undo", async () => {
    renderPage();
    await done();

    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Undo set 1" })).toHaveFocus();
  });

  test("Undo takes back the last set", async () => {
    renderPage();
    await done();
    await done();

    await userEvent.click(screen.getByRole("button", { name: "Undo set 2" }));

    expect(screen.getByRole("list", { name: "Sets done" }).children).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Undo set 2" })).not.toBeInTheDocument();
  });

  test("Next exercise and Previous move between exercises", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Next exercise" }));
    expect(screen.getByRole("heading", { level: 2, name: "Plank" })).toBeInTheDocument();
    expect(screen.getByLabelText("Seconds")).toHaveTextContent("30");
    expect(screen.getByLabelText("Load")).toHaveTextContent("Bodyweight");
    expect(screen.getByRole("button", { name: "Next exercise" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("heading", { level: 2, name: "Bench press" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  test("Next exercise becomes the main button once the planned sets are done", async () => {
    renderPage();
    const next = () => screen.getByRole("button", { name: "Next exercise" });
    expect(next()).toHaveClass("ghost");

    await done();
    await done();
    await done();

    expect(next()).toHaveClass("cta");
  });

  test("the exercise list jumps to an exercise, and skips or restores one", async () => {
    renderPage();
    const list = screen.getByRole("list", { name: "Exercises" });

    await userEvent.click(within(list).getByRole("button", { name: "Plank, 0 of 2 sets" }));
    expect(screen.getByRole("heading", { level: 2, name: "Plank" })).toBeInTheDocument();

    await userEvent.click(within(list).getByRole("button", { name: "Skip Bench press" }));
    expect(within(list).getByRole("button", { name: "Restore Bench press" })).toBeInTheDocument();
  });

  test("an exercise is added by name, counting reps or seconds, and opens", async () => {
    renderPage(blankSession({ now: NOW }));

    await userEvent.type(screen.getByLabelText("Exercise name"), "Hang");
    await userEvent.click(screen.getByRole("button", { name: "Seconds" }));
    await userEvent.click(screen.getByRole("button", { name: "Add exercise" }));

    expect(screen.getByRole("heading", { level: 2, name: "Hang" })).toBeInTheDocument();
    expect(screen.getByLabelText("Seconds")).toHaveTextContent("30");
  });

  test("Reps can be chosen again after Seconds, and a blank name adds nothing", async () => {
    renderPage(blankSession({ now: NOW }));

    await userEvent.type(screen.getByLabelText("Exercise name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Add exercise" }));
    expect(screen.getByText("Add your first exercise below.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Exercise name"));
    await userEvent.type(screen.getByLabelText("Exercise name"), "Row");
    await userEvent.click(screen.getByRole("button", { name: "Seconds" }));
    await userEvent.click(screen.getByRole("button", { name: "Reps" }));
    expect(screen.getByRole("button", { name: "Reps" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Add exercise" }));

    expect(screen.getByRole("heading", { level: 2, name: "Row" })).toBeInTheDocument();
    expect(screen.getByLabelText("Reps")).toHaveTextContent("10");
  });

  test("a blank session asks for its first exercise", () => {
    renderPage(blankSession({ now: NOW }));

    expect(screen.getByText("Add your first exercise below.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
  });

  test("Finish is disabled until a set is logged, then hands over the session", async () => {
    const { onFinish } = renderPage();
    expect(screen.getByRole("button", { name: "Finish" })).toBeDisabled();

    await done();
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].exercises[0].sets).toHaveLength(1);
  });

  test("Cancel with sets logged asks, and Discard discards", async () => {
    const { onDiscard } = renderPage();
    await done();

    await userEvent.click(screen.getByRole("button", { name: "Cancel workout" }));
    const dialog = screen.getByRole("dialog", { name: "Discard this workout?" });
    expect(dialog).toHaveAccessibleDescription("1 set will be lost.");

    await userEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  test("Keep training closes the question and keeps the session", async () => {
    const { onDiscard } = renderPage();
    await done();
    await done();

    await userEvent.click(screen.getByRole("button", { name: "Cancel workout" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription("2 sets will be lost.");
    await userEvent.click(screen.getByRole("button", { name: "Keep training" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  test("Cancel with nothing logged discards at once", async () => {
    const { onDiscard } = renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Cancel workout" }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("Dashboard leaves and keeps the session", async () => {
    const { onLeave } = renderPage();
    await done();

    await userEvent.click(screen.getByRole("button", { name: "Dashboard" }));

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(readActiveSession(user)).not.toBeNull();
  });

  test("says so when the device will not keep the session", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This device isn't keeping this workout. Finish it before you close the app."
    );
  });
});
