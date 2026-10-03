/**
 * The fields of each editable settings tab: name, label, input type, and the
 * options or bounds. Read by SettingsView, which renders them through
 * SettingsEditForm.
 */
import {
  activityOptions,
  cardioOptions,
  experienceOptions,
  goalOptions,
  nutritionOptions,
  sexOptions,
  sleepOptions,
  weekDays
} from "../../../app/constants";

// weekDays is [{ label: "Mon", key: "Monday" }, ...]. The stored trainingDays
// are the keys, so the multiselect offers those rather than the objects.
const trainingDayOptions = weekDays.map((day) => day.key);

export const EDITABLE_TABS = ["profile", "training", "lifestyle"];

const FIELDS_BY_TAB = {
  profile: [
    { name: "name", label: "Name", type: "text", maxLength: 80 },
    { name: "age", label: "Age", type: "number", bounds: [10, 120] },
    { name: "sex", label: "Sex", type: "select", options: sexOptions },
    // Bounds per unit, because the form renders in the visitor's locale units.
    // The metric ones are the server's (apiSchemaService.js), the pound range is
    // the kilogram one run through toLb, and feet and inches cannot express the
    // centimetre range exactly, so theirs is looser and the server decides.
    // settingsFields.test.js pins all three.
    {
      name: "heightCm",
      label: "Height",
      type: "height",
      bounds: { cm: [100, 260], ft: [3, 8], in: [0, 11] }
    },
    { name: "weight", label: "Weight", type: "weight", bounds: { kg: [25, 400], lb: [55, 882] } },
    { name: "bodyFat", label: "Body fat", type: "number", bounds: [3, 70] }
  ],
  training: [
    { name: "timeline", label: "Timeline", type: "text", maxLength: 60 },
    { name: "experience", label: "Experience", type: "select", options: experienceOptions },
    {
      name: "trainingDays",
      label: "Training days",
      type: "multiselect",
      options: trainingDayOptions
    },
    { name: "activity", label: "Activity level", type: "select", options: activityOptions },
    { name: "goal", label: "Goal", type: "select", options: goalOptions }
  ],
  lifestyle: [
    { name: "sleep", label: "Sleep", type: "select", options: sleepOptions },
    { name: "nutrition", label: "Nutrition", type: "select", options: nutritionOptions },
    { name: "cardio", label: "Cardio", type: "select", options: cardioOptions },
    { name: "notes", label: "Notes", type: "textarea", maxLength: 500 }
  ]
};

/** The fields of a settings tab, or none for a tab that is not editable. */
export const fieldsForTab = (tabId) => FIELDS_BY_TAB[tabId] || [];
