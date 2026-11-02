import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import AuthPage from "../pages/auth/AuthPage";
import CaloriesView from "../pages/dashboard/views/CaloriesView";
import DashboardWorkoutModal from "../pages/dashboard/components/DashboardWorkoutModal";
import MealLogPanel from "../pages/dashboard/meal/MealLogPanel";
import HomePersonalStage from "../pages/home/components/HomePersonalStage";
import PreviewPersonalChapter from "../pages/home/preview/components/PreviewPersonalChapter";
import { toCmFromFeetInches, toFeetInchesFromCm, toKg, toLb } from "../app/units";
import { fieldsForTab } from "../pages/dashboard/settings/settingsFields";
import {
  caloriesBodySchema,
  goalsBodySchema,
  mealLogBodySchema,
  profileBodySchema,
  progressMetricBodySchema,
  workoutSessionBodySchema
} from "../../../server/src/services/http/apiSchemaService.js";

// Every numeric input whose value is posted to a route with a numeric schema,
// held to that schema's range. The client's bounds are attributes on rendered
// inputs, so each form is rendered and read as it ships; the server's are
// probed through the schema it validates with, imported directly. A client
// range tighter than the server's makes a value the server accepts
// unenterable, and a looser one lets through a value the server answers 400.
//
// The home form and the walkthrough are here too. Neither posts its fields,
// but the home form's answers prefill sign-up, which does, and the walkthrough
// shows the same form: a narrower range would turn away a visitor sign-up
// accepts. Feet and inches, and pounds, are converted before they are sent,
// and settingsFields.test.js pins how; the imperial ranges of the three forms
// are held to sign-up's below.

const noop = () => {};

const renderCaloriesView = () =>
  render(
    <CaloriesView
      goalForm={{ targetWeight: "", targetCalories: "", weeklyWorkouts: "3" }}
      setGoalForm={noop}
      avgCalories={0}
      calorieGoal={2200}
      calorieDelta={0}
      buildLinePath={() => ""}
      calorieSeries={[]}
      workoutSeries={[]}
      last7Keys={[]}
      submitCalories={noop}
      calorieForm={{ calories: "" }}
      setCalorieForm={noop}
      calories={[]}
      goalPaceText=""
      submitGoals={noop}
      progressMetrics={[]}
      progressForm={{
        date: "",
        weightLb: "",
        bodyFatPct: "",
        waistCm: "",
        restingHr: "",
        notes: ""
      }}
      setProgressForm={noop}
      submitProgressMetric={noop}
    />
  );

const renderMealLogPanel = () =>
  render(
    <MealLogPanel
      safeMealLogForm={{
        date: "",
        mealType: "breakfast",
        name: "",
        calories: "",
        proteinG: "",
        carbsG: "",
        fatG: "",
        notes: ""
      }}
      safeMealLogs={[]}
      updateMealLogForm={noop}
      onSubmitMealLog={noop}
      mealLogNameInputRef={{ current: null }}
    />
  );

const renderWorkoutModal = () =>
  render(
    <DashboardWorkoutModal
      open
      workoutForm={{}}
      setWorkoutForm={noop}
      onClose={noop}
      onSubmit={noop}
    />
  );

const renderHomeForm = (heightUnit = "cm", weightUnit = "kg") =>
  render(
    <HomePersonalStage
      personalPanelRef={{ current: null }}
      personalMode="basic"
      setPersonalMode={noop}
      user={null}
      onLogout={noop}
      go={noop}
      onPersonalSubmit={noop}
      personal={{ heightCm: "", heightFeet: "", heightInches: "", weight: "", trainingDays: [] }}
      onPersonalChange={noop}
      heightUnit={heightUnit}
      setHeightUnit={noop}
      toFeetInchesFromCm={toFeetInchesFromCm}
      toCmFromFeetInches={toCmFromFeetInches}
      setPersonal={noop}
      weightUnit={weightUnit}
      setWeightUnit={noop}
      toLb={toLb}
      toKg={toKg}
      trainingDayOptions={[]}
      toggleTrainingDay={noop}
      isPersonalComplete={false}
      goToStage={noop}
      isIntroTransitioning={false}
      isStageTransitioning={false}
    />
  );

