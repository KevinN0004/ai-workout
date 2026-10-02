/**
 * The home page's stage machine: which stage is showing, which way it was
 * entered, and the animations between stages -- the intro's button growing into
 * a panel, and a morph from one stage's panel to the next. Called by HomePage.
 */
import { useEffect, useRef, useState } from "react";
import { animate, createTimeline } from "animejs";

// Each stage's position, intro first and workout last, with the preview
// (reached only from the nav) after the intro. goToStage compares positions to
// pick the direction a stage is entered in.
const STAGE_ORDER = {
  intro: 0,
  preview: 1,
  personal: 2,
  visualizer: 3,
  workout: 4
};
// The length of the morph, the Get Started hand-off and the visualizer's
// entrance, in milliseconds. The same as `--home-animation-ms` in
// styles/core/layout.css.
const UNIFIED_ANIMATION_MS = 1400;
// How long the morph's clone takes to fade out once the stage is revealed.
const STAGE_CROSSFADE_MS = 220;

/**
 * Owns the current stage ("intro", "preview", "personal", "visualizer" or
 * "workout"), the direction it was entered in, and the flags HomePage styles
 * and disables the stages by. Returns those, the refs the stages and the hidden
 * workout copy attach to the elements the animations measure and move, and
 * three ways to change stage:
 *
 * - `goToStage`, a plain switch, used by the nav and the back controls. Going
 *   to the intro calls `onResetPersonalFlow`, which resets the profile form.
 * - `transitionToStageFromTrigger`, the morph: a fixed-position clone of the
 *   current panel animates to the next panel's size and place, while the real
 *   stage, already switched underneath, stays hidden.
 * - `onGetStarted`, the intro's own animation into the personal stage.
 *
 * Both animations switch straight to the next stage under
 * `prefers-reduced-motion`, and when what they would animate is missing or,
 * for the morph, has no size. The visualizer's entrance and pulse (the first
 * effect) run under reduced motion too: they are script-driven, so the
 * stylesheet's reduced-motion block does not reach them. `samplePlanLength`
 * and `personalMode` are read only to re-measure a panel whose size they
 * change.
 */
