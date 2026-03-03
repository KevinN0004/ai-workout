export const APP_BRAND_NAME = "PATH";
export const APP_BRAND_EXPANSION = "Personalized AI Training Hub";
export const APP_BRAND_TAGLINE = "Your guide for this journey.";

export const quickFocuses = [
  "Strength",
  "Weight Loss",
  "Mobility",
  "Recovery",
  "Cardio"
];

export const goalOptions = [
  "Build lean strength and energy",
  "Fat loss + conditioning",
  "Mobility",
  "Recovery",
  "Cardio"
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
    "Barbell + plates",
    "Cable machine",
    "Smith machine",
    "Cardio machines",
    "Free weights"
  ]
};

export const injuryOptions = [
  "None",
  "Lower back",
  "Knee",
  "Shoulder",
  "Hip",
  "Wrist/Elbow"
];

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
  sleep: "",
  timeline: "",
  experience: "",
  trainingDays: [],
  nutrition: "",
  cardio: "",
  notes: ""
};

export const createDefaultPlannerForm = () => ({
  goal: "Build lean strength and energy",
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
