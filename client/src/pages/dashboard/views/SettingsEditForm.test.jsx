import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import SettingsEditForm from "./SettingsEditForm";

const FIELDS = [
  { name: "name", label: "Name", type: "text", maxLength: 80 },
  { name: "age", label: "Age", type: "number", bounds: [10, 120] },
  { name: "sex", label: "Sex", type: "select", options: ["Female", "Male"] },
  {
    name: "heightCm",
    label: "Height",
    type: "height",
    bounds: { cm: [100, 260], ft: [3, 8], in: [0, 11] }
  },
  { name: "weight", label: "Weight", type: "weight", bounds: { kg: [25, 400], lb: [55, 882] } },
  {
    name: "trainingDays",
    label: "Training days",
    type: "multiselect",
    options: ["Monday", "Tuesday"]
  }
];

const VALUES = {
  name: "Jordan",
  age: "34",
  sex: "Female",
  heightCm: "178",
  heightFeet: "5",
  heightInches: "10",
  weight: "77",
  trainingDays: ["Monday"]
};

const renderForm = (overrides = {}) =>
  render(
    <SettingsEditForm
      fields={FIELDS}
      values={VALUES}
      measurementSystem="metric"
      onSave={() => {}}
      onCancel={() => {}}
      {...overrides}
    />
  );

describe("SettingsEditForm", () => {
  test("renders a labelled control per field", () => {
    renderForm();

    expect(screen.getByLabelText("Name")).toHaveValue("Jordan");
    expect(screen.getByLabelText("Age")).toHaveValue(34);
    expect(screen.getByLabelText("Sex")).toHaveValue("Female");
  });

  test("applies the server range to a plain number field", () => {
    renderForm();
    const age = screen.getByLabelText("Age");

    expect(age).toHaveAttribute("min", "10");
    expect(age).toHaveAttribute("max", "120");
  });

  test("submits the edited values", () => {
    const onSave = vi.fn();
    renderForm({ onSave });

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: "Sam" });
  });

  test("reports the units it rendered with, so the caller converts the same way", () => {
    const onSave = vi.fn();
    renderForm({ onSave, measurementSystem: "imperial" });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][1]).toEqual({ heightUnit: "ft", weightUnit: "lb" });
  });

  test("reports metric units when the locale is metric", () => {
    const onSave = vi.fn();
    renderForm({ onSave });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][1]).toEqual({ heightUnit: "cm", weightUnit: "kg" });
  });

  test("shows one height input in centimetres for a metric visitor", () => {
    renderForm();

    expect(screen.getByLabelText("Height (cm)")).toHaveValue(178);
    expect(screen.queryByLabelText("Height (ft)")).toBeNull();
  });

  test("shows feet and inches for an imperial visitor", () => {
    renderForm({ measurementSystem: "imperial" });

    expect(screen.getByLabelText("Height (ft)")).toHaveValue(5);
    expect(screen.getByLabelText("Height (in)")).toHaveValue(10);
    expect(screen.queryByLabelText("Height (cm)")).toBeNull();
  });

  test("writes feet and inches back to their own fields, not to centimetres", () => {
    const onSave = vi.fn();
    renderForm({ onSave, measurementSystem: "imperial" });

    fireEvent.change(screen.getByLabelText("Height (ft)"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][0]).toMatchObject({ heightFeet: "6", heightInches: "10" });
  });

  // 170 lb is an ordinary weight that the kilogram range would reject, and
  // 30 lb is not a weight but would pass it.
  test("bounds the weight input by the unit on screen", () => {
    renderForm({ measurementSystem: "imperial" });
    const weight = screen.getByLabelText("Weight (lb)");

    expect(weight).toHaveAttribute("min", "55");
    expect(weight).toHaveAttribute("max", "882");
  });

  test("bounds the weight input in kilograms for a metric visitor", () => {
    renderForm();
    const weight = screen.getByLabelText("Weight (kg)");

    expect(weight).toHaveAttribute("min", "25");
    expect(weight).toHaveAttribute("max", "400");
  });

  test("adds a multiselect value that was not selected", () => {
    const onSave = vi.fn();
    renderForm({ onSave });

    fireEvent.click(screen.getByRole("checkbox", { name: "Tuesday" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][0]).toMatchObject({ trainingDays: ["Monday", "Tuesday"] });
  });

  // Clicking an already-selected day has to remove it. Asserting only the add
  // direction lets a toggle that can never unselect anything pass -- a visitor
  // could add a training day but never drop one, and the earlier version of
  // this test was named "on and off" while exercising only "on".
  test("removes a multiselect value that was selected", () => {
    const onSave = vi.fn();
    renderForm({ onSave });

    fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][0]).toMatchObject({ trainingDays: [] });
  });

  test("reflects the selection state in the checkboxes", () => {
    renderForm();

    expect(screen.getByRole("checkbox", { name: "Monday" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Tuesday" })).not.toBeChecked();
  });

  test("discards edits on cancel", () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    renderForm({ onCancel, onSave });

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("shows a save error without closing the form", () => {
    renderForm({ error: "Age must be between 10 and 120." });

    expect(screen.getByText("Age must be between 10 and 120.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  test("disables both controls while a save is in flight", () => {
    renderForm({ saving: true });

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
