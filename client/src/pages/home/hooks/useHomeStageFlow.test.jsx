import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useHomeStageFlow from "./useHomeStageFlow";

// animejs is the animation boundary, and the numbers handed to it are the
// whole output of the morph arithmetic. Recording them turns "it did not
// throw" into an assertion about where the morph actually travels. The real
// library still runs underneath -- only the call is observed.
const anime = vi.hoisted(() => ({ adds: [] }));

vi.mock("animejs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createTimeline: (...args) => {
      const timeline = actual.createTimeline(...args);
      const add = timeline.add.bind(timeline);
      timeline.add = (target, params, position) => {
        anime.adds.push({ target, params });
        return add(target, params, position);
      };
      return timeline;
    }
  };
});

// I had written this off as animation orchestration unlikely to hide a
// correctness bug. It is not: there is a stage machine underneath, and it
// decides three things that are observably right or wrong -- which direction
// the animation plays, when the personal form is reset, and whether motion is
// skipped for a visitor who asked for reduced motion.
//
// This file used to say the morph itself was out of reach, because it measures
// real element rects and jsdom provides none. That was true of jsdom's
// defaults and not of the hook: layout is a boundary like any other. Stubbing
// `getBoundingClientRect` on the panels, and recording what the hook hands to
// animejs, puts the whole morph under test -- see "the stage morph" below.

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
  anime.adds.length = 0;
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

  describe("the intro transition", () => {
    // Every existing test leaves the panel refs empty, so onGetStarted always
    // took its "nothing to measure" escape hatch. Attaching elements drives
    // the real path: it flips into a transition and schedules the hand-off to
    // the personal stage. jsdom reports zero-sized rects, but nothing here
    // guards on rect size -- only on the refs existing -- so the state machine
    // runs without any stubbing at all. These cover the machine; the geometry
    // is covered under "the stage morph".
    const attachPanels = (result) => {
      const panel = document.createElement("div");
      const title = document.createElement("h1");
      const button = document.createElement("button");
      document.body.append(panel, title, button);
      result.current.introPanelRef.current = panel;
      result.current.introTitleRef.current = title;
      result.current.introButtonRef.current = button;
      return () => {
        panel.remove();
        title.remove();
        button.remove();
      };
    };

    test("enters a transition instead of jumping straight to personal", () => {
      const { result } = render();
      const cleanup = attachPanels(result);
      try {
        act(() => result.current.onGetStarted());

        expect(result.current.isIntroTransitioning).toBe(true);
        // The stage must not change yet -- the intro is still animating out.
        expect(result.current.homeStage).toBe("intro");
      } finally {
        cleanup();
      }
    });

    test("hands off to the personal stage once the animation window elapses", () => {
      vi.useFakeTimers();
      const { result } = render();
      const cleanup = attachPanels(result);
      try {
        act(() => result.current.onGetStarted());
        expect(result.current.homeStage).toBe("intro");

        act(() => vi.advanceTimersByTime(1460));

        expect(result.current.homeStage).toBe("personal");
        expect(result.current.isIntroTransitioning).toBe(false);
      } finally {
        cleanup();
        vi.useRealTimers();
      }
    });

    test("a second press while transitioning is ignored", () => {
      vi.useFakeTimers();
      const { result } = render();
      const cleanup = attachPanels(result);
      try {
        act(() => result.current.onGetStarted());
        act(() => result.current.onGetStarted());
        act(() => vi.advanceTimersByTime(1460));

        // One hand-off, not two -- a double press must not skip a stage.
        expect(result.current.homeStage).toBe("personal");
      } finally {
        cleanup();
        vi.useRealTimers();
      }
    });

    test("unmounting mid-transition cancels the pending hand-off", () => {
      vi.useFakeTimers();
      const { result, unmount } = render();
      const cleanup = attachPanels(result);
      try {
        act(() => result.current.onGetStarted());
        unmount();

        // A surviving timer would call setState on an unmounted hook.
        expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        cleanup();
        vi.useRealTimers();
      }
    });
  });

  describe("onGetStarted", () => {
    const panels = [];

    const attachIntro = (result, { title = true, button = true, inPage = false } = {}) => {
      const panel = document.createElement("div");
      if (inPage) {
        const page = document.createElement("div");
        page.className = "page";
        page.style.paddingLeft = "48px";
        page.style.paddingRight = "48px";
        page.appendChild(panel);
        document.body.appendChild(page);
        panels.push(page);
      } else {
        document.body.appendChild(panel);
        panels.push(panel);
      }
      result.current.introPanelRef.current = panel;
      if (title) {
        const el = document.createElement("h1");
        document.body.appendChild(el);
        panels.push(el);
        result.current.introTitleRef.current = el;
      }
      if (button) {
        const el = document.createElement("button");
        document.body.appendChild(el);
        panels.push(el);
        result.current.introButtonRef.current = el;
      }
      return panel;
    };

    afterEach(() => {
      panels.splice(0).forEach((el) => el.remove());
    });

    test("a visitor who asked for reduced motion skips straight to personal", () => {
      // The existing reduced-motion tests go through the stage trigger. This
      // is the other entry point, and it has its own check.
      stubMatchMedia(true);
      const { result } = render();
      attachIntro(result);

      act(() => result.current.onGetStarted());

      expect(result.current.homeStage).toBe("personal");
      expect(result.current.isIntroTransitioning).toBe(false);
      expect(result.current.suppressStageEnter).toBe(true);
    });

    test.each([
      ["the title", { title: false }],
      ["the button", { button: false }]
    ])("moves without animating when %s is not mounted", (_label, missing) => {
      const { result } = render();
      attachIntro(result, missing);

      act(() => result.current.onGetStarted());

      expect(result.current.homeStage).toBe("personal");
      expect(result.current.isIntroTransitioning).toBe(false);
    });

    test("measures the page padding from the panel's own page ancestor", () => {
      vi.useFakeTimers();
      const { result } = render();
      attachIntro(result, { inPage: true });
      try {
        act(() => result.current.onGetStarted());
        expect(result.current.isIntroTransitioning).toBe(true);

        act(() => vi.advanceTimersByTime(1460));
        expect(result.current.homeStage).toBe("personal");
      } finally {
        vi.useRealTimers();
      }
    });

    test("two presses inside one tick still hand off exactly once", () => {
      // The in-flight guard reads `isIntroTransitioning` from the render
      // closure, so two synchronous calls both see it false and both reach the
      // scheduling. Mutation testing showed the `clearTimeout` above that is
      // belt-and-braces rather than load-bearing: both timeouts are armed for
      // the same deadline and the callback is idempotent, so dropping the
      // clear changes nothing observable. What this pins is the idempotence --
      // a double press must not skip a stage.
      vi.useFakeTimers();
      const { result } = render();
      attachIntro(result);
      try {
        act(() => {
          result.current.onGetStarted();
          result.current.onGetStarted();
        });

        act(() => vi.advanceTimersByTime(1460));
        expect(result.current.homeStage).toBe("personal");

        // A second armed hand-off would fire here and re-enter personal from
        // wherever the visitor had moved on to.
        act(() => result.current.goToStage("workout"));
        act(() => vi.advanceTimersByTime(5000));
        expect(result.current.homeStage).toBe("workout");
      } finally {
        vi.useRealTimers();
      }
    });

    test("a second run clears the hand-off the first one left behind", () => {
      // The timeout ref is not nulled when it fires, so pressing through the
      // intro twice in a session reaches this with a stale id. Failing to
      // clear it would fire an old hand-off into the new transition.
      vi.useFakeTimers();
      const { result } = render();
      attachIntro(result);
      try {
        act(() => result.current.onGetStarted());
        act(() => vi.advanceTimersByTime(1460));
        expect(result.current.homeStage).toBe("personal");

        act(() => result.current.goToStage("intro"));
        act(() => result.current.onGetStarted());
        act(() => vi.advanceTimersByTime(1460));

        expect(result.current.homeStage).toBe("personal");
        // A stale hand-off would fire here and drag the stage back.
        act(() => vi.advanceTimersByTime(5000));
        expect(result.current.homeStage).toBe("personal");
        expect(result.current.isIntroTransitioning).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Everything above drives the paths that bypass the morph. These drive the
  // morph itself.
  //
  // The earlier comment said the geometry "cannot be" asserted because jsdom
  // provides no layout. That was true of jsdom's defaults and not of the hook:
  // layout is a boundary like any other, and stubbing `getBoundingClientRect`
  // on the panels the hook reads is the same move as stubbing `fetch`. What
  // comes back is fake; the arithmetic on top of it, the retry budget and the
  // teardown are the ones that ship.
  describe("the stage morph", () => {
    const withRect = (el, { left = 0, top = 0, width = 640, height = 400 } = {}) => {
      el.getBoundingClientRect = () => ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({})
      });
      return el;
    };

    const attached = [];

    const attach = (result, refName, rect) => {
      const el = document.createElement("div");
      el.className = refName;
      document.body.appendChild(el);
      attached.push(el);
      if (rect !== null) withRect(el, rect);
      result.current[refName].current = el;
      return el;
    };

    // The clone is a deep copy, class attribute included, so it cannot be told
    // from its source by selector. The fixed positioning and the stacking
    // order are what the hook puts on the clone and only on the clone.
    const clones = () =>
      Array.from(document.body.children).filter(
        (el) => el.style?.position === "fixed" && el.style?.zIndex === "40"
      );

    // Two nested frames before the timeline starts, plus one per retry.
    const frames = (count) => {
      for (let i = 0; i < count; i += 1) act(() => vi.advanceTimersByTime(16));
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      attached.splice(0).forEach((el) => el.remove());
      document.body.querySelectorAll("div").forEach((el) => el.remove());
      vi.useRealTimers();
    });

    const startMorph = (
      result,
      { from = "intro", to = "personal", sourceRect, targetRect } = {}
    ) => {
      attach(result, `${from}PanelRef`, sourceRect);
      attach(result, `${to}PanelRef`, targetRect);
      if (from !== "intro") act(() => result.current.goToStage(from));
      act(() => result.current.transitionToStageFromTrigger(to));
    };

    test("clones the source panel over the rect it was occupying", () => {
      const { result } = render();
      startMorph(result, { sourceRect: { left: 40, top: 80, width: 600, height: 320 } });

      const clone = clones().at(-1);
      expect(clone).toBeTruthy();
      expect(clone.style.position).toBe("fixed");
      expect(clone.style.left).toBe("40px");
      expect(clone.style.top).toBe("80px");
      expect(clone.style.width).toBe("600px");
      expect(clone.style.height).toBe("320px");
    });

    test("the clone is inert, so it cannot swallow a click mid-flight", () => {
      const { result } = render();
      startMorph(result);

      expect(clones().at(-1).style.pointerEvents).toBe("none");
    });

    test("the clone inherits the panel's own chrome rather than a hardcoded default", () => {
      // The hardcoded values are a fallback for an unstyled panel. When the
      // panel does carry a radius and colour, the clone has to start from
      // those or the morph opens with a visible jump.
      const { result } = render();
      const source = attach(result, "introPanelRef", { width: 600, height: 320 });
      source.style.borderRadius = "8px";
      source.style.borderColor = "rgb(1, 2, 3)";
      source.style.color = "rgb(4, 5, 6)";
      attach(result, "personalPanelRef", { width: 900, height: 600 });

      act(() => result.current.transitionToStageFromTrigger("personal"));

      const clone = clones().at(-1);
      expect(clone.style.borderRadius).toBe("8px");
      expect(clone.style.borderColor).toBe("rgb(1, 2, 3)");
      expect(clone.style.color).toBe("rgb(4, 5, 6)");
    });

    test("an unstyled panel falls back to the default radius", () => {
      // Only the radius is asserted. A computed `color` is never empty -- an
      // unstyled element reports the initial value, `canvastext` here -- so
      // that fallback guards a missing style object rather than a blank one.
      const { result } = render();
      startMorph(result);

      expect(clones().at(-1).style.borderRadius).toBe("24px");
    });

    test("darkens the fill for the visualizer-to-workout hand-off", () => {
      // That pairing is the only one whose incoming panel is already dark;
      // the lighter fill reads as a flash against it.
      const { result } = render();
      attach(result, "visualPanelRef", { width: 600, height: 400 });
      attach(result, "workoutShellRef", { width: 600, height: 400 });
      act(() => result.current.goToStage("visualizer"));
      act(() => result.current.transitionToStageFromTrigger("workout"));

      // The CSSOM drops a fully opaque alpha, so `rgba(14, 14, 14, 1)` in the
      // source reads back as `rgb(14, 14, 14)` here and in a browser alike.
      expect(clones().at(-1).style.backgroundColor).toBe("rgb(14, 14, 14)");
    });

    test("uses the standard fill for every other hand-off", () => {
      const { result } = render();
      startMorph(result);

      expect(clones().at(-1).style.backgroundColor).toBe("rgb(28, 28, 28)");
    });

    test("changes the stage at once rather than waiting for the animation", () => {
      // The morph is decoration over a stage change that has already happened;
      // deferring the change would leave the real panel a frame behind.
      const { result } = render();
      startMorph(result);

      expect(result.current.homeStage).toBe("personal");
      expect(result.current.isStageTransitioning).toBe(true);
      expect(result.current.suppressStageEnter).toBe(true);
    });

    test("clears the transition flag when the animation window closes", () => {
      const { result } = render();
      startMorph(result);
      frames(2);
      expect(result.current.isStageTransitioning).toBe(true);

      act(() => vi.advanceTimersByTime(1400));

      expect(result.current.isStageTransitioning).toBe(false);
      expect(clones().at(-1).style.opacity).toBe("0");
    });

    test("removes the clone once the crossfade has finished", () => {
      const { result } = render();
      startMorph(result);
      frames(2);

      const before = clones().length;
      act(() => vi.advanceTimersByTime(1400 + 220 + 20));

      expect(clones().length).toBe(before - 1);
    });

    test("waits for the incoming panel before measuring it", () => {
      // The panel mounts a frame or two after the stage changes, so measuring
      // it immediately would read a zero rect and size the morph to nothing.
      const { result } = render();
      startMorph(result, { targetRect: null });
      frames(2);

      // Still retrying: the reveal timer has not been scheduled yet.
      expect(result.current.isStageTransitioning).toBe(true);
      act(() => vi.advanceTimersByTime(1400));
      expect(result.current.isStageTransitioning).toBe(true);
    });

    test("gives up after eight frames and falls back to the preset size", () => {
      const { result } = render();
      startMorph(result, { targetRect: null });

      frames(12);
      act(() => vi.advanceTimersByTime(1400));

      expect(result.current.isStageTransitioning).toBe(false);
    });

    test("a second transition while one is in flight is refused", () => {
      const { result } = render();
      startMorph(result);
      attach(result, "visualPanelRef", { width: 600, height: 400 });

      act(() => result.current.transitionToStageFromTrigger("visualizer"));

      // Not queued and not stacked -- skipping a stage mid-morph would leave
      // the clone animating towards a panel that is no longer on screen.
      expect(result.current.homeStage).toBe("personal");
      expect(clones()).toHaveLength(1);
      expect(clones()[0].className).toBe("introPanelRef");
    });

    test("a transition during the crossfade replaces the outgoing clone", () => {
      // At 1400ms the flag is cleared and the clone is still fading out, so a
      // visitor really can start the next one here. The old clone must go.
      const { result } = render();
      startMorph(result);
      frames(2);
      act(() => vi.advanceTimersByTime(1400));
      expect(result.current.isStageTransitioning).toBe(false);
      expect(clones()).toHaveLength(1);

      attach(result, "visualPanelRef", { width: 600, height: 400 });
      act(() => result.current.transitionToStageFromTrigger("visualizer"));

      expect(clones()).toHaveLength(1);
      expect(clones()[0].className).toBe("personalPanelRef");
      expect(result.current.homeStage).toBe("visualizer");
    });

    test("unmounting mid-morph takes the clone with it and leaves no timers", () => {
      const { result, unmount } = render();
      startMorph(result);
      frames(2);
      expect(clones()).toHaveLength(1);

      unmount();

      expect(clones()).toHaveLength(0);
      expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
      expect(vi.getTimerCount()).toBe(0);
    });

    test("is ignored while the intro transition is still running", () => {
      const { result } = render();
      attach(result, "introPanelRef", { width: 600, height: 320 });
      attach(result, "introTitleRef", { width: 400, height: 60 });
      attach(result, "introButtonRef", { width: 200, height: 48 });

      act(() => result.current.onGetStarted());
      expect(result.current.isIntroTransitioning).toBe(true);

      act(() => result.current.transitionToStageFromTrigger("visualizer"));

      expect(result.current.homeStage).toBe("intro");
    });

    describe("the geometry it reads off the page", () => {
      // These paths only run when the real page chrome is mounted. Every
      // earlier test leaves the document bare, so each takes the `: null`
      // side and the hook falls back to guesses about the viewport.
      const buildPage = ({ withContent = true } = {}) => {
        const page = document.createElement("div");
        page.className = "home-page";
        page.style.paddingLeft = "60px";
        page.style.paddingRight = "60px";
        if (withContent) {
          const content = document.createElement("div");
          content.className = "content";
          withRect(content, { left: 100, top: 50, width: 800, height: 600 });
          page.appendChild(content);
        }
        document.body.appendChild(page);
        attached.push(page);
        return page;
      };

      test("measures the page's padding rather than assuming it", () => {
        buildPage();
        const { result } = render();
        startMorph(result, { targetRect: null });
        frames(12);
        act(() => vi.advanceTimersByTime(1400));

        expect(result.current.isStageTransitioning).toBe(false);
        expect(result.current.homeStage).toBe("personal");
      });

      test("centres the morph on the content area when there is one", () => {
        buildPage();
        const { result } = render();
        startMorph(result, { targetRect: null });

        expect(clones()).toHaveLength(1);
        expect(() => frames(12)).not.toThrow();
      });

      test("falls back to the viewport centre when the content is not mounted", () => {
        buildPage({ withContent: false });
        const { result } = render();
        startMorph(result, { targetRect: null });

        expect(() => frames(12)).not.toThrow();
        expect(result.current.homeStage).toBe("personal");
      });
    });

    test("fades the cloned contents out so only the shell morphs", () => {
      // A deep clone brings the panel's text with it; left visible it scales
      // with the box and smears.
      const { result } = render();
      const source = attach(result, "introPanelRef", { width: 600, height: 320 });
      source.appendChild(document.createElement("h1"));
      source.appendChild(document.createElement("p"));
      attach(result, "personalPanelRef", { width: 900, height: 600 });

      act(() => result.current.transitionToStageFromTrigger("personal"));
      frames(2);

      expect(clones()[0].children).toHaveLength(2);
      expect(() => act(() => vi.advanceTimersByTime(1640))).not.toThrow();
    });

    test("morphing back to intro targets the transparent panel treatment", () => {
      // Intro has no panel chrome, so the morph has to land on a transparent
      // box rather than the grey one every other stage uses.
      const { result } = render();
      attach(result, "personalPanelRef", { width: 900, height: 600 });
      attach(result, "introPanelRef", { width: 600, height: 320 });
      act(() => result.current.goToStage("personal"));

      act(() => result.current.transitionToStageFromTrigger("intro"));
      frames(2);
      act(() => vi.advanceTimersByTime(1400));

      expect(result.current.homeStage).toBe("intro");
      expect(result.current.isStageTransitioning).toBe(false);
    });

    test("falls back to the workout panel when the shell is not mounted", () => {
      const { result } = render();
      attach(result, "introPanelRef", { width: 600, height: 320 });
      attach(result, "workoutPanelRef", { width: 900, height: 380 });

      act(() => result.current.transitionToStageFromTrigger("workout"));
      frames(2);
      act(() => vi.advanceTimersByTime(1400));

      expect(result.current.homeStage).toBe("workout");
      expect(result.current.isStageTransitioning).toBe(false);
    });

    test("an unknown stage still gets a preset to morph towards", () => {
      const { result } = render();
      attach(result, "introPanelRef", { width: 600, height: 320 });

      act(() => result.current.transitionToStageFromTrigger("nonsense"));
      frames(12);

      expect(result.current.homeStage).toBe("nonsense");
      expect(() => act(() => vi.advanceTimersByTime(1640))).not.toThrow();
    });

    // What the morph animates towards. Recorded off the animejs call, so these
    // are the numbers the animation actually receives.
    const morphOf = (clone) => anime.adds.find((entry) => entry.target === clone)?.params;

    describe("where the morph travels", () => {
      test("to the size the incoming panel reports, once it can be measured", () => {
        const { result } = render();
        attach(result, "introPanelRef", { left: 40, top: 80, width: 600, height: 320 });
        attach(result, "personalPanelRef", { left: 10, top: 20, width: 900, height: 600 });

        act(() => result.current.transitionToStageFromTrigger("personal"));
        const clone = clones().at(-1);
        frames(2);

        const params = morphOf(clone);
        expect(params.width).toEqual(["600px", "900px"]);
        expect(params.height).toEqual(["320px", "600px"]);
      });

      test("translating from the source rect to the target's centre", () => {
        // Source 600x320 at (40,80); target 900x600 centred at (460,320), so
        // its top-left is (10,20) and the clone has to travel (-30,-60).
        const { result } = render();
        attach(result, "introPanelRef", { left: 40, top: 80, width: 600, height: 320 });
        attach(result, "personalPanelRef", { left: 10, top: 20, width: 900, height: 600 });

        act(() => result.current.transitionToStageFromTrigger("personal"));
        const clone = clones().at(-1);
        frames(2);

        expect(morphOf(clone).translateX).toEqual([0, -30]);
        expect(morphOf(clone).translateY).toEqual([0, -60]);
      });

      test("to the remembered size when the incoming panel never measures", () => {
        // This is what the metrics cache is for. Without it the morph animates
        // to a preset guess and the panel snaps to its real size on arrival.
        const { result } = render();
        attach(result, "introPanelRef", { left: 0, top: 0, width: 600, height: 320 });
        const personal = attach(result, "personalPanelRef", {
          left: 30,
          top: 40,
          width: 880,
          height: 640
        });
        act(() => result.current.goToStage("personal"));
        frames(2);

        // The panel goes away, so the next morph has only the remembered size.
        act(() => result.current.goToStage("intro"));
        personal.getBoundingClientRect = () => ({
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({})
        });

        act(() => result.current.transitionToStageFromTrigger("personal"));
        const clone = clones().at(-1);
        frames(12);

        expect(morphOf(clone).width).toEqual(["600px", "880px"]);
        expect(morphOf(clone).height).toEqual(["320px", "640px"]);
      });

      test("to the twin's remembered size when the twin itself has gone", () => {
        // The twin is measured on a frame and cached. If it later collapses or
        // unmounts, the cache is the only record of how big the workout stage
        // is -- measuring it live at that point returns nothing.
        const { result } = render();
        attach(result, "introPanelRef", { left: 0, top: 0, width: 600, height: 320 });
        const twin = attach(result, "workoutMeasureShellRef", {
          left: 20,
          top: 40,
          width: 940,
          height: 360
        });
        frames(2);

        twin.getBoundingClientRect = () => ({
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({})
        });
        attach(result, "workoutShellRef", null);

        act(() => result.current.transitionToStageFromTrigger("workout"));
        const clone = clones().at(-1);
        frames(12);

        expect(morphOf(clone).width).toEqual(["600px", "940px"]);
        expect(morphOf(clone).height).toEqual(["320px", "360px"]);
      });

      test("to the off-screen twin's size for visualizer to workout", () => {
        const { result } = render();
        attach(result, "visualPanelRef", { left: 0, top: 0, width: 880, height: 700 });
        attach(result, "workoutMeasureShellRef", { left: 20, top: 40, width: 940, height: 360 });
        attach(result, "workoutShellRef", null);
        act(() => result.current.goToStage("visualizer"));

        act(() => result.current.transitionToStageFromTrigger("workout"));
        const clone = clones().at(-1);
        frames(12);

        expect(morphOf(clone).width).toEqual(["880px", "940px"]);
        expect(morphOf(clone).height).toEqual(["700px", "360px"]);
      });
    });

    describe("the measurements it remembers", () => {
      test("a measured stage becomes the target size for a later morph", () => {
        // Without this the morph animates to a preset guess and then snaps.
        const { result } = render();
        attach(result, "introPanelRef", { left: 10, top: 20, width: 500, height: 300 });
        frames(1);

        attach(result, "personalPanelRef", null);
        act(() => result.current.transitionToStageFromTrigger("personal"));
        frames(12);

        expect(() => act(() => vi.advanceTimersByTime(2000))).not.toThrow();
        expect(result.current.isStageTransitioning).toBe(false);
      });

      test("a zero-sized measurement is discarded rather than stored", () => {
        // Asserted only as far as it goes. Mutation testing showed this guard
        // has no observable effect: a stored `{width: 0, height: 0, centerX: 0,
        // centerY: 0}` is read back through `knownTarget?.width || preset.width`
        // and three more `||` chains, every one of which treats 0 as absent.
        // The guard is real defence in depth, not a behaviour this can pin.
        const { result } = render();
        attach(result, "introPanelRef", { width: 0, height: 0 });

        expect(() => frames(2)).not.toThrow();
      });

      test("measuring runs without a panel attached at all", () => {
        const { result } = render();
        expect(() => frames(2)).not.toThrow();
        expect(result.current.homeStage).toBe("intro");
      });

      test("the off-screen twin is what visualizer-to-workout morphs towards", () => {
        // This is the case the twin exists for. The workout shell is not on
        // screen to be measured while the visualizer is still showing, so the
        // morph would otherwise animate to a preset and snap on arrival.
        const { result } = render();
        attach(result, "visualPanelRef", { left: 0, top: 0, width: 880, height: 700 });
        attach(result, "workoutMeasureShellRef", { left: 20, top: 40, width: 940, height: 360 });
        attach(result, "workoutShellRef", null);
        act(() => result.current.goToStage("visualizer"));

        act(() => result.current.transitionToStageFromTrigger("workout"));
        frames(12);
        act(() => vi.advanceTimersByTime(1400));

        expect(result.current.homeStage).toBe("workout");
        expect(result.current.isStageTransitioning).toBe(false);
      });

      test("a zero-sized twin is discarded rather than stored as the workout size", () => {
        const { result } = render();
        attach(result, "workoutMeasureShellRef", { width: 0, height: 0 });

        expect(() => frames(2)).not.toThrow();
      });

      test("the workout shell is measured from its off-screen twin", () => {
        const { result } = render();
        attach(result, "workoutMeasureShellRef", { left: 0, top: 0, width: 900, height: 380 });
        attach(result, "introPanelRef", { width: 600, height: 320 });
        frames(1);

        attach(result, "workoutShellRef", null);
        act(() => result.current.transitionToStageFromTrigger("workout"));
        frames(12);
        act(() => vi.advanceTimersByTime(1400));

        expect(result.current.homeStage).toBe("workout");
        expect(result.current.isStageTransitioning).toBe(false);
      });
    });

    describe("the enter-animation suppression", () => {
      test("lifts on the next frame once the intro hand-off has settled", () => {
        // It is held only long enough to cover the morph. Left on, the next
        // stage arrives with no entrance at all.
        const { result } = render();
        attach(result, "introPanelRef", { width: 600, height: 320 });
        attach(result, "introTitleRef", { width: 400, height: 60 });
        attach(result, "introButtonRef", { width: 200, height: 48 });

        act(() => result.current.onGetStarted());
        expect(result.current.suppressStageEnter).toBe(true);

        act(() => vi.advanceTimersByTime(1460));
        frames(2);

        expect(result.current.homeStage).toBe("personal");
        expect(result.current.suppressStageEnter).toBe(false);
      });

      test("stays on while a morph is still running", () => {
        const { result } = render();
        startMorph(result);
        frames(2);

        expect(result.current.suppressStageEnter).toBe(true);
      });
    });
  });

  describe("the visualizer stage animation", () => {
    const buildVisualPanel = (result, { withSurfaces = true } = {}) => {
      const panel = document.createElement("div");
      if (withSurfaces) {
        const stage = document.createElement("div");
        stage.className = "visual-stage";
        const surface = document.createElement("div");
        surface.className = "physique-render-surface";
        panel.append(stage, surface);
      }
      document.body.appendChild(panel);
      result.current.visualPanelRef.current = panel;
      return () => panel.remove();
    };

    test("starts once the panel carries both surfaces", () => {
      const { result, rerender } = render();
      const cleanup = buildVisualPanel(result);
      try {
        expect(() => act(() => result.current.goToStage("visualizer"))).not.toThrow();
        rerender();
        expect(result.current.homeStage).toBe("visualizer");
      } finally {
        cleanup();
      }
    });

    test("does nothing when the render surfaces are not there yet", () => {
      const { result } = render();
      const cleanup = buildVisualPanel(result, { withSurfaces: false });
      try {
        expect(() => act(() => result.current.goToStage("visualizer"))).not.toThrow();
      } finally {
        cleanup();
      }
    });

    test("does nothing when the panel itself is missing", () => {
      const { result } = render();
      expect(() => act(() => result.current.goToStage("visualizer"))).not.toThrow();
      expect(result.current.homeStage).toBe("visualizer");
    });

    test("tears down when the visitor leaves the stage", () => {
      const { result } = render();
      const cleanup = buildVisualPanel(result);
      try {
        act(() => result.current.goToStage("visualizer"));
        expect(() => act(() => result.current.goToStage("workout"))).not.toThrow();
        expect(result.current.homeStage).toBe("workout");
      } finally {
        cleanup();
      }
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
