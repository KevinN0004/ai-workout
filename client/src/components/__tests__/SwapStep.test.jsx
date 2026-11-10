/**
 * Pins the swap step (roadmap C4): an exercise's alternatives under the plan's
 * rules, an area that narrows them, the swap, and every way it can fail.
 * apiFetch, the network boundary, is stubbed.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import SwapStep from "../SwapStep";

const AREAS = ["lower back", "back", "knee", "shoulder", "hip", "wrist", "elbow"];
const SUMO = {
  name: "Dumbbell sumo squat",
  needs: ["dumbbell"],
  regressed: false,
  area: null,
  cue: null
};
const BODYWEIGHT = { name: "Bodyweight squat", needs: [], regressed: false, area: null, cue: null };
const BOX = {
  name: "Box squat to a chair",
  needs: [],
  regressed: true,
  area: "knee",
  cue: "sit back to a box at a height that stays comfortable"
};
const PLAN = { id: "plan-1", payload: { days: [] } };

const respond = (body, ok = true) => ({ ok, json: async () => body });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

// Answers the alternatives by the area asked about, and a swap with PLAN.
const fetchFor = (byArea = { "": [SUMO, BODYWEIGHT], knee: [BOX] }) =>
  vi.fn(async (path, options) => {
    if (options?.method === "POST") return respond({ plan: PLAN });
    const area = new URL(path, "http://x").searchParams.get("area") ?? "";
    return respond({
      exercise: "Dumbbell goblet squat",
      area: area || null,
      areas: AREAS,
      alternatives: byArea[area]
    });
  });

const renderStep = (apiFetch = fetchFor()) => {
  const handlers = { onSwapped: vi.fn(), onBack: vi.fn() };
  render(
    <SwapStep apiFetch={apiFetch} planId="plan-1" exercise="Dumbbell goblet squat" {...handlers} />
  );
  return { apiFetch, ...handlers };
};

const options = () => within(screen.getByRole("list", { name: "Alternatives" }));

describe("SwapStep", () => {
  test("lists the alternatives with what each needs", async () => {
    renderStep();

    expect(screen.getByRole("heading", { name: "Swap Dumbbell goblet squat" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^Dumbbell sumo squat/ })).toHaveTextContent(
      "Needs dumbbell"
    );
    expect(options().getByRole("button", { name: /^Bodyweight squat/ })).toHaveTextContent(
      "No equipment"
    );
  });

  test("says when it is finding the alternatives", async () => {
    const pending = deferred();
    renderStep(vi.fn(() => pending.promise));

    expect(screen.getByText("Finding alternatives…")).toBeInTheDocument();
    await act(async () => pending.resolve(respond({ areas: AREAS, alternatives: [SUMO] })));
    expect(screen.queryByText("Finding alternatives…")).toBeNull();
  });

  test("an area asks again, shows a regression's cue, and a second tap clears it", async () => {
    const { apiFetch } = renderStep();
    await screen.findByRole("button", { name: /^Dumbbell sumo squat/ });

    const knee = screen.getByRole("button", { name: "Knee" });
    fireEvent.click(knee);
    expect(knee).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("button", { name: /^Box squat to a chair/ })).toHaveTextContent(
      "Knee: sit back to a box at a height that stays comfortable"
    );

    fireEvent.click(knee);
    expect(knee).toHaveAttribute("aria-pressed", "false");
    await screen.findByRole("button", { name: /^Dumbbell sumo squat/ });
    expect(apiFetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/dashboard/plans/plan-1/swaps?exercise=Dumbbell+goblet+squat",
      "/api/dashboard/plans/plan-1/swaps?exercise=Dumbbell+goblet+squat&area=knee",
      "/api/dashboard/plans/plan-1/swaps?exercise=Dumbbell+goblet+squat"
    ]);
  });

  test("an answer for an area since changed is dropped", async () => {
    const first = deferred();
    const apiFetch = vi
      .fn()
      .mockImplementationOnce(async () => respond({ areas: AREAS, alternatives: [SUMO] }))
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(async () => respond({ areas: AREAS, alternatives: [BODYWEIGHT] }));
    renderStep(apiFetch);
    await screen.findByRole("button", { name: /^Dumbbell sumo squat/ });

    fireEvent.click(screen.getByRole("button", { name: "Knee" }));
    fireEvent.click(screen.getByRole("button", { name: "Knee" }));
    await screen.findByRole("button", { name: /^Bodyweight squat/ });
    await act(async () => first.resolve(respond({ areas: AREAS, alternatives: [BOX] })));

    expect(screen.queryByRole("button", { name: /^Box squat/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Bodyweight squat/ })).toBeInTheDocument();
  });

  test("a failure for an area since changed is dropped too", async () => {
    let fail;
    const late = new Promise((_resolve, reject) => {
      fail = reject;
    });
    const apiFetch = vi
      .fn()
      .mockImplementationOnce(async () => respond({ areas: AREAS, alternatives: [SUMO] }))
      .mockImplementationOnce(() => late)
      .mockImplementationOnce(async () => respond({ areas: AREAS, alternatives: [BODYWEIGHT] }));
    renderStep(apiFetch);
    await screen.findByRole("button", { name: /^Dumbbell sumo squat/ });

    fireEvent.click(screen.getByRole("button", { name: "Knee" }));
    fireEvent.click(screen.getByRole("button", { name: "Knee" }));
    await screen.findByRole("button", { name: /^Bodyweight squat/ });
    await act(async () => fail(new Error("Could not load the alternatives. Try again.")));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("choosing an alternative swaps it, with the area named, and hands back the plan", async () => {
    const { apiFetch, onSwapped } = renderStep();
    await screen.findByRole("button", { name: /^Dumbbell sumo squat/ });
    fireEvent.click(screen.getByRole("button", { name: "Knee" }));

    fireEvent.click(await screen.findByRole("button", { name: /^Box squat to a chair/ }));

    await waitFor(() => expect(onSwapped).toHaveBeenCalledWith(PLAN, "Box squat to a chair"));
    const [path, request] = apiFetch.mock.calls.at(-1);
    expect(path).toBe("/api/dashboard/plans/plan-1/swaps");
    expect(JSON.parse(request.body)).toEqual({
      from: "Dumbbell goblet squat",
      to: "Box squat to a chair",
      area: "knee"
    });
  });

  test("the alternatives wait while a swap is sent", async () => {
    const sent = deferred();
    const apiFetch = vi.fn(async (path, options) =>
      options?.method === "POST"
        ? sent.promise
        : respond({ areas: AREAS, alternatives: [SUMO, BODYWEIGHT] })
    );
    const { onSwapped } = renderStep(apiFetch);

    fireEvent.click(await screen.findByRole("button", { name: /^Dumbbell sumo squat/ }));

    expect(screen.getByRole("button", { name: /^Bodyweight squat/ })).toBeDisabled();
    await act(async () => sent.resolve(respond({ plan: PLAN })));
    expect(onSwapped).toHaveBeenCalledWith(PLAN, "Dumbbell sumo squat");
  });

  test("says when nothing else fits", async () => {
    renderStep(fetchFor({ "": [] }));
    expect(
      await screen.findByText("Nothing else in the library fits this plan.")
    ).toBeInTheDocument();
  });

  test("a failed read says why", async () => {
    renderStep(vi.fn(async () => respond({ error: "That exercise is not in this plan." }, false)));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That exercise is not in this plan."
    );
  });

  test("a failed swap says why, and leaves the alternatives to try again", async () => {
    const swapFails = vi.fn(async (path, options) =>
      options?.method === "POST"
        ? respond({ error: "The plan has changed. Reload it and try again." }, false)
        : respond({ areas: AREAS, alternatives: [SUMO] })
    );
    const { onSwapped } = renderStep(swapFails);
    fireEvent.click(await screen.findByRole("button", { name: /^Dumbbell sumo squat/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The plan has changed. Reload it and try again."
    );
    expect(onSwapped).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Dumbbell sumo squat/ })).toBeEnabled();
  });

  test("Back goes back", async () => {
    const { onBack } = renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    await screen.findByRole("button", { name: /^Dumbbell sumo squat/ });
  });
});
