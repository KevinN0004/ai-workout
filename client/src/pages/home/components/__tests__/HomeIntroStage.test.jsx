import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, test, vi } from "vitest";
import HomeIntroStage from "../HomeIntroStage";
import { APP_BRAND_TAGLINE } from "../../../../app/constants";

// The landing stage. Almost all of it is markup, but the Get Started gate is
// not: the button is disabled while EITHER transition is in flight, and each
// arm is asserted on its own. Setting both flags at once cannot tell the two
// apart -- dropping either arm still reads as disabled -- so a combined test
// would pass over a half-removed guard.
//
// The tagline is asserted against the shared constant rather than a copy of its
// text, so renaming the brand cannot leave this test pinning the old wording.

// The helper gives the stage everything but its refs, which no test needs, so
// its own props are optional to a test and each test's props are cast to the
// stage's. Elements a test looks up are cast to the element it expects.
/** @typedef {Parameters<typeof HomeIntroStage>[0]} StageProps */
/** @typedef {Omit<StageProps, "stageDirection" | "isIntroTransitioning" | "isStageTransitioning" | "onGetStarted"> & Partial<Pick<StageProps, "stageDirection" | "isIntroTransitioning" | "isStageTransitioning" | "onGetStarted">>} RenderProps */
/** @param {RenderProps} [overrides] */
const renderStage = (overrides = /** @type {RenderProps} */ (/** @type {unknown} */ ({}))) =>
  render(
    <HomeIntroStage
      stageDirection="forward"
      isIntroTransitioning={false}
      isStageTransitioning={false}
      onGetStarted={() => {}}
      {...overrides}
    />
  );

const getStartedButton = () => screen.getByRole("button", { name: "Get Started" });

describe("HomeIntroStage", () => {
  test("renders the brand tagline as the page heading", () => {
    renderStage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(APP_BRAND_TAGLINE);
  });

  test("calls onGetStarted when the call to action is clicked", () => {
    const onGetStarted = vi.fn();
    renderStage(/** @type {RenderProps} */ (/** @type {unknown} */ ({ onGetStarted })));

    fireEvent.click(getStartedButton());

    expect(onGetStarted).toHaveBeenCalledTimes(1);
  });

  test("is clickable when no transition is running", () => {
    renderStage();
    expect(getStartedButton()).toBeEnabled();
  });

  test("disables the call to action while the intro is transitioning", () => {
    renderStage(
      /** @type {RenderProps} */ (/** @type {unknown} */ ({ isIntroTransitioning: true }))
    );
    expect(getStartedButton()).toBeDisabled();
  });

  test("disables the call to action while a stage transition is running", () => {
    renderStage(
      /** @type {RenderProps} */ (/** @type {unknown} */ ({ isStageTransitioning: true }))
    );
    expect(getStartedButton()).toBeDisabled();
  });

  test("marks the panel with the direction the stage is moving", () => {
    const introPanelRef = createRef();
    renderStage(
      /** @type {RenderProps} */ (
        /** @type {unknown} */ ({ introPanelRef, stageDirection: "back" })
      )
    );

    expect(introPanelRef.current).toHaveClass("stage-back");
    expect(introPanelRef.current).not.toHaveClass("stage-forward");
  });

  test("flags the panel as transitioning only while the intro animates", () => {
    const introPanelRef = createRef();
    const { rerender } = renderStage(
      /** @type {RenderProps} */ (/** @type {unknown} */ ({ introPanelRef }))
    );
    expect(introPanelRef.current).not.toHaveClass("intro-transitioning");

    rerender(
      <HomeIntroStage
        introPanelRef={introPanelRef}
        introTitleRef={
          /** @type {StageProps["introTitleRef"]} */ (/** @type {unknown} */ (undefined))
        }
        introButtonRef={
          /** @type {StageProps["introButtonRef"]} */ (/** @type {unknown} */ (undefined))
        }
        stageDirection="forward"
        isIntroTransitioning
        isStageTransitioning={false}
        onGetStarted={() => {}}
      />
    );

    expect(introPanelRef.current).toHaveClass("intro-transitioning");
  });

  test("forwards the refs the stage animation measures", () => {
    const introPanelRef = createRef();
    const introTitleRef = createRef();
    const introButtonRef = createRef();
    renderStage(
      /** @type {RenderProps} */ (
        /** @type {unknown} */ ({ introPanelRef, introTitleRef, introButtonRef })
      )
    );

    expect(introPanelRef.current).toBeInstanceOf(HTMLElement);
    expect(introTitleRef.current).toHaveTextContent(APP_BRAND_TAGLINE);
    expect(introButtonRef.current).toBe(getStartedButton());
  });
});
