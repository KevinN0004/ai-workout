/**
 * Pins the plan swap requests (roadmap C4): each one's path, method and body
 * over apiFetch, the answer each returns, and the message a refusal throws.
 */
import { describe, expect, test, vi } from "vitest";
import { fetchSwapOptions, swapExercise, undoExerciseSwap } from "../planSwaps";

const respond = (body, ok = true) => ({ ok, json: async () => body });
const PLAN = { id: "plan 1", payload: { days: [] } };

describe("fetchSwapOptions", () => {
  test("asks for an exercise's alternatives, with the area only when there is one", async () => {
    const answer = { exercise: "Goblet squat", area: null, areas: [], alternatives: [] };
    const apiFetch = vi.fn(async () => respond(answer));

    expect(await fetchSwapOptions(apiFetch, "plan 1", "Goblet squat", null)).toEqual(answer);
    await fetchSwapOptions(apiFetch, "plan 1", "Goblet squat", "lower back");

    expect(apiFetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/dashboard/plans/plan%201/swaps?exercise=Goblet+squat",
      "/api/dashboard/plans/plan%201/swaps?exercise=Goblet+squat&area=lower+back"
    ]);
  });
});

describe("swapExercise and undoExerciseSwap", () => {
  test("a swap that names an area sends it, after the two exercises", async () => {
    const apiFetch = vi.fn(async () => respond({ plan: PLAN }));

    await swapExercise(apiFetch, "plan-1", { from: "Goblet squat", to: "Box squat", area: "knee" });

    expect(apiFetch.mock.calls[0][1].body).toBe(
      '{"from":"Goblet squat","to":"Box squat","area":"knee"}'
    );
  });

  test("post the swap and the undo, and return the plan the server answers", async () => {
    const apiFetch = vi.fn(async () => respond({ plan: PLAN }));

    expect(
      await swapExercise(apiFetch, "plan 1", { from: "Goblet squat", to: "Sumo squat", area: null })
    ).toEqual(PLAN);
    expect(await undoExerciseSwap(apiFetch, "plan 1", "Sumo squat")).toEqual(PLAN);

    expect(apiFetch.mock.calls).toEqual([
      [
        "/api/dashboard/plans/plan%201/swaps",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: "Goblet squat", to: "Sumo squat", area: null })
        }
      ],
      [
        "/api/dashboard/plans/plan%201/swaps/undo",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Sumo squat" })
        }
      ]
    ]);
  });
});

describe("a refused request", () => {
  test("throws the server's message", async () => {
    const apiFetch = vi.fn(async () =>
      respond({ error: "The plan has changed. Reload it and try again." }, false)
    );
    await expect(
      swapExercise(apiFetch, "plan-1", { from: "a", to: "b", area: null })
    ).rejects.toThrow("The plan has changed. Reload it and try again.");
  });

  test.each([
    [
      "the alternatives",
      (apiFetch) => fetchSwapOptions(apiFetch, "p", "a", null),
      "Could not load the alternatives. Try again."
    ],
    [
      "a swap",
      (apiFetch) => swapExercise(apiFetch, "p", { from: "a", to: "b", area: null }),
      "Could not swap that exercise. Try again."
    ],
    [
      "an undo",
      (apiFetch) => undoExerciseSwap(apiFetch, "p", "a"),
      "Could not undo that swap. Try again."
    ]
  ])("throws a default for %s when the body says nothing", async (_label, run, message) => {
    const apiFetch = vi.fn(async () => ({
      ok: false,
      json: async () => Promise.reject(new Error("not JSON"))
    }));
    await expect(run(apiFetch)).rejects.toThrow(message);
  });
});
