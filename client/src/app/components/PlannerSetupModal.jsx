/**
 * The four-step planner that collects a plan request: environment and
 * equipment; schedule, level and injuries; focus; then a short health check.
 * App builds it; HomePage and DashboardPage render it.
 */
import ModalPortal from "../../components/ModalPortal";
import OfflineHint from "../../components/OfflineHint";
import useConnection from "../../hooks/useConnection";
import { equipmentOptionsByEnv, injuryOptions, quickFocuses } from "../constants";
import thumbHomeBodyweight from "../assets/planner-thumbs/home-bodyweight.svg";
import thumbHomeDumbbells from "../assets/planner-thumbs/home-dumbbells.svg";
import thumbHomeKettlebell from "../assets/planner-thumbs/home-kettlebell.svg";
import thumbHomePullup from "../assets/planner-thumbs/home-pullup.svg";
import thumbHomeBands from "../assets/planner-thumbs/home-bands.svg";
import thumbHomeBench from "../assets/planner-thumbs/home-bench.svg";
import thumbHomeYogaMat from "../assets/planner-thumbs/home-yoga-mat.svg";
import thumbCommercialFullGym from "../assets/planner-thumbs/commercial-full-gym.svg";
import thumbCommercialStrengthFloor from "../assets/planner-thumbs/commercial-strength-floor.svg";
import thumbCommercialCardioDeck from "../assets/planner-thumbs/commercial-cardio-deck.svg";
import thumbCommercialFunctionalZone from "../assets/planner-thumbs/commercial-functional-zone.svg";
import thumbCommercialGroupStudio from "../assets/planner-thumbs/commercial-group-studio.svg";
import thumbCommercialPool from "../assets/planner-thumbs/commercial-pool.svg";
import thumbCommercialCourt from "../assets/planner-thumbs/commercial-court.svg";
import thumbCommercialRecovery from "../assets/planner-thumbs/commercial-recovery.svg";

const plannerHeaderTitleByStep = {
  1: "Environment",
  2: "Schedule",
  3: "Focus",
  4: "Health check"
};

const LAST_STEP = 4;

// The health check's questions, in the app's own words (the PAR-Q+ licence
// permits no edits), after ACSM's 2015 screening and the pregnancy guidelines
// (docs/specs/2026-11-03-rule-based-plans-design.md, "The health screen").
const HEALTH_QUESTIONS = [
  [
    "condition",
    "Has a doctor told you that you have a heart condition, high blood pressure, diabetes, or a lung, kidney or liver condition?"
  ],
  [
    "symptoms",
    "Do you get chest pain or pressure, faint or feel dizzy, or become unusually short of breath, during activity or at rest?"
  ],
  [
    "supervised",
    "Has a health professional told you to exercise only under supervision, or to limit physical activity?"
  ],
  ["pregnant", "Are you pregnant, or have you given birth in the last six months?"]
];

const equipmentThumbByLabel = {
  "bodyweight only": { image: thumbHomeBodyweight, tone: "tone-mobility" },
  dumbbells: { image: thumbHomeDumbbells, tone: "tone-strength" },
  kettlebell: { image: thumbHomeKettlebell, tone: "tone-strength" },
  "pull-up bar": { image: thumbHomePullup, tone: "tone-strength" },
  "resistance bands": { image: thumbHomeBands, tone: "tone-mobility" },
  "adjustable bench": { image: thumbHomeBench, tone: "tone-strength" },
  "yoga mat": { image: thumbHomeYogaMat, tone: "tone-mobility" },
  "full gym access": { image: thumbCommercialFullGym, tone: "tone-studio" },
  "strength floor": { image: thumbCommercialStrengthFloor, tone: "tone-strength" },
  "cardio deck": { image: thumbCommercialCardioDeck, tone: "tone-endurance" },
  "functional training zone": { image: thumbCommercialFunctionalZone, tone: "tone-mobility" },
  "group class studio": { image: thumbCommercialGroupStudio, tone: "tone-studio" },
  "pool / aquatic center": { image: thumbCommercialPool, tone: "tone-endurance" },
  "court sports area": { image: thumbCommercialCourt, tone: "tone-endurance" },
  "recovery & mobility zone": { image: thumbCommercialRecovery, tone: "tone-mobility" },
  // Labels equipmentOptionsByEnv does not offer. The grid below looks up only
  // that list's labels, so nothing in the app reaches these five entries.
  "barbell + plates": { image: thumbCommercialStrengthFloor, tone: "tone-strength" },
  "cable machine": { image: thumbCommercialStrengthFloor, tone: "tone-machine" },
  "smith machine": { image: thumbCommercialStrengthFloor, tone: "tone-machine" },
  "cardio machines": { image: thumbCommercialCardioDeck, tone: "tone-endurance" },
  "free weights": { image: thumbCommercialStrengthFloor, tone: "tone-strength" }
};

