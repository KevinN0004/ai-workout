/**
 * Pins the in-gym session screen (roadmap B6): one exercise at a time, a set
 * pre-filled, stepped and logged with Done, Undo, moving between exercises,
 * adding one, Finish, Cancel and leaving, and the rest timer, sound and wake lock.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SessionPage from "../SessionPage";
import { readActiveSession } from "../../../app/activeSession";
import { addExercise, blankSession, sessionFromPlanDay } from "../../../app/workoutSession";
import { markUnanswered } from "../../../app/connection";
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

// An AudioContext that counts the beeps played through it. The session page
// keeps the context it first unlocks for the page's life, so every test in the
// file shares this one class and counts from zero.
let beeps = 0;
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume = () => Promise.resolve();
  createOscillator() {
    beeps += 1;
    return { frequency: { value: 0 }, connect: () => {}, start: () => {}, stop: () => {} };
  }
  createGain() {
    return { gain: { value: 1 }, connect: () => {} };
  }
}

describe("SessionPage's rest timer, sound and screen", () => {
  const tick = (ms) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  const press = (name) => fireEvent.click(screen.getByRole("button", { name }));
  const liveRegion = () => document.querySelector(".session-page [aria-live='polite']");
  let vibrate;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    window.AudioContext = FakeAudioContext;
    beeps = 0;
    vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.AudioContext;
    delete navigator.vibrate;
    delete navigator.wakeLock;
  });

  test("Done starts the exercise's rest, and the live region says so once", () => {
    renderPage();
    expect(screen.queryByRole("region", { name: "Rest" })).not.toBeInTheDocument();
    expect(liveRegion()).toHaveTextContent(/^$/);

    press("Done");
    const rest = screen.getByRole("region", { name: "Rest" });
    expect(rest).toHaveTextContent("1:30");
    expect(liveRegion()).toHaveTextContent(/^Rest 90 seconds$/);

    tick(1000);
    expect(rest).toHaveTextContent("1:29");
    // The digits change each second, outside the live region, which is unchanged.
    expect(screen.getByText("1:29").closest("[aria-live]")).toBeNull();
    expect(liveRegion()).toHaveTextContent(/^Rest 90 seconds$/);
  });

  test("an exercise with no rest from the plan rests for 90 seconds", () => {
    renderPage();
    press("Next exercise");
    press("Done");

    expect(screen.getByRole("region", { name: "Rest" })).toHaveTextContent("1:30");
  });

  test("−15 s and +15 s move the rest, and Skip rest ends it", () => {
    renderPage();
    press("Done");
    const rest = screen.getByRole("region", { name: "Rest" });

    press("+15 s");
    expect(rest).toHaveTextContent("1:45");
    press("−15 s");
    press("−15 s");
    expect(rest).toHaveTextContent("1:15");

    press("Skip rest");
    expect(screen.queryByRole("region", { name: "Rest" })).not.toBeInTheDocument();
  });

  test("Undo takes the rest back with the set", () => {
    renderPage();
    press("Done");

    press("Undo set 1");

    expect(screen.queryByRole("region", { name: "Rest" })).not.toBeInTheDocument();
  });

  test("the end of a rest buzzes, beeps and says Rest over, once", () => {
    renderPage();
    press("Done");

    tick(90_000);

    expect(screen.getByRole("region", { name: "Rest" })).toHaveTextContent("Rest over");
    expect(liveRegion()).toHaveTextContent(/^Rest over$/);
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
    expect(beeps).toBe(1);

    // A second at a time, as a page renders them: one act batches its ticks.
    for (let second = 0; second < 10; second += 1) tick(1000);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(beeps).toBe(1);
  });

  test("with Sound off the end buzzes without a beep, and the switch is remembered", () => {
    renderPage();
    const sound = screen.getByRole("button", { name: "Sound" });
    expect(sound).toHaveAttribute("aria-pressed", "true");
    expect(sound).toHaveTextContent("Sound on");

    press("Sound");
    expect(sound).toHaveAttribute("aria-pressed", "false");
    expect(sound).toHaveTextContent("Sound off");
    press("Done");
    tick(90_000);

    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(beeps).toBe(0);
    expect(JSON.parse(window.localStorage.getItem("ai-workout-session-sound-v1"))).toBe(false);
  });

  test("Sound starts off when the device remembers it off, and turns back on", () => {
    window.localStorage.setItem("ai-workout-session-sound-v1", "false");
    renderPage();
    const sound = screen.getByRole("button", { name: "Sound" });
    expect(sound).toHaveAttribute("aria-pressed", "false");

    press("Sound");
    press("Done");
    tick(90_000);

    expect(sound).toHaveAttribute("aria-pressed", "true");
    expect(beeps).toBe(1);
    expect(JSON.parse(window.localStorage.getItem("ai-workout-session-sound-v1"))).toBe(true);
  });

  test("a rest already over when the page opens shows Rest over, with no late alert", () => {
    const session = { ...planned(), restEndsAt: NOW - 60_000 };
    renderPage(session);

    expect(screen.getByRole("region", { name: "Rest" })).toHaveTextContent("Rest over");
    tick(1000);
    expect(vibrate).not.toHaveBeenCalled();
    expect(beeps).toBe(0);
  });

  test("the header shows the time since the start, each second", () => {
    renderPage();
    expect(screen.getByText("0:00")).toBeInTheDocument();

    tick(754_000);
    expect(screen.getByText("12:34")).toBeInTheDocument();
    expect(screen.getByText("12:34")).toHaveTextContent("Time so far 12:34");
  });

  test("past an hour the time since the start shows its hours", () => {
    vi.setSystemTime(NOW + 3_723_000);
    renderPage();

    expect(screen.getByText("1:02:03")).toBeInTheDocument();
  });

  test("asks for the screen to stay awake while open", async () => {
    const lock = { release: vi.fn(() => Promise.resolve()) };
    const request = vi.fn(() => Promise.resolve(lock));
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });

    const { unmount } = render(
      <SessionPage
        user={user}
        initialSession={planned()}
        system="metric"
        onFinish={vi.fn()}
        onDiscard={vi.fn()}
        onLeave={vi.fn()}
      />
    );
    await act(async () => {});
    expect(request).toHaveBeenCalledWith("screen");

    unmount();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });
});

// Roadmap C4: an exercise with no sets logged can be swapped on the in-gym
// screen, which changes the plan and the open session alike.
describe("swapping an exercise on the in-gym screen", () => {
  const SUMO = {
    name: "Dumbbell sumo squat",
    needs: ["dumbbell"],
    regressed: false,
    area: null,
    cue: null
  };
  const sumo = {
    name: "Dumbbell sumo squat",
    sets: 3,
    reps: { min: 8, max: 10 },
    seconds: null,
    perSide: false,
    targetRpe: { min: 7, max: 8 },
    restSeconds: 120
  };
  const swappedPlan = {
    id: "plan-1",
    payload: {
      version: 1,
      notes: [],
      days: [{ index: 0, weekday: "Monday", title: "Upper A", lines: [], prescriptions: [sumo] }]
    }
  };
  const respond = (body) => ({ ok: true, json: async () => body });
  const swapFetch = (answered) =>
    vi.fn(async (_path, options) =>
      options?.method === "POST"
        ? respond({ plan: answered })
        : respond({ areas: ["knee"], alternatives: [SUMO] })
    );

  const renderSwaps = (initialSession = planned(), answered = swappedPlan) => {
    const handlers = {
      onFinish: vi.fn(),
      onDiscard: vi.fn(),
      onLeave: vi.fn(),
      onPlanChanged: vi.fn()
    };
    const apiFetch = swapFetch(answered);
    render(
      <SessionPage
        user={user}
        initialSession={initialSession}
        system="metric"
        apiFetch={apiFetch}
        {...handlers}
      />
    );
    return { ...handlers, apiFetch };
  };
  const list = () => within(screen.getByRole("list", { name: "Exercises" }));

  test("offers Swap on a plan session's exercises with no sets logged", async () => {
    renderSwaps();
    await done();

    expect(list().queryByRole("button", { name: "Swap Bench press" })).toBeNull();
    expect(list().getByRole("button", { name: "Swap Plank" })).toBeEnabled();
  });

  // Its exercises are added in the session, with no planned sets, and nothing
  // to swap means nothing to say offline either.
  test("a blank session has no plan, so no Swap, and no offline hint for it", () => {
    markUnanswered();
    renderSwaps(addExercise(blankSession({ now: NOW }), { name: "Squat", kind: "reps" }));
    expect(list().queryByRole("button", { name: /^Swap / })).toBeNull();
    expect(screen.queryByText("You're offline")).toBeNull();
  });

  test("a swap changes the plan and the exercise, and keeps the session on the device", async () => {
    const { onPlanChanged } = renderSwaps();

    await userEvent.click(list().getByRole("button", { name: "Swap Bench press" }));
    expect(screen.getByRole("heading", { name: "Swap Bench press" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Exercises" })).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: /^Dumbbell sumo squat/ }));

    await waitFor(() => expect(onPlanChanged).toHaveBeenCalledWith(swappedPlan));
    expect(
      screen.getByRole("heading", { level: 2, name: "Dumbbell sumo squat" })
    ).toBeInTheDocument();
    expect(screen.getByText("8-10 reps @ RPE 7-8")).toBeInTheDocument();
    expect(readActiveSession(user).exercises[0]).toMatchObject({
      name: "Dumbbell sumo squat",
      restSeconds: 120
    });
  });

  test("a plan whose day no longer holds the exercise leaves the session as it was", async () => {
    const elsewhere = {
      ...swappedPlan,
      payload: {
        ...swappedPlan.payload,
        days: [{ ...swappedPlan.payload.days[0], prescriptions: undefined }]
      }
    };
    const { onPlanChanged } = renderSwaps(planned(), elsewhere);

    await userEvent.click(list().getByRole("button", { name: "Swap Bench press" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Dumbbell sumo squat/ }));

    await waitFor(() => expect(onPlanChanged).toHaveBeenCalledWith(elsewhere));
    expect(screen.getByRole("heading", { level: 2, name: "Bench press" })).toBeInTheDocument();
  });

  test("Back leaves the swap with the session as it was", async () => {
    const { onPlanChanged } = renderSwaps();

    await userEvent.click(list().getByRole("button", { name: "Swap Bench press" }));
    await screen.findByRole("button", { name: /^Dumbbell sumo squat/ });
    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(list().getByRole("button", { name: "Swap Bench press" })).toBeInTheDocument();
    expect(onPlanChanged).not.toHaveBeenCalled();
  });

  test("offline, Swap is disabled, and it says why", () => {
    markUnanswered();
    renderSwaps();

    expect(list().getByRole("button", { name: "Swap Bench press" })).toBeDisabled();
    expect(screen.getByText("You're offline")).toBeInTheDocument();
  });
});
