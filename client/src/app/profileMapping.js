/**
 * Converts between the profile the server stores and the form state that edits
 * it: personalToProfile for a save (submitProfile in events.js), and
 * profileToPersonal to seed Settings' form from user.profile.
 */
import { splitFullName, toCmFromFeetInches, toFeetInchesFromCm, toKg, toLb } from "./units";
import { defaultPersonalForm } from "./constants";

// Guards before it coerces. `Number("")` and `Number(null)` are both 0 and both
// finite, so testing afterwards turns an unfilled form field into a measured
// value -- which is how an unentered body fat once modelled a user at 3%.
// Same shape as toNullableNumber in the server's dashboardDataBuildersService.
export const toProfileNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// The mirror: a stored null is an empty form field, never the string "0".
const toFormValue = (value) => (value === null || value === undefined ? "" : String(value));

const toDayList = (value) => (Array.isArray(value) ? value : []);

// `= {}` only fires on undefined, and this is a shared module a future caller
// can reach with an explicitly null argument. `|| {}` covers both.
export const personalToProfile = (personal, units) => {
  const { heightUnit = "cm", weightUnit = "kg" } = units || {};
  const source = personal || {};
  const { firstName, lastName } = splitFullName(source.name);

  // Whichever unit is active is the one the user is typing into; the other
  // field is whatever was last converted into it and may be stale. This is the
  // same pick useBodyModel makes, deliberately -- the two must agree or the
  // silhouette and the stored profile disagree about the same person.
  const fromCm = toProfileNumber(source.heightCm);
  const fromImperial = toProfileNumber(toCmFromFeetInches(source.heightFeet, source.heightInches));
  const heightCm = heightUnit === "ft" ? (fromImperial ?? fromCm) : (fromCm ?? fromImperial);

  return {
    firstName,
    lastName,
    name: source.name || "",
    age: toProfileNumber(source.age),
    heightCm,
    // The weight field holds a bare number in the active unit, so the unit is
    // not optional information -- without it 170 lb is stored as 170 kg.
    //
    // toKg opens with `if (!value) return ""`, so a weight given as the NUMBER
    // 0 reads as absent while the string "0" survives. Every caller passes form
    // state, where inputs are always strings, so this is unreachable rather
    // than shipped -- noted because it is the falsiness-swallows-zero shape one
    // level removed, in a helper this module does not own.
    weightKg: toProfileNumber(toKg(source.weight, weightUnit)),
    sex: source.sex || "",
    bodyFat: toProfileNumber(source.bodyFat),
    activity: source.activity || "",
    notes: source.notes || "",
    sleep: source.sleep || "",
    timeline: source.timeline || "",
    experience: source.experience || "",
    nutrition: source.nutrition || "",
    cardio: source.cardio || "",
    goal: source.goal || "",
    trainingDays: toDayList(source.trainingDays)
  };
};

/**
 * The way back: a stored profile as form state, height in both centimetres and
 * feet and inches, weight in `units.weightUnit` (kg unless "lb"). An absent
 * value reads as "" (training days as []), except activity, as noted below.
 */
export const profileToPersonal = (profile, units) => {
  const { weightUnit = "kg" } = units || {};
  const stored = profile || {};
  const name =
    [stored.firstName, stored.lastName].filter(Boolean).join(" ").trim() || stored.name || "";
  // Already returns { feet: String, inches: String }, and { feet: "", inches: "" }
  // for an absent height, so these two need no further conversion.
  const { feet, inches } = toFeetInchesFromCm(stored.heightCm);
  const storedWeight = toFormValue(stored.weightKg);

  return {
    ...defaultPersonalForm,
    name,
    age: toFormValue(stored.age),
    heightCm: toFormValue(stored.heightCm),
    heightFeet: feet,
    heightInches: inches,
    weight: weightUnit === "lb" ? toLb(storedWeight, "kg") : storedWeight,
    sex: stored.sex || "",
    bodyFat: toFormValue(stored.bodyFat),
    // Activity is the one field that does not round-trip to "", and that is
    // deliberate: it mirrors the server. buildProfile falls an unrecognised
    // activity back to defaultProfile().activity ("Moderate"), where sex falls
    // back to "". So a cleared activity is stored as "Moderate" and reading it
    // back as "Moderate" is what actually happened, not a client-side invention.
    activity: stored.activity || defaultPersonalForm.activity,
    notes: stored.notes || "",
    sleep: stored.sleep || "",
    timeline: stored.timeline || "",
    experience: stored.experience || "",
    nutrition: stored.nutrition || "",
    cardio: stored.cardio || "",
    goal: stored.goal || "",
    trainingDays: toDayList(stored.trainingDays)
  };
};
