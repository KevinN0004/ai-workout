import { useEffect, useMemo, useRef, useState } from "react";
import { animate, createTimeline } from "animejs";
import PhysiqueSilhouette2D from "../components/PhysiqueSilhouette2D";
import "./HomePage.css";

export default function HomePage({
  gradient,
  user,
  onLogout,
  go,
  quickFocuses,
  form,
  toggleFocus,
  personalMode,
  setPersonalMode,
  personal,
  onPersonalChange,
  onResetPersonalFlow,
  heightUnit,
  setHeightUnit,
  toCmFromFeetInches,
  toFeetInchesFromCm,
  setPersonal,
  weightUnit,
  setWeightUnit,
  toKg,
  toLb,
  openPlannerFromProfile,
  error,
  samplePlan,
  plannerModal,
  generatedPlanModal
}) {
  const trainingDayOptions = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
  ];

  const toggleTrainingDay = (day) => {
    setPersonal((prev) => {
      const selectedDays = Array.isArray(prev.trainingDays) ? prev.trainingDays : [];
      const isSelected = selectedDays.includes(day);
      return {
        ...prev,
        trainingDays: isSelected
          ? selectedDays.filter((item) => item !== day)
          : [...selectedDays, day]
      };
    });
  };

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
  const [homeStage, setHomeStage] = useState("intro");
  const [stageDirection, setStageDirection] = useState("forward");
  const [isIntroTransitioning, setIsIntroTransitioning] = useState(false);
  const [isStageTransitioning, setIsStageTransitioning] = useState(false);
  const [suppressStageEnter, setSuppressStageEnter] = useState(false);
  const stageOrder = {
    intro: 0,
    preview: 1,
    personal: 2,
    visualizer: 3,
    workout: 4
  };
  const unifiedAnimationMs = 1400;
  const stageCrossfadeMs = 220;

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

  const goToStage = (nextStage) => {
    if (nextStage === homeStage) return;
    if (nextStage === "intro") {
      onResetPersonalFlow?.();
    }
    const nextOrder = stageOrder[nextStage] ?? 0;
    const currentOrder = stageOrder[homeStage] ?? 0;
    setStageDirection(nextOrder >= currentOrder ? "forward" : "backward");
    setHomeStage(nextStage);
  };

  const getMorphStageElement = (stage) => {
    if (stage === "intro") return introPanelRef.current;
    if (stage === "personal") return personalPanelRef.current;
    if (stage === "visualizer") return visualPanelRef.current;
    if (stage === "workout") return workoutShellRef.current || workoutPanelRef.current;
    return null;
  };

  const transitionToStageFromTrigger = (nextStage) => {
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
        width: Math.min(560, stageWidth),
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
    const fallbackCenterX = contentRect ? contentRect.left + contentRect.width / 2 : window.innerWidth / 2;
    const fallbackCenterY = contentRect
      ? contentRect.top + contentRect.height / 2
      : window.innerHeight / 2;
    const fallbackTarget = {
      width: fallbackWidth,
      height: fallbackHeight,
      centerX: knownTarget?.centerX || fallbackCenterX,
      centerY: knownTarget?.centerY || fallbackCenterY
    };

    const sourceStyles = window.getComputedStyle(sourceMorphEl);
    const transitionFillColor =
      homeStage === "visualizer" && nextStage === "workout"
        ? "rgba(14, 14, 14, 1)"
        : "rgba(28, 28, 28, 1)";
    const targetVisual = nextStage === "intro"
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

    stageSwapTimelineRef.current?.cancel();
    clearStageSwapTimers();
    clearStageSwapRaf();
    clearStageMorphClone();

    setIsStageTransitioning(true);
    suppressResetPendingRef.current = false;
    setSuppressStageEnter(true);

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

    const completeDelayMs = unifiedAnimationMs;
    const crossfadeDurationMs = stageCrossfadeMs;

    goToStage(nextStage);

    const startMorphTimeline = (attempt = 0) => {
      if (stageMorphCloneRef.current !== morphClone) return;

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
      // Prefer the live mounted target so the morph matches the fully rendered
      // next stage size; fall back to hidden measure only when live target is
      // not ready yet.
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

      stageSwapRevealTimeoutRef.current = window.setTimeout(() => {
        stageSwapRevealTimeoutRef.current = null;
        setIsStageTransitioning(false);
        if (stageMorphCloneRef.current === morphClone) {
          morphClone.style.transition = `opacity ${crossfadeDurationMs}ms linear`;
          morphClone.style.opacity = "0";
        }
      }, completeDelayMs);

      stageSwapTimeoutRef.current = window.setTimeout(() => {
        stageSwapTimeoutRef.current = null;
        clearStageMorphClone();
      }, completeDelayMs + crossfadeDurationMs + 20);
    };

    stageSwapRafRef.current = window.requestAnimationFrame(() => {
      stageSwapRafRef.current = window.requestAnimationFrame(() => {
        stageSwapRafRef.current = null;
        startMorphTimeline();
      });
    });
  };

  const onGetStarted = () => {
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

    introExitTimelineRef.current?.cancel();
    if (introTransitionTimeoutRef.current) {
      window.clearTimeout(introTransitionTimeoutRef.current);
      introTransitionTimeoutRef.current = null;
    }

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
          duration: unifiedAnimationMs
        },
        "<<+=40"
      )
      .add(
        panelEl,
        {
          opacity: [1, 0],
          duration: unifiedAnimationMs
        },
        "<<"
      );

    introTransitionTimeoutRef.current = window.setTimeout(() => {
      setIsIntroTransitioning(false);
      goToStage("personal");
    }, unifiedAnimationMs + 60);
  };

  const toFiniteNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const roundTo = (value, decimals = 1) => {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  };

  const resolvedHeightCm = (() => {
    const fromCmInput = toFiniteNumber(personal.heightCm);
    const fromImperialInput = toFiniteNumber(
      toCmFromFeetInches(personal.heightFeet, personal.heightInches)
    );
    const picked = heightUnit === "ft"
      ? fromImperialInput ?? fromCmInput
      : fromCmInput ?? fromImperialInput;
    return picked && picked > 0 ? picked : null;
  })();

  const resolvedWeightKg = (() => {
    const normalized = toFiniteNumber(toKg(personal.weight, weightUnit));
    return normalized && normalized > 0 ? normalized : null;
  })();

  const bmi = (() => {
    if (!resolvedHeightCm || !resolvedWeightKg) return null;
    const heightMeters = resolvedHeightCm / 100;
    return Number((resolvedWeightKg / (heightMeters * heightMeters)).toFixed(1));
  })();

  const hasValidName = Boolean(personal.name?.trim());
  const ageValue = toFiniteNumber(personal.age);
  const hasValidAge = ageValue !== null && ageValue >= 10 && ageValue <= 99;
  const isPersonalComplete = hasValidName &&
    hasValidAge &&
    resolvedHeightCm !== null &&
    resolvedWeightKg !== null &&
    Boolean(personal.sex);

  const onPersonalSubmit = (event) => {
    event.preventDefault();
    if (!isPersonalComplete || isIntroTransitioning || isStageTransitioning) return;
    transitionToStageFromTrigger("visualizer");
  };

  const explicitBodyFat = (() => {
    const value = toFiniteNumber(personal.bodyFat);
    return value === null ? null : clamp(value, 3, 60);
  })();

  const estimatedBodyFat = (() => {
    if (bmi === null) return null;
    const estimate = 1.35 * bmi - 13.5;
    return roundTo(clamp(estimate, 3, 60), 1);
  })();
  const effectiveBodyFat = explicitBodyFat ?? estimatedBodyFat;
  const bmiMassScore = bmi !== null ? clamp((bmi - 18.5) / (40 - 18.5), 0, 1) : 0.45;
  const bodyFatMassScore = effectiveBodyFat !== null
    ? clamp((effectiveBodyFat - 8) / (42 - 8), 0, 1)
    : null;
  const fatScore = clamp(
    (bodyFatMassScore !== null ? bodyFatMassScore : bmiMassScore) * 0.72 +
      bmiMassScore * 0.28,
    0,
    1
  );

  const heightNorm = resolvedHeightCm
    ? clamp((resolvedHeightCm - 150) / (205 - 150), 0, 1)
    : 0.48;
  const shoulderHalf = clamp(
    35 + bmiMassScore * 6 + fatScore * 11,
    30,
    72
  );
  const chestHalf = clamp(28 + bmiMassScore * 7 + fatScore * 12, 22, 62);
  const waistHalf = clamp(
    14 + bmiMassScore * 5 + fatScore * 22,
    11,
    52
  );
  const hipHalf = clamp(22 + bmiMassScore * 5 + fatScore * 14, 18, 56);
  const thighHalf = clamp(15 + bmiMassScore * 3.5 + fatScore * 15, 13, 46);
  const calfHalf = clamp(11.5 + bmiMassScore * 2 + fatScore * 10, 10, 34);
  const armWidth = clamp(8.5 + bmiMassScore * 2 + fatScore * 11, 8, 24);
  const armHeight = clamp(156 + heightNorm * 28, 146, 194);
  const headRadius = clamp(18 + fatScore * 2.6, 16, 28);

  const legBias = (heightNorm - 0.5) * 18;
  const torsoBias = (heightNorm - 0.5) * 8;
  const shoulderY = 100 - torsoBias * 0.4;
  const chestY = 143 + torsoBias * 0.2;
  const waistY = 218 + torsoBias + legBias * 0.1;
  const hipY = 266 + torsoBias + legBias * 0.24;
  const thighY = 319 + legBias * 0.55;
  const calfY = 372 + legBias * 0.84;
  const ankleY = 412 + legBias;
  const headCenterY = 57 - torsoBias * 0.3;

  const fillHue = 24 - fatScore * 4;
  const fillSaturation = clamp(44 + fatScore * 18, 40, 82);
  const fillLightness = clamp(56 - fatScore * 10, 36, 68);
  const strokeLightness = clamp(fillLightness - 24, 20, 48);
  const glowSaturation = clamp(fillSaturation + 8, 46, 94);
  const glowAlpha = clamp(0.08 + fatScore * 0.12, 0.06, 0.24);
  const glowRadius = clamp(112 + waistHalf * 0.7 + hipHalf * 0.45, 118, 176);

  const silhouetteShape = useMemo(
    () => ({
      shoulderHalf,
      chestHalf,
      waistHalf,
      hipHalf,
      thighHalf,
      calfHalf,
      armWidth,
      armHeight,
      headRadius,
      shoulderY,
      chestY,
      waistY,
      hipY,
      thighY,
      calfY,
      ankleY,
      headCenterY,
      fillHue,
      fillSaturation,
      fillLightness,
      strokeLightness,
      glowSaturation,
      glowAlpha,
      glowRadius
    }),
    [
      shoulderHalf,
      chestHalf,
      waistHalf,
      hipHalf,
      thighHalf,
      calfHalf,
      armWidth,
      armHeight,
      headRadius,
      shoulderY,
      chestY,
      waistY,
      hipY,
      thighY,
      calfY,
      ankleY,
      headCenterY,
      fillHue,
      fillSaturation,
      fillLightness,
      strokeLightness,
      glowSaturation,
      glowAlpha,
      glowRadius
    ]
  );

  useEffect(() => {
    if (homeStage !== "visualizer" || !visualPanelRef.current) return undefined;

    visualIntroTimelineRef.current?.cancel();
    stagePulseRef.current?.cancel();

    const stageEl = visualPanelRef.current.querySelector(".visual-stage");
    const renderSurfaceEl = visualPanelRef.current.querySelector(".physique-render-surface");
    if (!stageEl || !renderSurfaceEl) return undefined;

    visualIntroTimelineRef.current = createTimeline({
      defaults: { ease: "outCubic", duration: unifiedAnimationMs }
    })
      .add(stageEl, { opacity: [0.42, 1], scale: [0.97, 1], duration: unifiedAnimationMs })
      .add(
        renderSurfaceEl,
        {
          opacity: [0.6, 1],
          scale: [0.93, 1],
          duration: unifiedAnimationMs
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
  }, [homeStage, samplePlan.length]);

  const backBtnStyle = {
    background: "linear-gradient(120deg, #ff873a, #ff3d58)",
    border: "1px solid rgba(255, 106, 88, 0.94)",
    color: "#fff",
    boxShadow: "0 0 12px rgba(255, 61, 88, 0.56), 0 0 28px rgba(255, 135, 58, 0.38)"
  };

  const visualLabel = "T-pose contact points with finger joints, limb joints, 45 degree leg stance, and shoulder-to-pelvis torso triangle guide.";

  return (
    <div className="page home-page" style={gradient}>
      <div className="home-sticky-nav">
        <span className="home-nav-spacer" aria-hidden="true" />
        <button type="button" className="home-nav-title" onClick={() => go("/")}>
          AI Workout Studio
        </button>
        <button
          type="button"
          className="ghost home-preview-btn"
          onClick={() => goToStage("preview")}
          disabled={isIntroTransitioning || isStageTransitioning}
        >
          Preview
        </button>
      </div>

      {homeStage === "intro" ? (
        <main className="content home-intro-wrap">
          <section
            ref={introPanelRef}
            className={`panel home-intro-panel home-stage stage-${stageDirection} ${
              isIntroTransitioning ? "intro-transitioning" : ""
            }`}
          >
            <h1 ref={introTitleRef} className="home-hook-title">
              An outline for a great adventure.
            </h1>
            <div className="home-intro-actions">
              <button
                ref={introButtonRef}
                className="cta"
                type="button"
                onClick={onGetStarted}
                disabled={isIntroTransitioning || isStageTransitioning}
              >
                Get Started
              </button>
            </div>
          </section>
        </main>
      ) : (
        <>
          <main className="content">
              <div
                key={homeStage}
                className={`home-stage home-stage-${homeStage} stage-${stageDirection} ${
                  suppressStageEnter ? "stage-snap" : ""
                } ${isStageTransitioning ? "stage-transition-hidden" : ""}`}
              >
              {homeStage === "preview" && (
                <section className="panel preview-stage-panel stage-panel">
                  <h2>Setup snapshot</h2>
                  <p className="muted">A quick look at how the full setup flows.</p>
                  <div className="setup-snapshot-grid">
                    <article className="setup-snapshot-card">
                      <h3>1. Intro</h3>
                      <p>Start from a single prompt and continue into setup.</p>
                    </article>
                    <article className="setup-snapshot-card">
                      <h3>2. Personal profile</h3>
                      <p>
                        Name: {personal.name || "Not set"} | Age: {personal.age || "Not set"} | Sex: {personal.sex || "Not set"}
                      </p>
                    </article>
                    <article className="setup-snapshot-card">
                      <h3>3. Physique map</h3>
                      <p>Body metrics feed a visual snapshot before plan generation.</p>
                    </article>
                    <article className="setup-snapshot-card">
                      <h3>4. Plan generation</h3>
                      <p>
                        Goal: {form.goal || "Build lean strength and energy"} | {form.days || "3"} days | {form.duration || "45"} min
                      </p>
                    </article>
                  </div>
                  <div className="preview-plan-grid">
                    {samplePlan.map((block) => (
                      <article key={`preview-${block.day}`} className="plan-card">
                        <h3>{block.day}</h3>
                        <ul>
                          {block.blocks.slice(0, 3).map((line) => (
                            <li key={`${block.day}-${line}`}>{line}</li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                  <div className="stage-actions">
                    <button
                      type="button"
                      className="back-btn"
                      style={backBtnStyle}
                      onClick={() => goToStage("intro")}
                      disabled={isIntroTransitioning || isStageTransitioning}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="cta"
                      onClick={() => goToStage("personal")}
                      disabled={isIntroTransitioning || isStageTransitioning}
                    >
                      Continue
                    </button>
                  </div>
                </section>
              )}

              {homeStage === "personal" && (
                <section className="panel personal-panel stage-panel" ref={personalPanelRef}>
                  <header className="stage-header">
                    <div className="stage-header-main">
                      <h2>Personal Info</h2>
                    </div>
                    <div className={`segmented ${personalMode === "advanced" ? "pos-1" : "pos-0"}`}>
                      <button
                        type="button"
                        className={personalMode === "basic" ? "active" : ""}
                        onClick={() => setPersonalMode("basic")}
                      >
                        Basic
                      </button>
                      <button
                        type="button"
                        className={personalMode === "advanced" ? "active" : ""}
                        onClick={() => setPersonalMode("advanced")}
                      >
                        Advanced
                      </button>
                    </div>
                    <div className="form-auth-actions">
                      {user ? (
                        <>
                          <span className="muted">Signed in as {user.email}</span>
                          <button type="button" className="ghost" onClick={onLogout}>
                            Log out
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => go("/auth")}
                        >
                          Login / Sign up
                        </button>
                      )}
                    </div>
                  </header>

                  <form
                    className={`form personal-form ${personalMode === "advanced" ? "advanced-mode" : "basic-mode"}`}
                    onSubmit={onPersonalSubmit}
                  >
                    <label className="field-name">
                Full name
                <input
                  name="name"
                  value={personal.name}
                  onChange={onPersonalChange}
                  placeholder="Jordan Lee"
                />
              </label>
                    <label className="field-age">
                Age
                <input
                  name="age"
                  value={personal.age}
                  onChange={onPersonalChange}
                  type="number"
                  min="10"
                  max="99"
                  placeholder="28"
                />
                    </label>
                    <label className="metric-field metric-height field-height">
                <span className="label-row">
                  Height
                    <span
                      className={`unit-toggle ${heightUnit === "cm" ? "pos-1" : "pos-0"}`}
                      role="group"
                      aria-label="Height units"
                    >
                    <button
                      type="button"
                      className={heightUnit === "ft" ? "active" : ""}
                      onClick={() => {
                        const next = toFeetInchesFromCm(personal.heightCm);
                        setPersonal((prev) => ({
                          ...prev,
                          heightFeet: next.feet,
                          heightInches: next.inches
                        }));
                        setHeightUnit("ft");
                      }}
                    >
                      ft/in
                    </button>
                    <button
                      type="button"
                      className={heightUnit === "cm" ? "active" : ""}
                      onClick={() => {
                        setPersonal((prev) => ({
                          ...prev,
                          heightCm: toCmFromFeetInches(
                            prev.heightFeet,
                            prev.heightInches
                          )
                        }));
                        setHeightUnit("cm");
                      }}
                    >
                      cm
                    </button>
                  </span>
                </span>
                {heightUnit === "cm" ? (
                  <input
                    name="heightCm"
                    value={personal.heightCm}
                    onChange={onPersonalChange}
                    type="number"
                    min="120"
                    max="230"
                    placeholder="175"
                  />
                ) : (
                  <div className="height-split">
                    <div className="height-field">
                      <input
                        name="heightFeet"
                        value={personal.heightFeet}
                        onChange={onPersonalChange}
                        type="number"
                        min="3"
                        max="7"
                        placeholder="5"
                      />
                      <span className="height-unit">ft</span>
                    </div>
                    <div className="height-field">
                      <input
                        name="heightInches"
                        value={personal.heightInches}
                        onChange={onPersonalChange}
                        type="number"
                        min="0"
                        max="11"
                        placeholder="9"
                      />
                      <span className="height-unit">in</span>
                    </div>
                  </div>
                )}
              </label>
              <label className="metric-field field-weight">
                <span className="label-row">
                  Weight
                  <span
                    className={`unit-toggle ${weightUnit === "kg" ? "pos-1" : "pos-0"}`}
                    role="group"
                    aria-label="Weight units"
                  >
                    <button
                      type="button"
                      className={weightUnit === "lb" ? "active" : ""}
                      onClick={() => {
                        setPersonal((prev) => ({
                          ...prev,
                          weight: toLb(prev.weight, weightUnit)
                        }));
                        setWeightUnit("lb");
                      }}
                    >
                      lb
                    </button>
                    <button
                      type="button"
                      className={weightUnit === "kg" ? "active" : ""}
                      onClick={() => {
                        setPersonal((prev) => ({
                          ...prev,
                          weight: toKg(prev.weight, weightUnit)
                        }));
                        setWeightUnit("kg");
                      }}
                    >
                      kg
                    </button>
                  </span>
                </span>
                <input
                  name="weight"
                  value={personal.weight}
                  onChange={onPersonalChange}
                  type="number"
                  min={weightUnit === "kg" ? "35" : "77"}
                  max={weightUnit === "kg" ? "200" : "440"}
                  placeholder={weightUnit === "kg" ? "72" : "160"}
                />
              </label>
              <label className="field-sex">
                Sex
                <select name="sex" value={personal.sex} onChange={onPersonalChange}>
                  <option value="">Select</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Non-binary</option>
                  <option>Prefer not to say</option>
                </select>
              </label>

              <div className="advanced-fields-wrap" aria-hidden={personalMode !== "advanced"}>
                <div className="advanced-fields-inner">
                  <label>
                    Activity level
                    <select
                      name="activity"
                      value={personal.activity}
                      onChange={onPersonalChange}
                    >
                      <option value="">Select</option>
                      <option>Light</option>
                      <option>Moderate</option>
                      <option>High</option>
                      <option>Very high</option>
                    </select>
                  </label>
                  <label>
                    Sleep
                    <select
                      name="sleep"
                      value={personal.sleep}
                      onChange={onPersonalChange}
                    >
                      <option value="">Select</option>
                      <option>Less than 4</option>
                      <option>4 - 6 hours</option>
                      <option>7 - 8 hours</option>
                      <option>More than 8</option>
                    </select>
                  </label>
                  <label className="full">
                    Goal timeline
                    <input
                      name="timeline"
                      value={personal.timeline}
                      onChange={onPersonalChange}
                      placeholder="Example: 12 weeks to lose 10 lb"
                    />
                  </label>
                  <label>
                    Training experience
                    <select
                      name="experience"
                      value={personal.experience}
                      onChange={onPersonalChange}
                    >
                      <option value="">Select</option>
                      <option>Beginner</option>
                      <option>Intermediate</option>
                      <option>Advanced</option>
                    </select>
                  </label>
                  <label>
                    Nutrition preference
                    <select
                      name="nutrition"
                      value={personal.nutrition}
                      onChange={onPersonalChange}
                    >
                      <option value="">Select</option>
                      <option>No preference</option>
                      <option>High-protein</option>
                      <option>Balanced</option>
                      <option>Low-carb</option>
                      <option>Vegetarian</option>
                      <option>Vegan</option>
                    </select>
                  </label>
                  <label>
                    Cardio preference
                    <select
                      name="cardio"
                      value={personal.cardio}
                      onChange={onPersonalChange}
                    >
                      <option value="">Select</option>
                      <option>None</option>
                      <option>Walking</option>
                      <option>Running</option>
                      <option>Cycling</option>
                      <option>Rowing</option>
                      <option>Swimming</option>
                      <option>HIIT</option>
                      <option>Mixed</option>
                    </select>
                  </label>
                  <label className="full">
                    Training days
                    <div className="day-toggle-grid">
                      {trainingDayOptions.map((day) => {
                        const isSelected = Array.isArray(personal.trainingDays) &&
                          personal.trainingDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            className={`day-toggle-btn ${isSelected ? "active" : ""}`}
                            onClick={() => toggleTrainingDay(day)}
                          >
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </label>
                  <label className="full">
                    Additional Info
                    <input
                      name="notes"
                      value={personal.notes}
                      onChange={onPersonalChange}
                      placeholder="Past training, dietary restrictions, illness"
                    />
                  </label>
                </div>
                </div>
                    <div className="personal-footer full">
                      {!isPersonalComplete && (
                        <p className="muted personal-hint">
                          Enter name, age, height, weight, and sex to continue.
                        </p>
                      )}
                      <div className="stage-actions">
                        <button
                          type="button"
                          className="back-btn"
                          style={backBtnStyle}
                          onClick={() => goToStage("intro")}
                          disabled={isIntroTransitioning || isStageTransitioning}
                        >
                          Back
                        </button>
                        <button
                          className="cta"
                          type="submit"
                          disabled={!isPersonalComplete || isIntroTransitioning || isStageTransitioning}
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  </form>
                </section>
              )}

              {homeStage === "visualizer" && (
                <section className="visualizer-only-stage">
                  <div className="panel body-visual-panel stage-panel visualizer-only-panel" ref={visualPanelRef}>
                    <h2>Physique</h2>
                    <div className="visual-stage" role="img" aria-label={visualLabel}>
                      <div className="physique-render-surface">
                        <PhysiqueSilhouette2D shape={silhouetteShape} />
                      </div>
                    </div>
                    <div className="visualizer-only-actions">
                      <button
                        type="button"
                        className="back-btn"
                        style={backBtnStyle}
                        onClick={() => goToStage("personal")}
                        disabled={isIntroTransitioning || isStageTransitioning}
                      >
                        Back
                      </button>
                      <button
                        className="cta"
                        type="button"
                        onClick={() => transitionToStageFromTrigger("workout")}
                        disabled={isIntroTransitioning || isStageTransitioning}
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {homeStage === "workout" && (
                <div className="workout-stage-shell" ref={workoutShellRef}>
                  <section className="panel center-panel stage-panel workout-stage-panel" ref={workoutPanelRef}>
                    <div className="workout-header">
                      <button
                        type="button"
                        className="back-btn workout-back-arrow"
                        style={backBtnStyle}
                        aria-label="Back"
                        onClick={() => goToStage("visualizer")}
                        disabled={isIntroTransitioning || isStageTransitioning}
                      >
                        <svg
                          className="workout-back-arrow-icon"
                          viewBox="0 0 20 20"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M12.75 4.75L7.5 10L12.75 15.25"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <h2>Workout Generation</h2>
                    </div>
                    <div className="stage-actions workout-generate-row">
                      <button className="cta" type="button" onClick={openPlannerFromProfile}>
                        Generate Workout
                      </button>
                    </div>
                    {error && <p className="error">{error}</p>}
                  </section>

                  <section className="panel muted-panel stage-panel">
                    <h2>Sample Weekly Plan</h2>
                    <div className="grid">
                      {samplePlan.map((block) => (
                        <article key={block.day} className="plan-card">
                          <h3>{block.day}</h3>
                          <ul>
                            {block.blocks.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </main>
        </>
      )}

      {plannerModal}
      {generatedPlanModal}

      <div className="stage-measure" aria-hidden="true">
        <main className="content">
          <div className="home-stage">
            <div className="workout-stage-shell" ref={workoutMeasureShellRef}>
              <section className="panel center-panel stage-panel workout-stage-panel" ref={workoutMeasureRef}>
                <div className="workout-header">
                  <button type="button" className="back-btn workout-back-arrow" tabIndex={-1}>
                    <svg
                      className="workout-back-arrow-icon"
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M12.75 4.75L7.5 10L12.75 15.25"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <h2>Workout Generation</h2>
                </div>
                <div className="stage-actions workout-generate-row">
                  <button className="cta" type="button" tabIndex={-1}>
                    Generate Workout
                  </button>
                </div>
              </section>

              <section className="panel muted-panel stage-panel">
                <h2>Sample Weekly Plan</h2>
                <div className="grid">
                  {samplePlan.map((block) => (
                    <article key={`measure-${block.day}`} className="plan-card">
                      <h3>{block.day}</h3>
                      <ul>
                        {block.blocks.map((line) => (
                          <li key={`${block.day}-${line}`}>{line}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>

    </div>
  );
}
