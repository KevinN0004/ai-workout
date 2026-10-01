/**
 * Fixed data the client shares: brand copy, the forms' options and defaults, the
 * dashboard's route map, and the cache, undo-window and CSRF settings. Several
 * option lists must match the server's; the note above them says which.
 */
export const APP_BRAND_NAME = "PATH";
export const APP_BRAND_EXPANSION = "Personalized AI Training Hub";
export const APP_BRAND_TAGLINE = "Your guide for this journey.";

export const quickFocuses = ["Strength", "Weight Loss", "Mobility", "Recovery", "Cardio"];

// The goals Settings offers (settingsFields.js). The profile carries one, and
// createDefaultPlannerForm seeds the planner from it, falling back to the first.
// Like the lists below, it must match the server's allowedGoalValues.
export const goalOptions = [
  "Build lean strength and energy",
  "Fat loss + conditioning",
  "Mobility",
  "Recovery",
  "Cardio"
];

// Each of these must match its allowed*Values counterpart in the server's
// dashboardDataBuildersService.js. The profile schema in apiSchemaService.js
// builds its enums from those lists, so anything else is rejected with a 400.
// The running app cannot import across the wire, so the duplication is
// unavoidable -- but constants.test.js imports the server lists directly and
// asserts equality, so a divergence fails the suite rather than waiting to be
// found as a 400 on a valid dropdown choice.
//
// Three views hardcode these as inline <option> elements and are the
// least guarded copies, since nothing pins their text against this file:
// HomePersonalStage and PreviewPersonalChapter duplicate all six, and AuthPage
// duplicates sex and activity only -- it has no sleep, experience, nutrition or
// cardio select at all. None of the three renders a goal select, so goalOptions
// above is not among the duplicated lists. Mapping those views over these
// exports would close the gap.
//
// Copy these from the <option> elements in HomePersonalStage.jsx, not from
// memory. Two of them are easy to get wrong: sleep is "7 - 8 hours" with spaces
// around the hyphen, and cardio has EIGHT entries, the last of them "Mixed". An
// allowlist missing a real option turns a legitimate choice into a 400.
export const sexOptions = ["Female", "Male", "Non-binary", "Prefer not to say"];
export const activityOptions = ["Light", "Moderate", "High", "Very high"];
export const sleepOptions = ["Less than 4", "4 - 6 hours", "7 - 8 hours", "More than 8"];
export const experienceOptions = ["Beginner", "Intermediate", "Advanced"];
export const nutritionOptions = [
  "No preference",
  "High-protein",
  "Balanced",
  "Low-carb",
  "Vegetarian",
  "Vegan"
];
export const cardioOptions = [
  "None",
  "Walking",
  "Running",
  "Cycling",
  "Rowing",
  "Swimming",
  "HIIT",
  "Mixed"
];

export const equipmentOptionsByEnv = {
  Home: [
    "Bodyweight only",
    "Dumbbells",
    "Kettlebell",
    "Pull-up bar",
    "Resistance bands",
    "Adjustable bench",
    "Yoga mat"
  ],
  Commercial: [
    "Full gym access",
    "Strength floor",
    "Cardio deck",
    "Functional training zone",
    "Group class studio",
    "Pool / aquatic center",
    "Court sports area",
    "Recovery & mobility zone"
  ]
};

export const injuryOptions = ["None", "Lower back", "Knee", "Shoulder", "Hip", "Wrist/Elbow"];

export const samplePlan = [
  {
    day: "Day 1 - Full Body Strength",
    blocks: [
      "Warmup: 5 min bike + dynamic mobility",
      "A1: Goblet squat 4 x 8",
      "A2: Push-up 4 x 10",
      "B1: RDL 3 x 10",
      "B2: TRX row 3 x 12",
      "Finisher: 6 min EMOM 10 kettlebell swings"
    ]
  },
  {
    day: "Day 2 - Conditioning",
    blocks: [
      "Warmup: jump rope 3 min",
      "Intervals: 8 x 30s hard / 60s easy",
      "Core: plank 3 x 45s + dead bug 3 x 10"
    ]
  },
  {
    day: "Day 3 - Lower Body + Core",
    blocks: [
      "Warmup: hip openers + glute activation",
      "A1: Split squat 4 x 8",
      "A2: Single-leg RDL 3 x 10",
      "B1: Calf raises 3 x 15",
      "Core: side plank 3 x 30s"
    ]
  }
];

export const weekDays = [
  { label: "Mon", key: "Monday" },
  { label: "Tue", key: "Tuesday" },
  { label: "Wed", key: "Wednesday" },
  { label: "Thu", key: "Thursday" },
  { label: "Fri", key: "Friday" },
  { label: "Sat", key: "Saturday" },
  { label: "Sun", key: "Sunday" }
];

export const defaultAuthForm = {
  email: "",
  password: ""
};

export const defaultSignupProfileForm = {
  firstName: "",
  lastName: "",
  age: "",
  heightCm: "",
  heightFeet: "",
  heightInches: "",
  weight: "",
  weightKg: "",
  sex: "",
  bodyFat: "",
  activity: "Moderate",
  notes: ""
};

export const defaultPersonalForm = {
  name: "",
  age: "",
  heightCm: "",
  heightFeet: "",
  heightInches: "",
  weight: "",
  sex: "",
  bodyFat: "",
  activity: "Moderate",
  goal: "",
  sleep: "",
  timeline: "",
  experience: "",
  trainingDays: [],
  nutrition: "",
  cardio: "",
  notes: ""
};

// The goal comes from the signed-in visitor's profile. PlannerSetupModal never
// asks for one -- its steps cover environment, equipment, schedule, level,
// injuries and focus -- so without an argument here every generated plan would
// carry the same goal into the Gemini prompt, whatever the visitor wanted. The
// fallback is for a visitor with no goal on file, signed in or not.
export const createDefaultPlannerForm = (goal) => ({
  goal: goal || goalOptions[0],
  equipment: [],
  duration: "45",
  level: "Intermediate",
  injuries: "None",
  days: "3",
  focuses: [],
  environment: "Home"
});

export const DASHBOARD_ROUTE_VIEW_MAP = {
  "": "summary",
  summary: "summary",
  workouts: "workouts",
  calories: "calories",
  plans: "plans",
  meal: "meal",
  tips: "tips",
  settings: "settings",
  home: "home"
};

export const DASHBOARD_CACHE_PREFIX = "ai-workout-dashboard-cache-v1";
export const WEATHER_CACHE_PREFIX = "ai-workout-weather-cache-v1";
export const AIR_QUALITY_CACHE_PREFIX = "ai-workout-air-cache-v1";
export const OPTIMISTIC_UNDO_WINDOW_MS = 4500;
export const CSRF_COOKIE_NAME = "csrfToken";
export const CSRF_HEADER_NAME = "x-csrf-token";
