export const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);
export const TRAINING_DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

export const JOHN_DOE_PREVIEW_PROFILE = {
  name: "John Doe",
  age: "31",
  sex: "Male",
  heightCm: 183,
  weightKg: 84,
  bodyFat: 18.4,
  activity: "Moderate",
  sleep: "7 - 8 hours",
  timeline: "12 weeks to build lean strength",
  experience: "Intermediate",
  nutrition: "High-protein",
  cardio: "Mixed",
  trainingDays: ["Monday", "Tuesday", "Thursday", "Saturday"],
  notes: "Minor left-knee sensitivity during deep squats.",
  goal: "Build lean strength and energy",
  days: "4",
  duration: "50",
  environment: "Commercial",
  equipment: ["Full gym access"],
  focuses: ["Strength", "Conditioning", "Core"],
  personalComplete: true
};

export const PREVIEW_INSTANT_FIELDS = new Set([
  "sex",
  "activity",
  "sleep",
  "experience",
  "nutrition",
  "cardio"
]);

export const PREVIEW_TYPING_MIN_MS = 22;
export const PREVIEW_TYPING_MAX_MS = 58;
export const PREVIEW_TRAINING_DAY_STEP_MS = 110;
export const PREVIEW_COLLAPSE_DELAY_MS = 480;
export const PREVIEW_MOTION_DURATION_MS = 1100;
export const PREVIEW_MORPH_DURATION_MS = PREVIEW_MOTION_DURATION_MS;
export const PREVIEW_POST_MORPH_SHIFT_DELAY_MS = Math.max(0, PREVIEW_MORPH_DURATION_MS + 40);
export const PREVIEW_BUILDER_START_DELAY_MS = 760;
export const PREVIEW_BUILDER_STEP_MS = PREVIEW_MOTION_DURATION_MS;
export const PREVIEW_GENERATING_HOLD_MS = 2400;
export const PREVIEW_WEEK_DAY_ORDER = [...TRAINING_DAY_OPTIONS];
export const PREVIEW_WEEK_TEXT_ROW_CONFIG = [
  { id: "session", label: "Session", valueKey: "session", textClass: "preview-week-session" },
  { id: "duration", label: "Duration", valueKey: "meta", textClass: "preview-week-meta" },
  { id: "workout", label: "Workout", valueKey: "workout", textClass: "preview-week-meta" }
];
export const PREVIEW_WEEK_TABLE_BODY_ROW_COUNT = PREVIEW_WEEK_TEXT_ROW_CONFIG.length + 1;
export const PREVIEW_WEEK_TABLE_ROW_COUNT = PREVIEW_WEEK_TABLE_BODY_ROW_COUNT + 1;
export const PREVIEW_WEEK_TABLE_COLUMN_COUNT = PREVIEW_WEEK_DAY_ORDER.length + 1;
export const PREVIEW_WEEK_HORIZONTAL_LINE_COUNT = PREVIEW_WEEK_TABLE_ROW_COUNT + 1;
export const PREVIEW_WEEK_VERTICAL_LINE_COUNT = PREVIEW_WEEK_TABLE_COLUMN_COUNT + 1;

const DEFAULT_PREVIEW_WEEK_HORIZONTAL_LINE_OFFSETS = Array.from(
  { length: PREVIEW_WEEK_HORIZONTAL_LINE_COUNT },
  (_, index) => `${(index / Math.max(PREVIEW_WEEK_HORIZONTAL_LINE_COUNT - 1, 1)) * 100}%`
);

const DEFAULT_PREVIEW_WEEK_VERTICAL_LINE_OFFSETS = Array.from(
  { length: PREVIEW_WEEK_VERTICAL_LINE_COUNT },
  (_, index) => `${(index / Math.max(PREVIEW_WEEK_VERTICAL_LINE_COUNT - 1, 1)) * 100}%`
);

export const createDefaultPreviewWeekLineOffsets = () => ({
  horizontal: [...DEFAULT_PREVIEW_WEEK_HORIZONTAL_LINE_OFFSETS],
  vertical: [...DEFAULT_PREVIEW_WEEK_VERTICAL_LINE_OFFSETS]
});

export const PREVIEW_WEEK_LINE_STAGGER_MS = 120;
export const PREVIEW_WEEK_LINE_DRAW_MS = 520;
export const PREVIEW_WEEK_OUTLINE_START_MS = 180;
export const PREVIEW_WEEK_OUTLINE_DRAW_MS =
  (PREVIEW_WEEK_HORIZONTAL_LINE_COUNT + PREVIEW_WEEK_VERTICAL_LINE_COUNT - 1) *
    PREVIEW_WEEK_LINE_STAGGER_MS +
  PREVIEW_WEEK_LINE_DRAW_MS;
export const PREVIEW_WEEK_HEADER_REVEAL_MS = 620;
export const PREVIEW_WEEK_ROW_TYPING_MS = 1800;
export const PREVIEW_WEEK_SCAN_DELAY_MS = 400;
export const PREVIEW_WEEK_SCAN_DURATION_MS = 5000;
export const PREVIEW_WEEK_BREAK_AFTER_SCAN_START_MS = PREVIEW_WEEK_SCAN_DURATION_MS;
export const PREVIEW_WEEK_PARTICLE_DENSITY_PX = 1500;
export const PREVIEW_WEEK_PARTICLE_MIN_COUNT = 4;
export const PREVIEW_WEEK_PARTICLE_MAX_COUNT = 14;
export const PREVIEW_WEEK_PARTICLE_MAX_TOTAL = 260;
export const PREVIEW_WEEK_CHUNK_MAX_TOTAL = 110;
export const PREVIEW_WEEK_PARTICLE_MIN_SIZE_PX = 1;
export const PREVIEW_WEEK_PARTICLE_MAX_SIZE_PX = 3.4;
export const PREVIEW_WEEK_PARTICLE_MIN_DURATION_MS = 1850;
export const PREVIEW_WEEK_PARTICLE_MAX_DURATION_MS = 2650;
export const PREVIEW_WEEK_PARTICLE_ROW_DELAY_MS = 980;
export const PREVIEW_WEEK_PARTICLE_JITTER_MS = 18;
export const PREVIEW_WEEK_PARTICLE_TOTAL_DURATION_MS = 3000;
export const PREVIEW_DASHBOARD_AUTO_ADVANCE_MS = 820;
export const PREVIEW_DASHBOARD_STAGE_START_MS = 280;
export const PREVIEW_DASHBOARD_STAGE_STEP_MS = 480;
export const PREVIEW_DASHBOARD_FINAL_STAGE = 8;
export const PREVIEW_TOC_SWITCH_MS = 760;
export const PREVIEW_WEEK_MIN_WORKOUT_DAYS = 5;
export const PREVIEW_WEEK_DAY_NORMALIZATION = {
  mon: "Monday",
  monday: "Monday",
  tue: "Tuesday",
  tues: "Tuesday",
  tuesday: "Tuesday",
  wed: "Wednesday",
  weds: "Wednesday",
  wednesday: "Wednesday",
  thu: "Thursday",
  thur: "Thursday",
  thurs: "Thursday",
  thursday: "Thursday",
  fri: "Friday",
  friday: "Friday",
  sat: "Saturday",
  saturday: "Saturday",
  sun: "Sunday",
  sunday: "Sunday"
};
