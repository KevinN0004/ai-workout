import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useHomeStageFlow from "./useHomeStageFlow";

// I had written this off as animation orchestration unlikely to hide a
// correctness bug. It is not: there is a stage machine underneath, and it
// decides three things that are observably right or wrong -- which direction
// the animation plays, when the personal form is reset, and whether motion is
// skipped for a visitor who asked for reduced motion.
//
// The morph animation itself is left alone. It measures real element rects,
// which jsdom cannot provide, so the tests drive the paths that bypass it.

const stubMatchMedia = (reduced) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query) => ({
      matches: reduced,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  );
};

const render = (overrides = {}) => {
  const onResetPersonalFlow = vi.fn();
  const result = renderHook(() =>
    useHomeStageFlow({
      onResetPersonalFlow,
      samplePlanLength: 3,
      personalMode: "basic",
      ...overrides
    })
  );
  return { ...result, onResetPersonalFlow };
};

beforeEach(() => {
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useHomeStageFlow", () => {
  test("starts on the intro stage moving forward", () => {
    const { result } = render();

    expect(result.current.homeStage).toBe("intro");
    expect(result.current.stageDirection).toBe("forward");
  });

  describe("goToStage direction", () => {
    // Order is intro < preview < personal < visualizer < workout. Getting this
    // backwards plays the transition the wrong way, which looks like a bug to a
    // user and to nothing else.
    test("moves forward when advancing through the order", () => {
      const { result } = render();

      act(() => result.current.goToStage("personal"));
      expect(result.current.homeStage).toBe("personal");
      expect(result.current.stageDirection).toBe("forward");

      act(() => result.current.goToStage("workout"));
      expect(result.current.stageDirection).toBe("forward");
    });

    test("moves backward when returning to an earlier stage", () => {
      const { result } = render();

      act(() => result.current.goToStage("workout"));
      act(() => result.current.goToStage("personal"));

      expect(result.current.homeStage).toBe("personal");
      expect(result.current.stageDirection).toBe("backward");
    });

    test("treats an unknown stage as position zero", () => {
      const { result } = render();

      act(() => result.current.goToStage("visualizer"));
      act(() => result.current.goToStage("nonsense"));

      expect(result.current.stageDirection).toBe("backward");
    });
  });

  describe("goToStage side effects", () => {
    test("resets the personal form when returning to intro", () => {
      const { result, onResetPersonalFlow } = render();

      act(() => result.current.goToStage("personal"));
      expect(onResetPersonalFlow).not.toHaveBeenCalled();

      act(() => result.current.goToStage("intro"));
      expect(onResetPersonalFlow).toHaveBeenCalledTimes(1);
    });

    test("does nothing when asked for the stage already showing", () => {
      const { result, onResetPersonalFlow } = render();

      act(() => result.current.goToStage("intro"));

      expect(result.current.homeStage).toBe("intro");
      // Re-entering intro must not re-clear a form the user is looking at.
      expect(onResetPersonalFlow).not.toHaveBeenCalled();
    });

    test("tolerates a missing reset callback", () => {
      const { result } = renderHook(() =>
        useHomeStageFlow({ samplePlanLength: 3, personalMode: "basic" })
      );

      expect(() => act(() => result.current.goToStage("intro"))).not.toThrow();
    });
  });

  describe("reduced motion", () => {
    test("skips the morph and moves straight to the stage", () => {
      stubMatchMedia(true);
      const { result } = render();

      act(() => result.current.transitionToStageFromTrigger("personal"));

      expect(result.current.homeStage).toBe("personal");
      expect(result.current.suppressStageEnter).toBe(true);
    });

    test("still resets the personal form on the way back to intro", () => {
      stubMatchMedia(true);
      const { result, onResetPersonalFlow } = render();

      act(() => result.current.transitionToStageFromTrigger("personal"));
      act(() => result.current.transitionToStageFromTrigger("intro"));

      expect(result.current.homeStage).toBe("intro");
      expect(onResetPersonalFlow).toHaveBeenCalledTimes(1);
    });
  });

  describe("transitionToStageFromTrigger guards", () => {
    test("ignores a request for the stage already showing", () => {
      const { result } = render();

      act(() => result.current.transitionToStageFromTrigger("intro"));

      expect(result.current.homeStage).toBe("intro");
    });

    // Without a measurable source element the morph cannot run, so the hook
    // falls back to an immediate stage change rather than stalling.
    test("falls back to an immediate change when no element can be measured", () => {
      const { result } = render();

      act(() => result.current.transitionToStageFromTrigger("personal"));

      expect(result.current.homeStage).toBe("personal");
      expect(result.current.suppressStageEnter).toBe(true);
    });
  });

  test("exposes the refs the home page attaches to its panels", () => {
    const { result } = render();

    [
      "visualPanelRef",
      "introPanelRef",
      "personalPanelRef",
      "workoutPanelRef",
      "workoutShellRef"
    ].forEach((refName) => {
      expect(result.current[refName]).toHaveProperty("current");
    });
  });
});
