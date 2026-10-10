/**
 * The home page's opening stage: the brand tagline and the Get Started button.
 * Rendered by HomePage while its stage is "intro".
 */
import { APP_BRAND_TAGLINE } from "../../../app/constants";

/**
 * The three refs are useHomeStageFlow's: onGetStarted grows the button into a
 * panel centred on the intro panel while the title and panel fade, then moves
 * to the personal stage. Unlike the other stages this is not inside
 * HomePage's keyed stage wrapper, so the panel carries the `home-stage`
 * direction class itself.
 */
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