const renderWalkthroughForm = (heightUnit = "cm", weightUnit = "kg") =>
  render(
    <PreviewPersonalChapter
      previewPersonalCollapsed={false}
      previewPersonalShifted={false}
      previewBuilderStage={0}
      previewFilledFields={{}}
      heightUnit={heightUnit}
      weightUnit={weightUnit}
      getPreviewTextRows={() => 1}
    />
  );

const renderSignup = (signupHeightUnit = "cm", signupWeightUnit = "kg") =>
  render(
    <AuthPage
      gradient={{}}
      authMode="signup"
      onAuthModeChange={noop}
      go={noop}
      onAuthSubmit={noop}
      authForm={{ email: "", password: "" }}
      onAuthChange={noop}
      signupProfileForm={{ heightCm: "", heightFeet: "", heightInches: "", weight: "" }}
      onSignupProfileChange={noop}
      signupHeightUnit={signupHeightUnit}
      setSignupHeightUnit={noop}
      signupWeightUnit={signupWeightUnit}
      setSignupWeightUnit={noop}
      toCmFromFeetInches={() => ""}
      toFeetInchesFromCm={() => ({ feet: "", inches: "" })}
      toKg={() => ""}
      toLb={() => ""}
      showPassword={false}
      setShowPassword={noop}
      authAutoSignIn={false}
      setAuthAutoSignIn={noop}
      authLoading={false}
      authError=""
    />
  );

const byLabel = (label) => () => screen.getByLabelText(label);
// The sign-up inputs sit in labels that also hold the unit toggle, so their
// label text is ambiguous; their names are not.
const byName = (name) => () => document.querySelector(`input[name="${name}"]`);

const INPUTS = [
  [
    "Goal: daily calories",
    renderCaloriesView,
    byLabel("Calories"),
    caloriesBodySchema.shape.calories
  ],
  [
    "Goal: target weight",
    renderCaloriesView,
    byLabel("Target weight (lb)"),
    goalsBodySchema.shape.targetWeight
  ],
  [
    "Goal: target calories",
    renderCaloriesView,
    byLabel("Target calories"),
    goalsBodySchema.shape.targetCalories
  ],
  [
    "Goal: weight",
    renderCaloriesView,
    byLabel("Weight lb"),
    progressMetricBodySchema.shape.weightLb
  ],
  [
    "Goal: body fat",
    renderCaloriesView,
    byLabel("Body fat (%)"),
    progressMetricBodySchema.shape.bodyFatPct
  ],
  [
    "Goal: waist",
    renderCaloriesView,
    byLabel("Waist (cm)"),
    progressMetricBodySchema.shape.waistCm
  ],
  [
    "Goal: resting heart rate",
    renderCaloriesView,
    byLabel("Resting HR"),
    progressMetricBodySchema.shape.restingHr
  ],
  ["Meal log: calories", renderMealLogPanel, byLabel("Calories"), mealLogBodySchema.shape.calories],
  [
    "Meal log: protein",
    renderMealLogPanel,
    byLabel("Protein (g)"),
    mealLogBodySchema.shape.proteinG
  ],
  ["Meal log: carbs", renderMealLogPanel, byLabel("Carbs (g)"), mealLogBodySchema.shape.carbsG],
  ["Meal log: fat", renderMealLogPanel, byLabel("Fat (g)"), mealLogBodySchema.shape.fatG],
  [
    "Workout: duration",
    renderWorkoutModal,
    byLabel("Duration (minutes)"),
    workoutSessionBodySchema.shape.duration
  ],
  ["Workout: sets", renderWorkoutModal, byLabel("Sets"), workoutSessionBodySchema.shape.sets],
  ["Workout: reps", renderWorkoutModal, byLabel("Reps"), workoutSessionBodySchema.shape.reps],
  [
    "Workout: intensity",
    renderWorkoutModal,
    byLabel("Intensity (RPE 1-10)"),
    workoutSessionBodySchema.shape.intensityRpe
  ],
  ["Sign-up: age", renderSignup, byName("age"), profileBodySchema.shape.age],
  ["Sign-up: height in cm", renderSignup, byName("heightCm"), profileBodySchema.shape.heightCm],
  ["Sign-up: weight in kg", renderSignup, byName("weight"), profileBodySchema.shape.weightKg],
  ["Home form: age", renderHomeForm, byName("age"), profileBodySchema.shape.age],
  ["Home form: height in cm", renderHomeForm, byName("heightCm"), profileBodySchema.shape.heightCm],
  ["Home form: weight in kg", renderHomeForm, byName("weight"), profileBodySchema.shape.weightKg],
  ["Walkthrough: age", renderWalkthroughForm, byName("age"), profileBodySchema.shape.age],
  [
    "Walkthrough: height in cm",
    renderWalkthroughForm,
    byName("heightCm"),
    profileBodySchema.shape.heightCm
  ],
  [
    "Walkthrough: weight in kg",
    renderWalkthroughForm,
    byName("weight"),
    profileBodySchema.shape.weightKg
  ]
];

