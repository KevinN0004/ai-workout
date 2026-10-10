/**
 * The edit form for one settings tab, built from that tab's descriptors in
 * settingsFields.js. Rendered by SettingsView while the tab is being edited.
 */
import { useState } from "react";

const unitsFor = (measurementSystem) =>
  measurementSystem === "imperial"
    ? { heightUnit: "ft", weightUnit: "lb" }
    : { heightUnit: "cm", weightUnit: "kg" };

/**
 * Edits a draft copied once from `values`, the whole stored profile rather than
 * only this tab's fields, so saving hands `onSave` a complete profile. Height
 * and weight render in `measurementSystem`'s units, which go to `onSave` with
 * the draft. `error` and `saving` belong to SettingsView's save.
 */
export default function SettingsEditForm({
  fields,
  values,
  measurementSystem,
  onSave,
  onCancel,
  error,
  saving
}) {
  const [draft, setDraft] = useState(() => ({ ...values }));
  const units = unitsFor(measurementSystem);

  const setField = (name, value) => setDraft((prev) => ({ ...prev, [name]: value }));

  const toggleInList = (name, option) =>
    setDraft((prev) => {
      const list = Array.isArray(prev[name]) ? prev[name] : [];
      return {
        ...prev,
        [name]: list.includes(option) ? list.filter((item) => item !== option) : [...list, option]
      };
    });

  const numberInput = (name, label, [min, max]) => (
    <label>
      {label}
      <input
        type="number"
        value={draft[name] ?? ""}
        min={min}
        max={max}
        onChange={(event) => setField(name, event.target.value)}
      />
    </label>
  );

  const renderField = (field) => {
    // Height and weight: inputs in the visitor's units, with that unit's bounds.
    if (field.type === "height") {
      return units.heightUnit === "ft" ? (
        <>
          {numberInput("heightFeet", "Height (ft)", field.bounds.ft)}
          {numberInput("heightInches", "Height (in)", field.bounds.in)}
        </>
      ) : (
        numberInput("heightCm", "Height (cm)", field.bounds.cm)
      );
    }

    if (field.type === "weight") {
      return numberInput("weight", `Weight (${units.weightUnit})`, field.bounds[units.weightUnit]);
    }

    // Every other field by its type, and a text input for anything else.
    if (field.type === "multiselect") {
      return (
        <fieldset>
          <legend>{field.label}</legend>
          {field.options.map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                checked={(draft[field.name] || []).includes(option)}
                onChange={() => toggleInList(field.name, option)}
              />
              {option}
            </label>
          ))}
        </fieldset>
      );
    }

    if (field.type === "select") {
      return (
        <label>
          {field.label}
          <select
            value={draft[field.name] || ""}
            onChange={(event) => setField(field.name, event.target.value)}
          >
            <option value="">Not set</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field.type === "textarea") {
      return (
        <label>
          {field.label}
          <textarea
            value={draft[field.name] || ""}
            maxLength={field.maxLength}
            onChange={(event) => setField(field.name, event.target.value)}
          />
        </label>
      );
    }

    if (field.type === "number") {
      return numberInput(field.name, field.label, field.bounds);
    }

    return (
      <label>
        {field.label}
        <input
          type="text"
          value={draft[field.name] ?? ""}
          maxLength={field.maxLength}
          onChange={(event) => setField(field.name, event.target.value)}
        />
      </label>
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    // The units go with the draft: the caller must convert with the same ones
    // this form rendered in, and they are the visitor's locale units rather
    // than the home flow's toggles.
    onSave(draft, units);
  };

  return (
    <form className="settings-edit-form" onSubmit={handleSubmit}>
      {fields.map((field) => (
        <div key={field.name} className="settings-edit-row">
          {renderField(field)}
        </div>
      ))}

      {error && <p className="error">{error}</p>}

      <div className="settings-edit-actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
