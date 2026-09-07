import { useEffect, useRef, useState } from "react";
import { createDefaultPreviewWeekLineOffsets, PREVIEW_TOC_SWITCH_MS } from "./preview/constants";
import PreviewToc from "./preview/components/PreviewToc";
import PreviewPersonalChapter from "./preview/components/PreviewPersonalChapter";
import PreviewWorkoutWeekChapter from "./preview/components/PreviewWorkoutWeekChapter";
import PreviewDashboardChapter from "./preview/components/PreviewDashboardChapter";
import usePreviewWeekOutline from "./preview/hooks/usePreviewWeekOutline";
import usePreviewChapterFlow from "./preview/hooks/usePreviewChapterFlow";
import usePreviewWeekParticleAnimation from "./preview/hooks/usePreviewWeekParticleAnimation";
import usePreviewDerivedData from "./preview/hooks/usePreviewDerivedData";
import "./PreviewPage.css";

export default function PreviewPage({
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
    getPreviewFieldRows,
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

  const clearPreviewTocSwitchTimer = () => {
    if (!previewTocSwitchTimeoutRef.current) return;
    window.clearTimeout(previewTocSwitchTimeoutRef.current);
    previewTocSwitchTimeoutRef.current = null;
  };

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
    ) : (
      <div className="preview-fields-grid">
        {chapter.fields.map((field, fieldIndex) => {
          const rows = field.multiline ? field.rows || 3 : getPreviewFieldRows(field);
          return (
            <label key={`${chapter.id}-${field.label}-${fieldIndex}`} className="preview-field-row">
              <span>{field.label}</span>
              <textarea
                className={`preview-field-input ${rows > 1 ? "wrapped" : "single-line"}`}
                value={String(field.value ?? "")}
                rows={rows}
                readOnly
              />
            </label>
          );
        })}
      </div>
    );

  const scrollPreviewIntoView = () => {
    if (!previewStageRef.current) return;
    previewStageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

  useEffect(() => {
    const rootEl = document.documentElement;
    if (!rootEl) return undefined;
    rootEl.classList.add("preview-smooth-scroll");
    return () => {
      rootEl.classList.remove("preview-smooth-scroll");
    };
  }, []);

  useEffect(() => {
    previewStepIndexRef.current = previewStepIndex;
  }, [previewStepIndex]);

  useEffect(() => {
    setPreviewStepIndex(0);
    previewStepIndexRef.current = 0;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollPreviewIntoView);
    });
  }, []);

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
  // stale first-render copy.
  useEffect(
    () => () => {
      clearPreviewFillTimers();
      clearPreviewWeekParticleAnimation();
      clearPreviewTocSwitchTimer();
    },
    [clearPreviewFillTimers, clearPreviewWeekParticleAnimation]
  );

  return (
    <section
      ref={previewStageRef}
      className="panel preview-stage-panel stage-panel"
      style={previewStageStyle}
    >
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
