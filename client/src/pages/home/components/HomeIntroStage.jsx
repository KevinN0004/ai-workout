import { APP_BRAND_TAGLINE } from "../../../app/constants";

export default function HomeIntroStage({
  introPanelRef,
  introTitleRef,
  introButtonRef,
  stageDirection,
  isIntroTransitioning,
  isStageTransitioning,
  onGetStarted
}) {
  return (
    <main className="content home-intro-wrap">
      <section
        ref={introPanelRef}
        className={`panel home-intro-panel home-stage stage-${stageDirection} ${
          isIntroTransitioning ? "intro-transitioning" : ""
        }`}
      >
        <h1 ref={introTitleRef} className="home-hook-title">
          {APP_BRAND_TAGLINE}
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
  );
}