export default function useHomeStageFlow({ onResetPersonalFlow, samplePlanLength, personalMode }) {
  // ---- Refs: DOM handles, animations, pending timers and measurements -------
  const visualPanelRef = useRef(null);
  const visualIntroTimelineRef = useRef(null);
  const stagePulseRef = useRef(null);
  const introExitTimelineRef = useRef(null);
  const introTransitionTimeoutRef = useRef(null);
  const stageSwapTimelineRef = useRef(null);
  const stageSwapRafRef = useRef(null);
  const stageSwapRevealTimeoutRef = useRef(null);
  const stageSwapTimeoutRef = useRef(null);
  const stageMorphCloneRef = useRef(null);
  const suppressResetPendingRef = useRef(false);
  const stageMetricsRef = useRef({});
  const introPanelRef = useRef(null);
  const personalPanelRef = useRef(null);
  const introTitleRef = useRef(null);
  const introButtonRef = useRef(null);
  const workoutPanelRef = useRef(null);
  const workoutShellRef = useRef(null);
  const workoutMeasureRef = useRef(null);
  const workoutMeasureShellRef = useRef(null);

  // ---- State ----------------------------------------------------------------
  // `suppressStageEnter` puts `stage-snap` on the stage, which turns its enter
  // animation off.
  const [homeStage, setHomeStage] = useState("intro");
  const [stageDirection, setStageDirection] = useState("forward");
  const [isIntroTransitioning, setIsIntroTransitioning] = useState(false);
  const [isStageTransitioning, setIsStageTransitioning] = useState(false);
  const [suppressStageEnter, setSuppressStageEnter] = useState(false);

  // ---- Clean-up helpers -----------------------------------------------------
  const clearStageMorphClone = () => {
    if (!stageMorphCloneRef.current) return;
    stageMorphCloneRef.current.remove();
    stageMorphCloneRef.current = null;
  };

  const clearStageSwapTimers = () => {
    if (stageSwapRevealTimeoutRef.current) {
      window.clearTimeout(stageSwapRevealTimeoutRef.current);
      stageSwapRevealTimeoutRef.current = null;
    }
    if (stageSwapTimeoutRef.current) {
      window.clearTimeout(stageSwapTimeoutRef.current);
      stageSwapTimeoutRef.current = null;
    }
  };

  const clearStageSwapRaf = () => {
    if (!stageSwapRafRef.current) return;
    window.cancelAnimationFrame(stageSwapRafRef.current);
    stageSwapRafRef.current = null;
  };

  // ---- Plain stage switch ---------------------------------------------------
  // The direction drives the stage's enter animation: forward when the next
  // stage is at or after this one in `STAGE_ORDER`.
  const goToStage = (nextStage) => {
    if (nextStage === homeStage) return;
    if (nextStage === "intro") {
      onResetPersonalFlow?.();
    }
    const nextOrder = STAGE_ORDER[nextStage] ?? 0;
    const currentOrder = STAGE_ORDER[homeStage] ?? 0;
    setStageDirection(nextOrder >= currentOrder ? "forward" : "backward");
    setHomeStage(nextStage);
  };

  // The panel the morph measures for each stage. The preview has none.
  const getMorphStageElement = (stage) => {
    if (stage === "intro") return introPanelRef.current;
    if (stage === "personal") return personalPanelRef.current;
    if (stage === "visualizer") return visualPanelRef.current;
    if (stage === "workout") return workoutShellRef.current || workoutPanelRef.current;
    return null;
  };

  // ---- The morph between stages ---------------------------------------------
  const transitionToStageFromTrigger = (nextStage) => {
    // ---- Guards, and the paths that skip the animation ----------------------
    if (nextStage === homeStage || isIntroTransitioning || isStageTransitioning) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSuppressStageEnter(true);
      goToStage(nextStage);
      return;
    }

    const sourceMorphEl = getMorphStageElement(homeStage);
    const sourceRect = sourceMorphEl?.getBoundingClientRect();
    if (!sourceMorphEl || !sourceRect?.width || !sourceRect?.height) {
      setSuppressStageEnter(true);
      goToStage(nextStage);
      return;
    }

    // ---- Fallback target, for when the next panel cannot be measured --------
    // For the workout stage a measurement of its hidden copy wins; then the
    // size and centre last recorded for the next stage by the effects below
    // (for the workout stage, the copy's again); then a per-stage preset in CSS
    // pixels, sized from the viewport within fixed bounds.
    const pageEl = document.querySelector(".home-page");
    const pageStyles = pageEl ? window.getComputedStyle(pageEl) : null;
    const pagePaddingX = pageStyles
      ? parseFloat(pageStyles.paddingLeft || "0") + parseFloat(pageStyles.paddingRight || "0")
      : 48;
    const stageWidth = Math.min(1200, Math.max(320, window.innerWidth - pagePaddingX));

    const presets = {
      intro: { width: Math.min(560, stageWidth), height: 320 },
      personal: { width: Math.min(980, stageWidth), height: 620 },
      visualizer: {
        width: Math.min(900, stageWidth),
        height: Math.max(620, Math.min(860, window.innerHeight - 120))
      },
      workout: {
        width: Math.min(980, stageWidth),
        height: Math.max(260, Math.min(420, window.innerHeight - 220))
      }
    };
    const preset = presets[nextStage] || presets.personal;
    const workoutMeasureRect =
      nextStage === "workout"
        ? (workoutMeasureShellRef.current || workoutMeasureRef.current)?.getBoundingClientRect()
        : null;
    const measuredWorkoutTarget =
      workoutMeasureRect?.width && workoutMeasureRect?.height
        ? {
            width: workoutMeasureRect.width,
            height: workoutMeasureRect.height,
            centerX: workoutMeasureRect.left + workoutMeasureRect.width / 2,
            centerY: workoutMeasureRect.top + workoutMeasureRect.height / 2
          }
        : null;
    const knownTarget = measuredWorkoutTarget || stageMetricsRef.current[nextStage];
    const fallbackWidth = knownTarget?.width || preset.width;
    const fallbackHeight =
      knownTarget?.height || Math.min(preset.height, Math.max(320, window.innerHeight - 180));

    const contentEl = document.querySelector(".home-page .content");
    const contentRect = contentEl?.getBoundingClientRect();
    const fallbackCenterX = contentRect
      ? contentRect.left + contentRect.width / 2
      : window.innerWidth / 2;
    const fallbackCenterY = contentRect
      ? contentRect.top + contentRect.height / 2
      : window.innerHeight / 2;
    const fallbackTarget = {
      width: fallbackWidth,
      height: fallbackHeight,
      centerX: knownTarget?.centerX || fallbackCenterX,
      centerY: knownTarget?.centerY || fallbackCenterY
    };

    // ---- How the clone looks at each end ------------------------------------
    const sourceStyles = window.getComputedStyle(sourceMorphEl);
    const transitionFillColor =
      homeStage === "visualizer" && nextStage === "workout"
        ? "rgba(14, 14, 14, 1)"
        : "rgba(28, 28, 28, 1)";
    const targetVisual =
      nextStage === "intro"
        ? {
            bg: "rgba(255, 255, 255, 0)",
            border: "rgba(255, 255, 255, 0)",
            color: "rgb(255, 255, 255)",
            radius: "24px"
          }
        : {
            bg: "rgba(110, 110, 110, 0.28)",
            border: "rgba(255, 255, 255, 0.16)",
            color: "rgb(243, 243, 243)",
            radius: "24px"
          };

    // ---- Stop any morph still finishing, and hide the stages ----------------
    // The guard above has already refused a morph in flight, but the last one's
    // clone can still be fading out.
    stageSwapTimelineRef.current?.cancel();
    clearStageSwapTimers();
    clearStageSwapRaf();
    clearStageMorphClone();

    setIsStageTransitioning(true);
    suppressResetPendingRef.current = false;
    setSuppressStageEnter(true);

    // ---- Anchors ------------------------------------------------------------
    // Every preset, like the default, anchors both ends at the centre, so the
    // anchor terms below cancel and the clone lands on the target's box.
    const transitionAnchors = {
      "personal->visualizer": {
        source: { x: 0.5, y: 0.5 },
        target: { x: 0.5, y: 0.5 }
      },
      "visualizer->workout": {
        source: { x: 0.5, y: 0.5 },
        target: { x: 0.5, y: 0.5 }
      }
    };
    const anchorPreset = transitionAnchors[`${homeStage}->${nextStage}`] || {
      source: { x: 0.5, y: 0.5 },
      target: { x: 0.5, y: 0.5 }
    };
    const clampAnchor = (value, fallback) => {
      if (!Number.isFinite(value)) return fallback;
      return Math.min(1, Math.max(0, value));
    };
    const sourceAnchorX = clampAnchor(anchorPreset.source?.x, 0.5);
    const sourceAnchorY = clampAnchor(anchorPreset.source?.y, 0.5);
    const targetAnchorX = clampAnchor(anchorPreset.target?.x, 0.5);
    const targetAnchorY = clampAnchor(anchorPreset.target?.y, 0.5);

    // ---- The clone ----------------------------------------------------------
    // Fixed over the current panel and appended to body, outside React, so it
    // survives the stage switch below.
    const morphClone = sourceMorphEl.cloneNode(true);
    morphClone.style.position = "fixed";
    morphClone.style.left = `${sourceRect.left}px`;
    morphClone.style.top = `${sourceRect.top}px`;
    morphClone.style.width = `${sourceRect.width}px`;
    morphClone.style.height = `${sourceRect.height}px`;
    morphClone.style.margin = "0";
    morphClone.style.zIndex = "40";
    morphClone.style.pointerEvents = "none";
    morphClone.style.transformOrigin = "top left";
    morphClone.style.boxSizing = "border-box";
    morphClone.style.transform = "none";
    morphClone.style.maxWidth = "none";
    morphClone.style.minWidth = "0";
    morphClone.style.maxHeight = "none";
    morphClone.style.minHeight = "0";
    morphClone.style.borderRadius = sourceStyles.borderRadius || "24px";
    morphClone.style.backgroundColor = transitionFillColor;
    morphClone.style.borderColor = sourceStyles.borderColor || "rgba(255, 255, 255, 0.16)";
    morphClone.style.color = sourceStyles.color || "rgb(243, 243, 243)";
    document.body.appendChild(morphClone);
    stageMorphCloneRef.current = morphClone;
    const morphCloneContentEls = Array.from(morphClone.children);

    const completeDelayMs = UNIFIED_ANIMATION_MS;
    const crossfadeDurationMs = STAGE_CROSSFADE_MS;

    // ---- Switch the real stage underneath -----------------------------------
    goToStage(nextStage);

    const startMorphTimeline = (attempt = 0) => {
      // A newer morph has replaced this one's clone.
      if (stageMorphCloneRef.current !== morphClone) return;

      // ---- Wait for the next panel to have a size ---------------------------
      // Up to eight more frames, then the fallbacks.
      const liveTargetEl = getMorphStageElement(nextStage);
      const liveTargetRect = liveTargetEl?.getBoundingClientRect();
      const hasLiveTargetRect = Boolean(liveTargetRect?.width && liveTargetRect?.height);
      if (!hasLiveTargetRect && attempt < 8) {
        stageSwapRafRef.current = window.requestAnimationFrame(() => {
          stageSwapRafRef.current = null;
          startMorphTimeline(attempt + 1);
        });
        return;
      }

      const liveTarget = hasLiveTargetRect
        ? {
            width: liveTargetRect.width,
            height: liveTargetRect.height,
            centerX: liveTargetRect.left + liveTargetRect.width / 2,
            centerY: liveTargetRect.top + liveTargetRect.height / 2
          }
        : null;

      // ---- Where the clone ends up ------------------------------------------
      const resolvedTarget =
        liveTarget ||
        (homeStage === "visualizer" && nextStage === "workout" ? measuredWorkoutTarget : null) ||
        fallbackTarget;

      const targetLeft = resolvedTarget.centerX - resolvedTarget.width / 2;
      const targetTop = resolvedTarget.centerY - resolvedTarget.height / 2;
      const finalLeft = targetLeft + resolvedTarget.width * (targetAnchorX - sourceAnchorX);
      const finalTop = targetTop + resolvedTarget.height * (targetAnchorY - sourceAnchorY);
      const morphTranslateX = finalLeft - sourceRect.left;
      const morphTranslateY = finalTop - sourceRect.top;

      // ---- Animate the clone ------------------------------------------------
      // Its copied content vanishes at once, so only the panel's box morphs.
      const timeline = createTimeline({
        defaults: { ease: "inOutCubic" }
      }).add(morphClone, {
        width: [`${sourceRect.width}px`, `${resolvedTarget.width}px`],
        height: [`${sourceRect.height}px`, `${resolvedTarget.height}px`],
        translateX: [0, morphTranslateX],
        translateY: [0, morphTranslateY],
        borderRadius: [sourceStyles.borderRadius || "24px", targetVisual.radius],
        backgroundColor: [transitionFillColor, transitionFillColor],
        borderColor: [sourceStyles.borderColor || "rgba(255, 255, 255, 0.16)", targetVisual.border],
        color: [sourceStyles.color || "rgb(243, 243, 243)", targetVisual.color],
        duration: completeDelayMs
      });

      if (morphCloneContentEls.length) {
        timeline.add(
          morphCloneContentEls,
          {
            opacity: [1, 0],
            duration: 1,
            ease: "linear"
          },
          0
        );
      }

      stageSwapTimelineRef.current = timeline;

      // ---- Reveal the stage, then fade the clone and remove it --------------
      stageSwapRevealTimeoutRef.current = window.setTimeout(() => {
        stageSwapRevealTimeoutRef.current = null;
        setIsStageTransitioning(false);
        if (stageMorphCloneRef.current === morphClone) {
          morphClone.style.transition = `opacity ${crossfadeDurationMs}ms linear`;
          morphClone.style.opacity = "0";
        }
      }, completeDelayMs);

      stageSwapTimeoutRef.current = window.setTimeout(
        () => {
          stageSwapTimeoutRef.current = null;
          clearStageMorphClone();
        },
        completeDelayMs + crossfadeDurationMs + 20
      );
    };

    // ---- Start two frames on, once the new stage has rendered ---------------
    stageSwapRafRef.current = window.requestAnimationFrame(() => {
      stageSwapRafRef.current = window.requestAnimationFrame(() => {
        stageSwapRafRef.current = null;
        startMorphTimeline();
      });
    });
  };

  // ---- Get Started: the intro's hand-off ------------------------------------
  // Unlike the morph, this asks for the stage-enter suppression to be lifted
  // once the personal stage is showing (see the effects below).
  const onGetStarted = () => {
    // ---- Guards, and the paths that skip the animation ----------------------
    if (isIntroTransitioning || isStageTransitioning) return;

    const panelEl = introPanelRef.current;
    const titleEl = introTitleRef.current;
    const buttonEl = introButtonRef.current;
    if (!panelEl || !titleEl || !buttonEl) {
      goToStage("personal");
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      suppressResetPendingRef.current = true;
      setSuppressStageEnter(true);
      goToStage("personal");
      return;
    }

    setIsIntroTransitioning(true);
    suppressResetPendingRef.current = true;
    setSuppressStageEnter(true);

    // ---- Measure the button and the panel -----------------------------------
    // The button grows to a panel's size, taken from the viewport within fixed
    // floors and caps, centred where the intro panel is.
    const panelRect = panelEl.getBoundingClientRect();
    const buttonRect = buttonEl.getBoundingClientRect();
    const pageEl = panelEl.closest(".page");
    const pageStyles = pageEl ? window.getComputedStyle(pageEl) : null;
    const pagePaddingX = pageStyles
      ? parseFloat(pageStyles.paddingLeft || "0") + parseFloat(pageStyles.paddingRight || "0")
      : 48;
    const stageWidth = Math.min(1200, Math.max(320, window.innerWidth - pagePaddingX));
    const expandedWidth = Math.max(buttonRect.width, Math.min(980, stageWidth));
    const expandedHeight = Math.max(
      buttonRect.height,
      Math.min(620, Math.max(460, window.innerHeight - 210))
    );
    const startCenterX = buttonRect.left + buttonRect.width / 2;
    const startCenterY = buttonRect.top + buttonRect.height / 2;
    const targetCenterX = panelRect.left + panelRect.width / 2;
    const targetCenterY = panelRect.top + panelRect.height / 2;
    const translateX = targetCenterX - startCenterX;
    const translateY = targetCenterY - startCenterY;

    // ---- Stop any hand-off still running ------------------------------------
    introExitTimelineRef.current?.cancel();
    if (introTransitionTimeoutRef.current) {
      window.clearTimeout(introTransitionTimeoutRef.current);
      introTransitionTimeoutRef.current = null;
    }

    // ---- Animate: the title goes, the button grows, the panel fades ---------
    introExitTimelineRef.current = createTimeline({
      defaults: { ease: "inOutCubic" }
    })
      .add(titleEl, {
        opacity: [1, 0],
        duration: 1,
        ease: "linear"
      })
      .add(
        buttonEl,
        {
          color: ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"],
          width: [`${buttonRect.width}px`, `${expandedWidth}px`],
          height: [`${buttonRect.height}px`, `${expandedHeight}px`],
          translateX: [0, translateX],
          translateY: [0, translateY],
          borderRadius: ["999px", "24px"],
          backgroundColor: ["rgb(255, 255, 255)", "rgba(110, 110, 110, 0.28)"],
          borderColor: ["rgb(255, 255, 255)", "rgba(255, 255, 255, 0.16)"],
          letterSpacing: ["0em", "0.04em"],
          duration: UNIFIED_ANIMATION_MS
        },
        "<<+=40"
      )
      .add(
        panelEl,
        {
          opacity: [1, 0],
          duration: UNIFIED_ANIMATION_MS
        },
        "<<"
      );

    // ---- Switch to the personal stage once it has run -----------------------
    introTransitionTimeoutRef.current = window.setTimeout(() => {
      setIsIntroTransitioning(false);
      goToStage("personal");
    }, UNIFIED_ANIMATION_MS + 60);
  };

  // ---- Effects --------------------------------------------------------------

  // Runs the visualizer's entrance and starts its slow pulse whenever that
  // stage is entered. After the morph the entrance plays out while the stage is
  // still hidden under the clone, so it is seen only on Back and on the paths
  // that skip the morph. Leaving the stage, or unmounting, stops both.
  useEffect(() => {
    if (homeStage !== "visualizer" || !visualPanelRef.current) return undefined;

    visualIntroTimelineRef.current?.cancel();
    stagePulseRef.current?.cancel();

    const stageEl = visualPanelRef.current.querySelector(".visual-stage");
    const renderSurfaceEl = visualPanelRef.current.querySelector(".physique-render-surface");
    if (!stageEl || !renderSurfaceEl) return undefined;

    visualIntroTimelineRef.current = createTimeline({
      defaults: { ease: "outCubic", duration: UNIFIED_ANIMATION_MS }
    })
      .add(stageEl, { opacity: [0.42, 1], scale: [0.97, 1], duration: UNIFIED_ANIMATION_MS })
      .add(
        renderSurfaceEl,
        {
          opacity: [0.6, 1],
          scale: [0.93, 1],
          duration: UNIFIED_ANIMATION_MS
        },
        "<<"
      );

    stagePulseRef.current = animate(renderSurfaceEl, {
      scaleX: [1, 0.994, 1],
      scaleY: [1, 1.01, 1],
      duration: 4300,
      delay: 520,
      ease: "inOutSine",
      loop: true
    });

    return () => {
      visualIntroTimelineRef.current?.cancel();
      stagePulseRef.current?.cancel();
    };
  }, [homeStage]);

  // On unmount, stops the hand-off and the morph wherever they are and removes
  // the clone, which lives on body outside React and would otherwise outlive
  // the page. The first render's helpers are safe to call: they read only refs.
  useEffect(
    () => () => {
      introExitTimelineRef.current?.cancel();
      if (introTransitionTimeoutRef.current) {
        window.clearTimeout(introTransitionTimeoutRef.current);
      }
      stageSwapTimelineRef.current?.cancel();
      clearStageSwapTimers();
      clearStageSwapRaf();
      clearStageMorphClone();
    },
    []
  );

  // Lifts the stage-enter suppression a frame after Get Started has put the
  // personal stage up, animated or not. Only Get Started asks, through
  // `suppressResetPendingRef`; the morph leaves suppression on, because lifting
  // it would start the forward enter animation on a stage the morph has already
  // revealed.
  useEffect(() => {
    if (
      !suppressStageEnter ||
      isStageTransitioning ||
      isIntroTransitioning ||
      !suppressResetPendingRef.current
    ) {
      return undefined;
    }
    const rafId = window.requestAnimationFrame(() => {
      suppressResetPendingRef.current = false;
      setSuppressStageEnter(false);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [homeStage, suppressStageEnter, isStageTransitioning, isIntroTransitioning]);

  // A frame after each stage change, records the active panel's size and
  // centre, which the morph falls back on when it cannot measure its target
  // live. `personalMode` re-runs it because the mode changes the personal
  // panel's size. Of its records only the physique stage's is read: the morph
  // targets only that stage and the workout stage, whose record the next
  // effect overwrites.
  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const activeEl = getMorphStageElement(homeStage);
      if (!activeEl) return;
      const rect = activeEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      stageMetricsRef.current[homeStage] = {
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2
      };
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [homeStage, personalMode]);

  // Records the hidden workout copy's size as the workout stage's, a frame
  // after each stage change and whenever the sample plan's length changes its
  // height. Declared after the effect above, so on the workout stage its frame
  // runs second and the copy's size is the one kept.
  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const measureEl = workoutMeasureShellRef.current || workoutMeasureRef.current;
      if (!measureEl) return;
      const rect = measureEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      stageMetricsRef.current.workout = {
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2
      };
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [homeStage, samplePlanLength]);

  return {
    visualPanelRef,
    introPanelRef,
    personalPanelRef,
    introTitleRef,
    introButtonRef,
    workoutPanelRef,
    workoutShellRef,
    workoutMeasureRef,
    workoutMeasureShellRef,
    homeStage,
    stageDirection,
    isIntroTransitioning,
    isStageTransitioning,
    suppressStageEnter,
    goToStage,
    transitionToStageFromTrigger,
    onGetStarted
  };
}
