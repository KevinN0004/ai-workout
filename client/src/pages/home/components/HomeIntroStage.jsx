export default function HomeIntroStage({
  introPanelRef,
  introTitleRef,
  introButtonRef,
  stageDirection,
  isIntroTransitioning,
  isStageTransitioning,
  onGetStarted,
  isDevEnvironment,
  onDevOpenVisualizer
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
          {isDevEnvironment && (
            <button
              className="ghost"
              type="button"
              onClick={onDevOpenVisualizer}
              disabled={isIntroTransitioning || isStageTransitioning}
            >
              Dev: Visualizer
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
