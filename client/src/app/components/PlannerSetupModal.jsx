import ModalPortal from "../../components/ModalPortal";
import { equipmentOptionsByEnv, injuryOptions, quickFocuses } from "../constants";

const plannerHeaderTitleByStep = {
  1: "Step 1 - Environment & equipment",
  2: "Step 2 - Schedule & constraints",
  3: "Step 3 - Focus priorities"
};

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
  loading,
  onSubmit
}) {
  if (!plannerOpen) return null;
  const plannerHeaderTitle =
    plannerHeaderTitleByStep[plannerStep] || plannerHeaderTitleByStep[1];

  return (
    <ModalPortal open={plannerOpen}>
      <div className="modal-backdrop planner-backdrop" role="dialog" aria-modal="true">
        <div className="modal planner-setup-modal">
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
            <h2>{plannerHeaderTitle}</h2>
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
                      className={
                        form.environment === "Commercial" ? "active" : ""
                      }
                      onClick={() => onEnvironmentChange("Commercial")}
                    >
                      Commercial
                    </button>
                  </div>
                </div>
                <div className="option-grid">
                  {equipmentOptionsByEnv[form.environment].map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`equip-card ${
                        form.equipment.includes(item) ? "active" : ""
                      }`}
                      onClick={() => toggleEquipment(item)}
                    >
                      <span className="equip-thumb" aria-hidden="true" />
                      <span className="equip-label">{item}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                    <select
                      name="duration"
                      value={form.duration}
                      onChange={onChange}
                    >
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
                    <select
                      name="injuries"
                      value={form.injuries}
                      onChange={onChange}
                    >
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
          </div>
          <div className={`modal-footer ${plannerStep === 3 ? "planner-footer-center" : ""}`}>
            <div className={`modal-actions ${plannerStep === 3 ? "planner-actions-center" : ""}`}>
              {plannerStep < 3 ? (
                <button
                  type="button"
                  className="cta"
                  onClick={() => setPlannerStep((prev) => Math.min(3, prev + 1))}
                >
                  Next
                </button>
              ) : (
                <button
                  className="cta"
                  type="button"
                  disabled={loading}
                  onClick={onSubmit}
                >
                  {loading ? "Generating..." : "Generate workout"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
