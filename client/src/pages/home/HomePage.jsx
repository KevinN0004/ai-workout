/**
 * The home page: the intro, the walkthrough preview, the profile form, the
 * physique silhouette and the workout stage, one at a time, with the planner
 * and generated-plan modals App builds. Rendered by App for any path it does
 * not route elsewhere.
 */
// First on purpose, ahead of PreviewStage: imported after it, this sheet would
// follow PreviewStage.css in the built stylesheet and reorder the cascade.
import "./HomePage.css";
import useBodyModel from "./hooks/useBodyModel";
import { APP_BRAND_NAME } from "../../app/constants";
import useHomeStageFlow from "./hooks/useHomeStageFlow";
import PreviewStage from "./preview/PreviewStage";
import HomeIntroStage from "./components/HomeIntroStage";
import HomePersonalStage from "./components/HomePersonalStage";
import HomeVisualizerStage from "./components/HomeVisualizerStage";
import HomeWorkoutStage from "./components/HomeWorkoutStage";
import HomeWorkoutMeasure from "./components/HomeWorkoutMeasure";

// The days the personal stage's Training days toggles offer, stored as they
// are in `personal.trainingDays`.
const TRAINING_DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

// useBodyModel lays out the model's landmarks with these, in view-box units:
// the view box's height, the same as VIEWBOX_HEIGHT in physique/geometry.js,
// and how far above its bottom edge it puts the floor line the ankles are set
// from. They do not place the drawn outline, which buildTemplateOutline stands
// just above the bottom edge either way; they move the landmark heights its
// morph bands follow.
const SILHOUETTE_VIEW_HEIGHT = 430;
const SILHOUETTE_FLOOR_INSET = 18;

// The white Back control of the personal, physique and workout stages.
const BACK_BUTTON_STYLE = {
  background: "#fff",
  border: "1px solid rgba(255, 255, 255, 0.92)",
  color: "#000",
  boxShadow: "0 0 12px rgba(255, 255, 255, 0.56), 0 0 24px rgba(255, 255, 255, 0.28)"
};

// The physique stage's accessible name for the silhouette.
const VISUAL_LABEL =
  "Adaptive full-body silhouette generated from your profile measurements with proportional shoulder, torso, arm, and leg morphing.";

/**
 * Shows the stage useHomeStageFlow is on, feeding the stages the body model
 * useBodyModel derives from App's `personal` form. Most props are App's form
 * state, setters and unit converters, passed through to the stage that uses
 * them. `samplePlan` is the plan the workout stage shows; `plannerModal` and
 * `generatedPlanModal` are App's elements, rendered here whatever the stage.
 * The hidden workout copy is always rendered too, so the workout panel can be
 * measured before its stage exists.
 */
