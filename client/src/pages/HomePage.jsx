import "./HomePage.css";
import useBodyModel from "./home/useBodyModel";
import { APP_BRAND_NAME } from "../app/constants";
import useHomeStageFlow from "./home/hooks/useHomeStageFlow";
import PreviewPage from "./PreviewPage";
import HomeIntroStage from "./home/components/HomeIntroStage";
import HomePersonalStage from "./home/components/HomePersonalStage";
import HomeVisualizerStage from "./home/components/HomeVisualizerStage";
import HomeWorkoutStage from "./home/components/HomeWorkoutStage";
import HomeWorkoutMeasure from "./home/components/HomeWorkoutMeasure";

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

  const silhouetteViewHeight = 430;
  const silhouetteFloorInset = 18;

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
    silhouetteViewHeight,
    silhouetteFloorInset
  });

  const onPersonalSubmit = (event) => {
    event.preventDefault();
    if (!isPersonalComplete || isIntroTransitioning || isStageTransitioning) return;
    transitionToStageFromTrigger("visualizer");
  };

  const backBtnStyle = {
    background: "#fff",
    border: "1px solid rgba(255, 255, 255, 0.92)",
    color: "#000",
    boxShadow: "0 0 12px rgba(255, 255, 255, 0.56), 0 0 24px rgba(255, 255, 255, 0.28)"
  };

  const visualLabel = "Adaptive full-body silhouette generated from your profile measurements with proportional shoulder, torso, arm, and leg morphing.";

  return (
    <div className="page home-page" style={gradient}>
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
              <PreviewPage
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
                trainingDayOptions={trainingDayOptions}
                toggleTrainingDay={toggleTrainingDay}
                isPersonalComplete={isPersonalComplete}
                backBtnStyle={backBtnStyle}
                goToStage={goToStage}
                isIntroTransitioning={isIntroTransitioning}
                isStageTransitioning={isStageTransitioning}
              />
            )}

            {homeStage === "visualizer" && (
              <HomeVisualizerStage
                visualPanelRef={visualPanelRef}
                visualLabel={visualLabel}
                silhouetteRenderSignature={silhouetteRenderSignature}
                silhouetteShape={silhouetteShape}
                backBtnStyle={backBtnStyle}
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
                backBtnStyle={backBtnStyle}
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
