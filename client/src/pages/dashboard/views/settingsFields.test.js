import { describe, expect, test } from "vitest";
import { EDITABLE_TABS, fieldsForTab } from "./settingsFields";
import {
  activityOptions,
  cardioOptions,
  experienceOptions,
  goalOptions,
  nutritionOptions,
  sexOptions,
  sleepOptions,
  defaultPersonalForm
} from "../../../app/constants";
import { toLb } from "../../../app/units";

describe("settingsFields", () => {
  test("marks exactly the three real tabs editable", () => {
    expect(EDITABLE_TABS).toEqual(["profile", "training", "lifestyle"]);
  });

  test("gives every field a name and a known type", () => {
    for (const tab of EDITABLE_TABS) {
      for (const field of fieldsForTab(tab)) {
        expect(field.name).toBeTruthy();
        expect([
          "text",
          "number",
          "select",
          "multiselect",
          "textarea",
          "height",
          "weight"
        ]).toContain(field.type);
      }
    }
  });

  // `toBe`, not `toEqual`: identity is the assertion. A descriptor that retyped
  // the values would still be deeply equal today and would drift tomorrow, and
  // these lists are already pinned against the server in constants.test.js.
  // Covering all six also catches a list referenced but never imported, which
  // is a ReferenceError at module load rather than a failing assertion.
  test.each([
    ["profile", "sex", () => sexOptions],
    ["training", "activity", () => activityOptions],
    ["training", "goal", () => goalOptions],
    ["training", "experience", () => experienceOptions],
    ["lifestyle", "sleep", () => sleepOptions],
    ["lifestyle", "nutrition", () => nutritionOptions],
    ["lifestyle", "cardio", () => cardioOptions]
  ])("the %s tab's %s field reuses the shared list", (tab, name, expected) => {
    expect(fieldsForTab(tab).find((field) => field.name === name).options).toBe(expected());
  });

  // weekDays is a list of { label, key } objects, not strings. The multiselect
  // stores day keys, which is what buildProfile's trainingDays receives, so the
  // options must be the keys rather than the whole objects.
  test("offers training days as plain day-name strings", () => {
    const days = fieldsForTab("training").find((field) => field.name === "trainingDays");

    expect(days.options).toContain("Monday");
    expect(days.options.every((option) => typeof option === "string")).toBe(true);
    expect(days.options).toHaveLength(7);
  });

  // The bounds are per unit because the form renders in the visitor's locale
  // units. Applying the kilogram range to a pounds input rejects 170 lb, an
  // entirely ordinary weight, and accepts 30 lb, which is not.
  //
  // Derived from the kilogram range rather than asserted loosely. Unlike height,
  // pounds-to-kilograms is exact, so there is no reason to accept a range that
  // is merely in the right neighbourhood -- and a loose assertion let a
  // materially wrong `lb: [58, 850]` pass, which would reject weights the
  // server accepts at both ends.
  test("declares weight bounds for both units, the pound range converted from the kilogram one", () => {
    const weight = fieldsForTab("profile").find((field) => field.name === "weight");

    expect(weight.type).toBe("weight");
    expect(weight.bounds.kg).toEqual([25, 400]);
    expect(weight.bounds.lb).toEqual(weight.bounds.kg.map((kg) => Number(toLb(String(kg), "kg"))));
  });

  test("declares height bounds for both units", () => {
    const height = fieldsForTab("profile").find((field) => field.name === "heightCm");

    expect(height.type).toBe("height");
    expect(height.bounds.cm).toEqual([100, 260]);
    expect(height.bounds.ft).toEqual([3, 8]);
    expect(height.bounds.in).toEqual([0, 11]);
  });

  // Feet and inches cannot express 100-260cm exactly: the range 3'0" to 8'11"
  // is 91-272cm, looser at both ends. That is deliberate and it is the safe
  // direction to be wrong. A client bound TIGHTER than the server's would make
  // a legitimate height unenterable, which is the defect class this whole
  // change exists to close; a looser one merely defers to the server, which
  // answers 400 and renders the message inline. Pinned so nobody "corrects" it
  // into a false precision.
  test("keeps the imperial height range permissive rather than stricter", () => {
    const {
      ft,
      in: inches,
      cm
    } = fieldsForTab("profile").find((field) => field.name === "heightCm").bounds;
    const lowestImperialCm = Math.round(ft[0] * 30.48 + inches[0] * 2.54);
    const highestImperialCm = Math.round(ft[1] * 30.48 + inches[1] * 2.54);

    expect(lowestImperialCm).toBeLessThanOrEqual(cm[0]);
    expect(highestImperialCm).toBeGreaterThanOrEqual(cm[1]);
  });

  // The metric bounds must be the same numbers the server enforces, or the form
  // accepts input the API then rejects with a 400.
  test("mirrors the server's metric ranges exactly", () => {
    const profile = fieldsForTab("profile");

    expect(profile.find((f) => f.name === "age").bounds).toEqual([10, 120]);
    expect(profile.find((f) => f.name === "bodyFat").bounds).toEqual([3, 70]);
    expect(profile.find((f) => f.name === "heightCm").bounds.cm).toEqual([100, 260]);
    expect(profile.find((f) => f.name === "weight").bounds.kg).toEqual([25, 400]);
  });

  test("returns nothing for a read-only tab", () => {
    expect(fieldsForTab("privacy")).toEqual([]);
    expect(fieldsForTab("nonsense")).toEqual([]);
  });
});

// The generic shape test cannot see a field that is missing or misnamed: it only
// walks the fields that ARE there. Deleting the name descriptor outright, so a
// user could never edit their name again, passed the whole suite -- as did
// renaming notes to note, which silently disconnects it from the profile. Both
// are caught by naming the exact expected set.
describe("the field set itself", () => {
  test.each([
    ["profile", ["name", "age", "sex", "heightCm", "weight", "bodyFat"]],
    ["training", ["timeline", "experience", "trainingDays", "activity", "goal"]],
    ["lifestyle", ["sleep", "nutrition", "cardio", "notes"]]
  ])("the %s tab declares exactly its fields, in order", (tab, expected) => {
    expect(fieldsForTab(tab).map((field) => field.name)).toEqual(expected);
  });

  // Every name must be a real key on the personal form state, or the edit form
  // binds an input to nothing and the value silently fails to save.
  test("every field name is a real key on the personal form", () => {
    for (const tab of EDITABLE_TABS) {
      for (const field of fieldsForTab(tab)) {
        expect(Object.keys(defaultPersonalForm)).toContain(field.name);
      }
    }
  });

  // These mirror the cleanText limits in the server's buildProfile. A longer
  // client limit lets a visitor type text the API then rejects with a 400.
  test.each([
    ["profile", "name", 80],
    ["training", "timeline", 60],
    ["lifestyle", "notes", 500]
  ])("the %s tab's %s field stops at the server's limit", (tab, name, maxLength) => {
    expect(fieldsForTab(tab).find((field) => field.name === name).maxLength).toBe(maxLength);
  });
});
