import { TRAINING_DAY_OPTIONS } from "../constants";

export default function PreviewPersonalChapter({
  isGenerateView = false,
  previewPersonalCollapsed,
  previewPersonalShifted,
  previewBuilderStage,
  previewFilledFields,
  heightUnit,
  weightUnit,
  getPreviewTextRows
}) {
  const showCollapsed = previewPersonalCollapsed || isGenerateView;
  const showBuilder = previewPersonalShifted || isGenerateView;
  const getFieldValue = (fieldKey) => (
    typeof previewFilledFields[fieldKey] === "string" ? previewFilledFields[fieldKey] : ""
  );
  const previewTrainingDays = Array.isArray(previewFilledFields.trainingDays)
    ? previewFilledFields.trainingDays
    : [];

  return (
    <div
      className={`preview-personal-sequence ${isGenerateView ? "is-generate-view" : ""} ${showBuilder ? "is-builder-active" : ""} builder-stage-${previewBuilderStage}`}
    >
      <div
        className={`preview-personal-form-shell ${showCollapsed ? "is-collapsed" : ""}`}
      >
        <div className="preview-personal-morph-surface" aria-hidden="true" />
        <span className="preview-personal-morph-label" aria-hidden="true">Personal Info</span>
        <form className="form personal-form advanced-mode preview-personal-form" onSubmit={(event) => event.preventDefault()}>
          <label className="field-name">
            Full name
            <textarea
              name="name"
              value={getFieldValue("name")}
              rows={getPreviewTextRows(getFieldValue("name"), 1, 2)}
              readOnly
            />
          </label>
          <label className="field-age">
            Age
            <input
              name="age"
              value={getFieldValue("age")}
              type="number"
              min="10"
              max="99"
              readOnly
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
                  tabIndex={-1}
                >
                  ft/in
                </button>
                <button
                  type="button"
                  className={heightUnit === "cm" ? "active" : ""}
                  tabIndex={-1}
                >
                  cm
                </button>
              </span>
            </span>
            {heightUnit === "cm" ? (
              <input
                name="heightCm"
                value={getFieldValue("heightCm")}
                type="number"
                min="120"
                max="230"
                readOnly
              />
            ) : (
              <div className="height-split">
                <div className="height-field">
                  <input
                    name="heightFeet"
                    value={getFieldValue("heightFeet")}
                    type="number"
                    min="3"
                    max="7"
                    readOnly
                  />
                  <span className="height-unit">ft</span>
                </div>
                <div className="height-field">
                  <input
                    name="heightInches"
                    value={getFieldValue("heightInches")}
                    type="number"
                    min="0"
                    max="11"
                    readOnly
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
                  tabIndex={-1}
                >
                  lb
                </button>
                <button
                  type="button"
                  className={weightUnit === "kg" ? "active" : ""}
                  tabIndex={-1}
                >
                  kg
                </button>
              </span>
            </span>
            <input
              name="weight"
              value={getFieldValue("weight")}
              type="number"
              min={weightUnit === "kg" ? "35" : "77"}
              max={weightUnit === "kg" ? "200" : "440"}
              readOnly
            />
          </label>
          <label className="field-sex">
            Sex
            <select name="sex" value={getFieldValue("sex")} onChange={() => {}}>
              <option value="">Select</option>
              <option>Female</option>
              <option>Male</option>
              <option>Non-binary</option>
              <option>Prefer not to say</option>
            </select>
          </label>

          <div className="advanced-fields-wrap" aria-hidden={false}>
            <div className="advanced-fields-inner">
              <label>
                Activity level
                <select
                  name="activity"
                  value={getFieldValue("activity")}
                  onChange={() => {}}
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
                  value={getFieldValue("sleep")}
                  onChange={() => {}}
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
                <textarea
                  name="timeline"
                  value={getFieldValue("timeline")}
                  rows={getPreviewTextRows(getFieldValue("timeline"), 2, 4)}
                  readOnly
                />
              </label>
              <label>
                Training experience
                <select
                  name="experience"
                  value={getFieldValue("experience")}
                  onChange={() => {}}
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
                  value={getFieldValue("nutrition")}
                  onChange={() => {}}
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
                  value={getFieldValue("cardio")}
                  onChange={() => {}}
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
                  {TRAINING_DAY_OPTIONS.map((day) => {
                    const isSelected = previewTrainingDays.includes(day);
                    return (
                      <button
                        key={`preview-${day}`}
                        type="button"
                        className={`day-toggle-btn ${isSelected ? "active" : ""}`}
                        tabIndex={-1}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </label>
              <label className="full">
                Additional Info
                <textarea
                  name="notes"
                  value={getFieldValue("notes")}
                  rows={getPreviewTextRows(getFieldValue("notes"), 2, 5)}
                  readOnly
                />
              </label>
            </div>
          </div>
        </form>
      </div>
      <div className={`preview-builder-track ${showBuilder ? "is-active" : ""}`} aria-hidden={!showBuilder}>
        <div className="preview-builder-spacer" aria-hidden="true" />
        <span className={`preview-builder-plus plus-one from-bottom ${previewBuilderStage >= 1 ? "is-visible" : ""}`}>+</span>
        <div className={`preview-builder-slot env from-top ${previewBuilderStage >= 2 ? "is-visible" : ""}`}>
          <span className="preview-builder-btn">Environment</span>
        </div>
        <span className={`preview-builder-plus plus-two from-bottom ${previewBuilderStage >= 3 ? "is-visible" : ""}`}>+</span>
        <div className={`preview-builder-slot focus from-top ${previewBuilderStage >= 4 ? "is-visible" : ""}`}>
          <span className="preview-builder-btn">Focus</span>
        </div>
        <span className={`preview-builder-generating ${previewBuilderStage >= 6 ? "is-visible" : ""}`}>
          Generating
        </span>
      </div>
    </div>
  );
}