const accepts = (field, value) => field.safeParse(value).success;
const stepOf = (input) => (input.step ? Number(input.step) : 1);
// 2 - 0.1 and 250 + 0.1 must be the decimals they look like.
const nudge = (value) => Number(value.toFixed(4));

describe("client input bounds match the server's", () => {
  // Accepted at both of the client's bounds and refused one step past each, so
  // the two ranges are equal to the input's own precision.
  test.each(INPUTS)("%s", (_label, renderForm, findInput, field) => {
    renderForm();
    const input = findInput();
    const min = Number(input.min);
    const max = Number(input.max);

    expect(accepts(field, min)).toBe(true);
    expect(accepts(field, max)).toBe(true);
    expect(accepts(field, nudge(min - stepOf(input)))).toBe(false);
    expect(accepts(field, nudge(max + stepOf(input)))).toBe(false);
  });

  // The imperial inputs have no schema of their own, so they are held to
  // sign-up's, whose conversions settingsFields.test.js pins.
  test.each([
    ["the home form", renderHomeForm],
    ["the walkthrough", renderWalkthroughForm]
  ])("%s's feet, inches and pounds bounds are sign-up's", (_label, renderForm) => {
    const boundsOf = () =>
      ["heightFeet", "heightInches", "weight"].map((name) => {
        const input = byName(name)();
        return [name, input.min, input.max];
      });
    const { unmount } = renderSignup("ft", "lb");
    const signup = boundsOf();
    unmount();

    renderForm("ft", "lb");

    expect(boundsOf()).toEqual(signup);
  });

  test("Goal: the weekly workouts offered are every count the server accepts", () => {
    renderCaloriesView();
    const offered = Array.from(screen.getByLabelText("Weekly workouts").options, (option) =>
      Number(option.value)
    );
    const accepted = Array.from({ length: 15 }, (_, count) => count).filter((count) =>
      accepts(goalsBodySchema.shape.weeklyWorkouts, count)
    );

    expect(offered).toEqual(accepted);
  });

  // Settings declares its bounds as data, so they are read rather than
  // rendered. These are the metric ones; the unit conversions are pinned in
  // settingsFields.test.js.
  test.each([
    ["age", (field) => field.bounds, profileBodySchema.shape.age],
    ["bodyFat", (field) => field.bounds, profileBodySchema.shape.bodyFat],
    ["heightCm", (field) => field.bounds.cm, profileBodySchema.shape.heightCm],
    ["weight", (field) => field.bounds.kg, profileBodySchema.shape.weightKg]
  ])("Settings: %s", (name, boundsOf, field) => {
    const [min, max] = boundsOf(fieldsForTab("profile").find((entry) => entry.name === name));

    expect(accepts(field, min)).toBe(true);
    expect(accepts(field, max)).toBe(true);
    expect(accepts(field, min - 1)).toBe(false);
    expect(accepts(field, max + 1)).toBe(false);
  });
});
