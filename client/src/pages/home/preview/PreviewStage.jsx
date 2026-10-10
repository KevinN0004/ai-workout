/**
 * The home page's guided walkthrough, its "preview" stage: a sample of the app
 * played chapter by chapter, from Personal Info to the dashboard, beside a
 * table of contents for jumping between them. Rendered by HomePage.
 */
import { useEffect, useRef, useState } from "react";
import { createDefaultPreviewWeekLineOffsets, PREVIEW_TOC_SWITCH_MS } from "./constants";
import PreviewToc from "./components/PreviewToc";
import PreviewPersonalChapter from "./components/PreviewPersonalChapter";
import PreviewWorkoutWeekChapter from "./components/PreviewWorkoutWeekChapter";
import PreviewDashboardChapter from "./components/PreviewDashboardChapter";
import usePreviewWeekOutline from "./hooks/usePreviewWeekOutline";
import usePreviewChapterFlow from "./hooks/usePreviewChapterFlow";
import usePreviewWeekParticleAnimation from "./hooks/usePreviewWeekParticleAnimation";
import usePreviewDerivedData from "./hooks/usePreviewDerivedData";
import "./PreviewStage.css";

/**
 * Owns the walkthrough's state: the current chapter, the table of contents'
 * switch, each chapter's stage, the fields filled so far and the form's
 * collapsed and shifted flags, the week outline's line positions and the typing
 * progress. Its hooks derive the content and play each chapter; the chapter
 * components render it. `personal` and `form` are App's profile and planner
 * form and `heightUnit` and `weightUnit` App's units; the converters are
 * app/units.js's, and the body figures useBodyModel's, both passed down by
 * HomePage. HomePage mounts it afresh each time the stage opens, so the
 * walkthrough always starts at Personal Info.
 */
