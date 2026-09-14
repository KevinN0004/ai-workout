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

export const personalToProfile = (personal = {}, units = {}) => {
  const { heightUnit = "cm", weightUnit = "kg" } = units;
  const { firstName, lastName } = splitFullName(personal.name);

  // Whichever unit is active is the one the user is typing into; the other
  // field is whatever was last converted into it and may be stale. This is the
  // same pick useBodyModel makes, deliberately -- the two must agree or the
  // silhouette and the stored profile disagree about the same person.
  const fromCm = toProfileNumber(personal.heightCm);
  const fromImperial = toProfileNumber(
    toCmFromFeetInches(personal.heightFeet, personal.heightInches)
  );
  const heightCm = heightUnit === "ft" ? (fromImperial ?? fromCm) : (fromCm ?? fromImperial);

  return {
    firstName,
    lastName,
    name: personal.name || "",
    age: toProfileNumber(personal.age),
    heightCm,
    // personal.weight is a bare number in the active unit, so the unit is not
    // optional information -- without it 170 lb is stored as 170 kg.
    weightKg: toProfileNumber(toKg(personal.weight, weightUnit)),
    sex: personal.sex || "",
    bodyFat: toProfileNumber(personal.bodyFat),
    activity: personal.activity || "",
    notes: personal.notes || "",
    sleep: personal.sleep || "",
    timeline: personal.timeline || "",
    experience: personal.experience || "",
    nutrition: personal.nutrition || "",
    cardio: personal.cardio || "",
    goal: personal.goal || "",
    trainingDays: toDayList(personal.trainingDays)
  };
};

export const profileToPersonal = (profile = {}, units = {}) => {
  const { weightUnit = "kg" } = units;
  const name =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || profile.name || "";
  // Already returns { feet: String, inches: String }, and { feet: "", inches: "" }
  // for an absent height, so these two need no further conversion.
  const { feet, inches } = toFeetInchesFromCm(profile.heightCm);
  const storedWeight = toFormValue(profile.weightKg);

  return {
    ...defaultPersonalForm,
    name,
    age: toFormValue(profile.age),
    heightCm: toFormValue(profile.heightCm),
    heightFeet: feet,
    heightInches: inches,
    weight: weightUnit === "lb" ? toLb(storedWeight, "kg") : storedWeight,
    sex: profile.sex || "",
    bodyFat: toFormValue(profile.bodyFat),
    activity: profile.activity || defaultPersonalForm.activity,
    notes: profile.notes || "",
    sleep: profile.sleep || "",
    timeline: profile.timeline || "",
    experience: profile.experience || "",
    nutrition: profile.nutrition || "",
    cardio: profile.cardio || "",
    goal: profile.goal || "",
    trainingDays: toDayList(profile.trainingDays)
  };
};