export default function HomePage({
  gradient,
  user,
  onLogout,
  go,
  form,
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
  // ---- Training days --------------------------------------------------------
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

  // ---- Stage flow and body model --------------------------------------------
  const {
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
  } = useHomeStageFlow({
    onResetPersonalFlow,
    samplePlanLength: samplePlan.length,
    personalMode
  });

  const {
    resolvedHeightCm,
    resolvedWeightKg,
    isPersonalComplete,
    effectiveBodyFat,
    silhouetteShape,
    silhouetteRenderSignature
  } = useBodyModel({
    personal,
    heightUnit,
    weightUnit,
    toCmFromFeetInches,
    toKg,
    silhouetteViewHeight: SILHOUETTE_VIEW_HEIGHT,
    silhouetteFloorInset: SILHOUETTE_FLOOR_INSET
  });

  // ---- Personal stage submit ------------------------------------------------
  // Continue on the personal stage moves to the physique stage through the
  // morph, once the profile is complete and nothing is animating.
  const onPersonalSubmit = (event) => {
    event.preventDefault();
    if (!isPersonalComplete || isIntroTransitioning || isStageTransitioning) return;
    transitionToStageFromTrigger("visualizer");
  };

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="page home-page" style={gradient}>
      {/* ---- Sticky nav: the brand returns to the intro ---- */}
      <div className="home-sticky-nav">
        <span className="home-nav-spacer" aria-hidden="true" />
        <button type="button" className="home-nav-title" onClick={() => goToStage("intro")}>
          {APP_BRAND_NAME}
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

      {/* ---- The current stage; all but the intro share the keyed wrapper ---- */}
      {homeStage === "intro" ? (
        <HomeIntroStage
          introPanelRef={introPanelRef}
          introTitleRef={introTitleRef}
          introButtonRef={introButtonRef}
          stageDirection={stageDirection}
          isIntroTransitioning={isIntroTransitioning}
          isStageTransitioning={isStageTransitioning}
          onGetStarted={onGetStarted}
        />
      ) : (
        <main className="content">
          <div
            key={homeStage}
            className={`home-stage home-stage-${homeStage} stage-${stageDirection} ${
              suppressStageEnter ? "stage-snap" : ""
            } ${isStageTransitioning ? "stage-transition-hidden" : ""}`}
          >
            {homeStage === "preview" && (
              <PreviewStage
                personal={personal}
                form={form}
                heightUnit={heightUnit}
                weightUnit={weightUnit}
                toFeetInchesFromCm={toFeetInchesFromCm}
                toLb={toLb}
                resolvedHeightCm={resolvedHeightCm}
                resolvedWeightKg={resolvedWeightKg}
                effectiveBodyFat={effectiveBodyFat}
              />
            )}

            {homeStage === "personal" && (
              <HomePersonalStage
                personalPanelRef={personalPanelRef}
                personalMode={personalMode}
                setPersonalMode={setPersonalMode}
                user={user}
                onLogout={onLogout}
                go={go}
                onPersonalSubmit={onPersonalSubmit}
                personal={personal}
                onPersonalChange={onPersonalChange}
                heightUnit={heightUnit}
                setHeightUnit={setHeightUnit}
                toFeetInchesFromCm={toFeetInchesFromCm}
                toCmFromFeetInches={toCmFromFeetInches}
                setPersonal={setPersonal}
                weightUnit={weightUnit}
                setWeightUnit={setWeightUnit}
                toLb={toLb}
                toKg={toKg}
                trainingDayOptions={TRAINING_DAY_OPTIONS}
                toggleTrainingDay={toggleTrainingDay}
                isPersonalComplete={isPersonalComplete}
                backBtnStyle={BACK_BUTTON_STYLE}
                goToStage={goToStage}
                isIntroTransitioning={isIntroTransitioning}
                isStageTransitioning={isStageTransitioning}
              />
            )}

            {homeStage === "visualizer" && (
              <HomeVisualizerStage
                visualPanelRef={visualPanelRef}
                visualLabel={VISUAL_LABEL}
                silhouetteRenderSignature={silhouetteRenderSignature}
                silhouetteShape={silhouetteShape}
                backBtnStyle={BACK_BUTTON_STYLE}
                onBack={() => goToStage("personal")}
                onContinue={() => transitionToStageFromTrigger("workout")}
                isIntroTransitioning={isIntroTransitioning}
                isStageTransitioning={isStageTransitioning}
              />
            )}

            {homeStage === "workout" && (
              <HomeWorkoutStage
                workoutShellRef={workoutShellRef}
                workoutPanelRef={workoutPanelRef}
                backBtnStyle={BACK_BUTTON_STYLE}
                onBack={() => goToStage("visualizer")}
                isIntroTransitioning={isIntroTransitioning}
                isStageTransitioning={isStageTransitioning}
                openPlannerFromProfile={openPlannerFromProfile}
                error={error}
                samplePlan={samplePlan}
              />
            )}
          </div>
        </main>
      )}

      {/* ---- App's modals, and the hidden workout copy ---- */}
      {plannerModal}
      {generatedPlanModal}

      <HomeWorkoutMeasure
        workoutMeasureShellRef={workoutMeasureShellRef}
        workoutMeasureRef={workoutMeasureRef}
        samplePlan={samplePlan}
      />
    </div>
  );
}