const resolveEquipmentThumb = (label) => {
  const key = String(label || "")
    .trim()
    .toLowerCase();
  return (
    equipmentThumbByLabel[key] || {
      image: thumbCommercialFullGym,
      tone: "tone-studio"
    }
  );
};

/**
 * Renders while `plannerOpen` is set, on step `plannerStep` (1 to 4). Every
 * choice it shows is App's `form`, changed through the handlers passed in; the
 * last step's button calls `onSubmit`, which generates the plan; it is
 * disabled offline, because the server builds the plan.
 */
export default function PlannerSetupModal({
  plannerOpen,
  plannerStep,
  setPlannerStep,
  closePlanner,
  form,
  onEnvironmentChange,
  toggleEquipment,
  onChange,
  toggleFocus,
  setHealthAnswer,
  loading,
  onSubmit
}) {
  const offline = useConnection() === "offline";
  if (!plannerOpen) return null;
  const plannerHeaderTitle = plannerHeaderTitleByStep[plannerStep] || plannerHeaderTitleByStep[1];
  const isCommercialEnvironment = form.environment === "Commercial";
  const hasFullGymAccess = isCommercialEnvironment && form.equipment.includes("Full gym access");

  return (
    <ModalPortal open={plannerOpen} onClose={closePlanner}>
      <div
        className="modal-backdrop planner-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planner-setup-modal-title"
      >
        <div className="modal planner-setup-modal">
          {/* ---- Header: back, step title, close ---- */}
          <div className="modal-header">
            {plannerStep > 1 ? (
              <button
                type="button"
                className="back-btn planner-back-arrow planner-header-back"
                aria-label="Back"
                onClick={() => setPlannerStep((prev) => Math.max(1, prev - 1))}
              >
                <svg
                  className="planner-back-arrow-icon"
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
            ) : (
              <span className="planner-header-spacer" aria-hidden="true" />
            )}
            <h2 id="planner-setup-modal-title">{plannerHeaderTitle}</h2>
            <button
              type="button"
              className="ghost icon-button planner-close-icon"
              aria-label="Close planner"
              onClick={closePlanner}
            >
              &times;
            </button>
          </div>
          <div className="modal-body">
            {/* ---- Step 1: environment and equipment ---- */}
            {plannerStep === 1 && (
              <div className="step-panel planner-step-panel">
                <div className="step-top">
                  <div
                    className={`segmented planner-env-toggle ${
                      form.environment === "Commercial" ? "pos-1" : "pos-0"
                    }`}
                  >
                    <button
                      type="button"
                      className={form.environment === "Home" ? "active" : ""}
                      onClick={() => onEnvironmentChange("Home")}
                    >
                      Home
                    </button>
                    <button
                      type="button"
                      className={form.environment === "Commercial" ? "active" : ""}
                      onClick={() => onEnvironmentChange("Commercial")}
                    >
                      Commercial
                    </button>
                  </div>
                </div>
                <p className="muted planner-step-copy">
                  {isCommercialEnvironment
                    ? "Select the rooms and operations your gym offers."
                    : "Select the equipment available in your home setup."}
                </p>
                {hasFullGymAccess && (
                  <p className="muted planner-step-copy">
                    Full gym access selected: all commercial rooms and operations are included.
                  </p>
                )}
                <div className="option-grid">
                  {equipmentOptionsByEnv[form.environment].map((item) => {
                    const thumb = resolveEquipmentThumb(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        className={`equip-card ${form.equipment.includes(item) ? "active" : ""}`}
                        onClick={() => toggleEquipment(item)}
                      >
                        <span className={`equip-thumb ${thumb.tone}`} aria-hidden="true">
                          <img
                            className="equip-thumb-image"
                            src={thumb.image}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        </span>
                        <span className="equip-label">{item}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {/* ---- Step 2: schedule, level and injuries ---- */}
            {plannerStep === 2 && (
              <div className="step-panel planner-step-panel">
                <form className="form planner-step-two-form">
                  <label>
                    Days per week
                    <select name="days" value={form.days} onChange={onChange}>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                      <option value="6">6</option>
                      <option value="7">7</option>
                    </select>
                  </label>
                  <label>
                    Session length (minutes)
                    <select name="duration" value={form.duration} onChange={onChange}>
                      <option value="30">30</option>
                      <option value="45">45</option>
                      <option value="60">60</option>
                      <option value="75">75</option>
                      <option value="90">90</option>
                    </select>
                  </label>
                  <label>
                    Experience level
                    <select name="level" value={form.level} onChange={onChange}>
                      <option>Beginner</option>
                      <option>Intermediate</option>
                      <option>Advanced</option>
                    </select>
                  </label>
                  <label>
                    Injuries or limitations
                    <select name="injuries" value={form.injuries} onChange={onChange}>
                      {injuryOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                </form>
              </div>
            )}
            {/* ---- Step 3: focus ---- */}
            {plannerStep === 3 && (
              <div className="step-panel planner-step-panel">
                <p className="muted">Select one or more focus areas for this plan.</p>
                <div className="option-grid focus-option-grid">
                  {quickFocuses.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`equip-card focus-chip ${form.focuses.includes(item) ? "active" : ""}`}
                      onClick={() => toggleFocus(item)}
                    >
                      <span className="equip-label">{item}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* ---- Step 4: the health check ---- */}
            {plannerStep === 4 && (
              <div className="step-panel planner-step-panel">
                <p className="muted planner-step-copy">
                  Answer yes to any that apply. A yes keeps every session at a pace where you can
                  talk, and it never stops you getting a plan.
                </p>
                <form className="form planner-step-two-form">
                  {HEALTH_QUESTIONS.map(([name, question]) => (
                    <label key={name}>
                      {question}
                      <select
                        name={name}
                        value={form.health?.[name] ? "yes" : "no"}
                        onChange={(event) => setHealthAnswer(name, event.target.value === "yes")}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </label>
                  ))}
                </form>
                <p className="muted planner-step-copy">
                  For a fuller self-check, see the{" "}
                  <a href="https://eparmedx.com/" target="_blank" rel="noopener noreferrer">
                    PAR-Q+
                  </a>
                  .
                </p>
              </div>
            )}
          </div>
          {/* ---- Footer: next, or generate on the last step ---- */}
          <div
            className={`modal-footer ${plannerStep === LAST_STEP ? "planner-footer-center" : ""}`}
          >
            <div
              className={`modal-actions ${plannerStep === LAST_STEP ? "planner-actions-center" : ""}`}
            >
              {plannerStep < LAST_STEP ? (
                <button
                  type="button"
                  className="cta"
                  onClick={() => setPlannerStep((prev) => Math.min(LAST_STEP, prev + 1))}
                >
                  Next
                </button>
              ) : (
                <>
                  <button
                    className="cta"
                    type="button"
                    disabled={loading || offline}
                    onClick={onSubmit}
                  >
                    {loading ? "Generating..." : "Generate workout"}
                  </button>
                  <OfflineHint />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
