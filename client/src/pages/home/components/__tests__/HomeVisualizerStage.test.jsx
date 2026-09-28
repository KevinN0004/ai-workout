import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import HomeVisualizerStage from "../HomeVisualizerStage";
import { SILHOUETTE_GEOMETRY_REV } from "../PhysiqueSilhouette2D";

// The physique stage. The part worth pinning is the scroll lock: this stage
// fills the viewport, so it hides overflow on mount and puts back whatever was
// there on unmount.
//
// "Whatever was there" is the whole assertion. The restore cases below start
// from non-empty inline values, because restoring and merely clearing are the
// same thing when the previous value was "" -- which is what it is in a fresh
// jsdom document, so a test that did not set one first would pass either way.
//
// Note this is a second, separate scroll lock from the shared
// `useBodyScrollLock` hook, which toggles a `no-scroll` class and is
// ref-counted. They are different mechanisms; this pins the one that ships here.
//
// The real PhysiqueSilhouette2D is rendered rather than stubbed, so the shape
// that reaches the geometry is the one the app passes.

const SHAPE = {
  heightCm: 178,
  weightKg: 77,
  shoulderHalf: 62,
  waistHalf: 44,
  hipHalf: 50,
  fatScore: 0.3,
  muscleScore: 0.5
};

const renderStage = (overrides = {}) =>
  render(
    <HomeVisualizerStage
      visualLabel="Physique preview for a 178 cm profile"
      silhouetteRenderSignature="sig-1"
      silhouetteShape={SHAPE}
      isIntroTransitioning={false}
      isStageTransitioning={false}
      onBack={() => {}}
      onContinue={() => {}}
      {...overrides}
    />
  );

const backButton = () => screen.getByRole("button", { name: "Back" });
const continueButton = () => screen.getByRole("button", { name: "Continue" });

afterEach(() => {
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
});

describe("HomeVisualizerStage", () => {
  test("hides page overflow while the stage is open", () => {
    renderStage();

    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
  });

  test("restores the overflow the page already had when it closes", () => {
    document.documentElement.style.overflow = "scroll";
    document.body.style.overflow = "auto";

    const { unmount } = renderStage();
    expect(document.documentElement.style.overflow).toBe("hidden");

    unmount();

    expect(document.documentElement.style.overflow).toBe("scroll");
    expect(document.body.style.overflow).toBe("auto");
  });

  test("leaves overflow unset on close when the page had none", () => {
    const { unmount } = renderStage();
    unmount();

    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  test("describes the silhouette with the caller's label", () => {
    renderStage();

    expect(
      screen.getByRole("img", { name: "Physique preview for a 178 cm profile" })
    ).toBeVisible();
  });

  test("stamps the render surface with the geometry revision", () => {
    const { container } = renderStage();

    expect(container.querySelector(".physique-render-surface")).toHaveAttribute(
      "data-silhouette-rev",
      String(SILHOUETTE_GEOMETRY_REV)
    );
  });

  test("draws the silhouette from the shape it is given", () => {
    const { container } = renderStage();

    expect(container.querySelector(".physique-render-surface svg")).toBeInTheDocument();
  });

  test("calls onBack when Back is clicked", () => {
    const onBack = vi.fn();
    renderStage({ onBack });

    fireEvent.click(backButton());

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("calls onContinue when Continue is clicked", () => {
    const onContinue = vi.fn();
    renderStage({ onContinue });

    fireEvent.click(continueButton());

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test("leaves both controls usable when no transition is running", () => {
    renderStage();

    expect(backButton()).toBeEnabled();
    expect(continueButton()).toBeEnabled();
  });

  test("disables both controls while the intro is transitioning", () => {
    renderStage({ isIntroTransitioning: true });

    expect(backButton()).toBeDisabled();
    expect(continueButton()).toBeDisabled();
  });

  test("disables both controls while a stage transition is running", () => {
    renderStage({ isStageTransitioning: true });

    expect(backButton()).toBeDisabled();
    expect(continueButton()).toBeDisabled();
  });

  test("applies the caller's style to the back control", () => {
    renderStage({ backBtnStyle: { opacity: 0.5 } });

    expect(backButton()).toHaveStyle({ opacity: "0.5" });
  });

  test("forwards the panel ref the stage animation measures", () => {
    const visualPanelRef = createRef();
    renderStage({ visualPanelRef });

    expect(visualPanelRef.current).toHaveClass("visualizer-only-panel");
  });
});