export default function PreviewStage({
  personal,
  form,
  heightUnit,
  weightUnit,
  toFeetInchesFromCm,
  toLb,
  resolvedHeightCm,
  resolvedWeightKg,
  effectiveBodyFat
}) {
  // ---- Refs and state -------------------------------------------------------
  const previewFillTimeoutsRef = useRef([]);
  const previewStageRef = useRef(null);
  const previewWeekTableWrapRef = useRef(null);
  const previewWeekParticleLayerRef = useRef(null);
  const previewWeekParticlePlayersRef = useRef([]);
  const previewWeekParticleTargetsRef = useRef([]);
  const previewTocSwitchTimeoutRef = useRef(null);
  const previewStepIndexRef = useRef(0);
  const [previewStepIndex, setPreviewStepIndex] = useState(0);
  const [previewTocExpandingIndex, setPreviewTocExpandingIndex] = useState(null);
  const [previewTocContractingIndex, setPreviewTocContractingIndex] = useState(null);
  const [previewFilledFields, setPreviewFilledFields] = useState({});
  const [previewPersonalCollapsed, setPreviewPersonalCollapsed] = useState(false);
  const [previewPersonalShifted, setPreviewPersonalShifted] = useState(false);
  const [previewBuilderStage, setPreviewBuilderStage] = useState(0);
  const [previewWeekStage, setPreviewWeekStage] = useState(0);
  const [previewDashboardStage, setPreviewDashboardStage] = useState(0);
  const [previewWeekLineOffsets, setPreviewWeekLineOffsets] = useState(
    createDefaultPreviewWeekLineOffsets
  );
  const [previewWeekHeaderTypingProgress, setPreviewWeekHeaderTypingProgress] = useState(0);
  const [previewWeekTypingProgress, setPreviewWeekTypingProgress] = useState(0);

  // ---- Derived content ------------------------------------------------------
  const {
    previewWeekPlan,
    previewDashboardSummary,
    previewPersonalTargets,
    previewFillOrder,
    previewInitialTargetsRef,
    previewInitialFillOrderRef,
    previewChapters,
    generateChapterIndex,
    workoutWeekChapterIndex,
    dashboardPreviewChapterIndex,
    activePreviewChapter,
    previewStageStyle,
    previewTocStyle,
    getPreviewTextRows,
    getPreviewWeekHeaderTypedText,
    getPreviewWeekTypedText
  } = usePreviewDerivedData({
    personal,
    form,
    weightUnit,
    toFeetInchesFromCm,
    toLb,
    resolvedHeightCm,
    resolvedWeightKg,
    effectiveBodyFat,
    previewStepIndex,
    previewWeekStage,
    previewWeekHeaderTypingProgress,
    previewWeekTypingProgress
  });

  // ---- Chapter bodies and switching -----------------------------------------
  const clearPreviewTocSwitchTimer = () => {
    if (!previewTocSwitchTimeoutRef.current) return;
    window.clearTimeout(previewTocSwitchTimeoutRef.current);
    previewTocSwitchTimeoutRef.current = null;
  };

  // Personal Info and Generate are one component, Generate in its builder view.
  const renderPreviewChapterBody = (chapter) =>
    chapter.id === "personal-info" ? (
      <PreviewPersonalChapter
        previewPersonalCollapsed={previewPersonalCollapsed}
        previewPersonalShifted={previewPersonalShifted}
        previewBuilderStage={previewBuilderStage}
        previewFilledFields={previewFilledFields}
        heightUnit={heightUnit}
        weightUnit={weightUnit}
        getPreviewTextRows={getPreviewTextRows}
      />
    ) : chapter.id === "generate" ? (
      <PreviewPersonalChapter
        isGenerateView
        previewPersonalCollapsed={previewPersonalCollapsed}
        previewPersonalShifted={previewPersonalShifted}
        previewBuilderStage={previewBuilderStage}
        previewFilledFields={previewFilledFields}
        heightUnit={heightUnit}
        weightUnit={weightUnit}
        getPreviewTextRows={getPreviewTextRows}
      />
    ) : chapter.id === "workout-week" ? (
      <PreviewWorkoutWeekChapter
        previewWeekLineOffsets={previewWeekLineOffsets}
        previewWeekStage={previewWeekStage}
        previewWeekTypingProgress={previewWeekTypingProgress}
        previewWeekPlan={previewWeekPlan}
        previewWeekTableWrapRef={previewWeekTableWrapRef}
        previewWeekParticleLayerRef={previewWeekParticleLayerRef}
        getPreviewWeekHeaderTypedText={getPreviewWeekHeaderTypedText}
        getPreviewWeekTypedText={getPreviewWeekTypedText}
      />
    ) : chapter.id === "dashboard-preview" ? (
      <PreviewDashboardChapter
        previewDashboardSummary={previewDashboardSummary}
        previewDashboardStage={previewDashboardStage}
      />
    ) : // usePreviewDerivedData builds exactly these four chapters, so nothing
    // reaches here.
    null;

  const scrollPreviewIntoView = () => {
    if (!previewStageRef.current) return;
    previewStageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Switches to a chapter, held to the list, unless it is the one showing. The
  // table of contents and the chapter hooks both move on through this, and the
  // chips keep their expanding and contracting classes for PREVIEW_TOC_SWITCH_MS.
  // Despite the name it does not scroll; only the mount effect does.
  const scrollToChapter = (targetIndex) => {
    const boundedIndex = Math.max(0, Math.min(targetIndex, previewChapters.length - 1));
    const currentIndex = previewStepIndexRef.current;
    if (currentIndex === boundedIndex) return;
    clearPreviewTocSwitchTimer();
    setPreviewTocContractingIndex(currentIndex);
    setPreviewTocExpandingIndex(boundedIndex);
    setPreviewStepIndex(boundedIndex);
    previewStepIndexRef.current = boundedIndex;
    previewTocSwitchTimeoutRef.current = window.setTimeout(() => {
      setPreviewTocContractingIndex(null);
      setPreviewTocExpandingIndex(null);
      previewTocSwitchTimeoutRef.current = null;
    }, PREVIEW_TOC_SWITCH_MS);
  };

  // ---- Effects --------------------------------------------------------------
  // While the walkthrough is mounted, `preview-smooth-scroll` on <html> gives
  // the page a top scroll padding and, unless the visitor prefers reduced
  // motion, smooth scrolling (styles/layout/base.css, styles/responsive.css).
  useEffect(() => {
    const rootEl = document.documentElement;
    if (!rootEl) return undefined;
    rootEl.classList.add("preview-smooth-scroll");
    return () => {
      rootEl.classList.remove("preview-smooth-scroll");
    };
  }, []);

  // Keeps the ref equal to the chapter index for the code that reads it outside
  // a render: scrollToChapter, and the particle animation's completion. Both
  // places that set the index write the ref at once too, so this restates a
  // value the ref already holds.
  useEffect(() => {
    previewStepIndexRef.current = previewStepIndex;
  }, [previewStepIndex]);

  // On mount, the first chapter, and two animation frames on, once the stage
  // has been painted, a smooth scroll that brings its top up to the page's
  // scroll padding. The index already starts at 0, so the reset changes nothing
  // here. The frames are not cancelled, so a PreviewStage that unmounts before
  // they run reaches scrollPreviewIntoView with no element, which its null
  // check covers.
  useEffect(() => {
    setPreviewStepIndex(0);
    previewStepIndexRef.current = 0;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollPreviewIntoView);
    });
  }, []);

  // ---- The chapter hooks ----------------------------------------------------
  // When more than one of their effects runs in a commit, they run in this
  // order: the outline's, the chapter flow's, then the particle animation's.
  usePreviewWeekOutline({
    activePreviewChapterId: activePreviewChapter.id,
    previewWeekPlan,
    previewWeekTableWrapRef,
    setPreviewWeekLineOffsets
  });

  const { clearPreviewFillTimers } = usePreviewChapterFlow({
    activePreviewChapterId: activePreviewChapter.id,
    generateChapterIndex,
    workoutWeekChapterIndex,
    previewInitialTargetsRef,
    previewInitialFillOrderRef,
    previewPersonalTargets,
    previewFillOrder,
    previewFillTimeoutsRef,
    scrollToChapter,
    setPreviewFilledFields,
    setPreviewPersonalCollapsed,
    setPreviewPersonalShifted,
    setPreviewBuilderStage,
    setPreviewWeekStage,
    setPreviewDashboardStage,
    setPreviewWeekHeaderTypingProgress,
    setPreviewWeekTypingProgress
  });

  const { clearPreviewWeekParticleAnimation } = usePreviewWeekParticleAnimation({
    activePreviewChapterId: activePreviewChapter.id,
    previewWeekStage,
    previewWeekTableWrapRef,
    previewWeekParticleLayerRef,
    previewWeekParticlePlayersRef,
    previewWeekParticleTargetsRef,
    previewFillTimeoutsRef,
    dashboardPreviewChapterIndex,
    workoutWeekChapterIndex,
    previewStepIndexRef,
    scrollToChapter,
    setPreviewWeekStage
  });

  // Unmount cleanup. Both clear functions are useCallbacks keyed only on refs,
  // so they are stable for the component's life -- listing them cannot make
  // this effect re-run, and it removes the risk of the cleanup closing over a
  // stale first-render copy. clearPreviewTocSwitchTimer is new each render and
  // left out; the first render's copy reads only a ref, so it clears the same
  // timer.
  useEffect(
    () => () => {
      clearPreviewFillTimers();
      clearPreviewWeekParticleAnimation();
      clearPreviewTocSwitchTimer();
    },
    [clearPreviewFillTimers, clearPreviewWeekParticleAnimation]
  );

  // ---- Render ---------------------------------------------------------------
  return (
    <section
      ref={previewStageRef}
      className="panel preview-stage-panel stage-panel"
      style={previewStageStyle}
    >
      {/* ---- The chapter's title, keyed on the chapter so each one enters afresh ---- */}
      <div className="preview-view-header-section">
        <header className="preview-stage-header">
          <p className="preview-stage-kicker">Guided walkthrough</p>
          <div className="preview-stage-title-row">
            <div className="preview-stage-title-stack" aria-live="polite">
              <h2
                key={`preview-title-${activePreviewChapter.id}`}
                className="preview-stage-title is-sliding-in-right"
              >
                {activePreviewChapter.title}
              </h2>
            </div>
          </div>
        </header>
      </div>
      {/* ---- The table of contents and the current chapter ---- */}
      <div className="preview-view-body-section">
        <div className="preview-layout-frame">
          <PreviewToc
            chapters={previewChapters}
            previewStepIndex={previewStepIndex}
            previewTocExpandingIndex={previewTocExpandingIndex}
            previewTocContractingIndex={previewTocContractingIndex}
            previewTocStyle={previewTocStyle}
            onSelectChapter={scrollToChapter}
          />
          <div className="preview-scroll-story">
            <div className="preview-step-shell">
              <article
                className={`setup-snapshot-card setup-snapshot-card-detailed preview-step-card ${
                  activePreviewChapter.id === "generate" ? "is-generate-view" : ""
                } ${
                  (activePreviewChapter.id === "personal-info" && previewPersonalCollapsed) ||
                  activePreviewChapter.id === "generate"
                    ? "is-personal-collapsed"
                    : ""
                }`}
              >
                <div className="preview-card-pages">
                  <section className="preview-card-page active">
                    {renderPreviewChapterBody(activePreviewChapter)}
                  </section>
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
