/**
 * Fixed values for the home page's preview walkthrough: the sample profile it
 * falls back on, the day and field lists, and the timings and particle limits
 * it is paced by. Read throughout the walkthrough, and by HomePage for the
 * personal stage's training days.
 */
// The regions for which usePreviewDerivedData types the height in feet and
// inches and gives the dashboard's target weight in pounds. App's own unit
// choice reads a private copy of the same set in app/units.js.
export const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);
// The days the Training days toggles offer, Monday first. HomePage's personal
// stage stores the picked ones as they are in `personal.trainingDays`; the
// walkthrough's personal chapter shows the same toggles, which do nothing
// there. PREVIEW_WEEK_DAY_ORDER copies this order, and getPreviewWeekdayName's
// rotation assumes it starts on Monday.
export const TRAINING_DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

// The sample visitor. usePreviewDerivedData takes from here each field the
// visitor's profile and planner form leave empty.
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

// The personal chapter's select menus, which the walkthrough sets whole instead
// of typing.
export const PREVIEW_INSTANT_FIELDS = new Set([
  "sex",
  "activity",
  "sleep",
  "experience",
  "nutrition",
  "cardio"
]);

// ---- Personal and generate chapter timings ----------------------------------
// Times here and below are in milliseconds, and sizes in pixels. A value that
// has to match a stylesheet says which beside it.
export const PREVIEW_TYPING_MIN_MS = 22;
export const PREVIEW_TYPING_MAX_MS = 58;
export const PREVIEW_TRAINING_DAY_STEP_MS = 110;
export const PREVIEW_COLLAPSE_DELAY_MS = 480;
// The same as `--preview-motion-duration` in styles/personal.css, which times
// the collapse morph and the builder's entrances; the wait after the morph and
// the builder's step below are derived from it.
const PREVIEW_MOTION_DURATION_MS = 1100;
const PREVIEW_MORPH_DURATION_MS = PREVIEW_MOTION_DURATION_MS;
export const PREVIEW_POST_MORPH_SHIFT_DELAY_MS = Math.max(0, PREVIEW_MORPH_DURATION_MS + 40);
export const PREVIEW_BUILDER_START_DELAY_MS = 760;
export const PREVIEW_BUILDER_STEP_MS = PREVIEW_MOTION_DURATION_MS;
export const PREVIEW_GENERATING_HOLD_MS = 2400;

// ---- The week table's shape -------------------------------------------------
export const PREVIEW_WEEK_DAY_ORDER = [...TRAINING_DAY_OPTIONS];
export const PREVIEW_WEEK_TEXT_ROW_CONFIG = [
  { id: "session", label: "Session", valueKey: "session", textClass: "preview-week-session" },
  { id: "duration", label: "Duration", valueKey: "meta", textClass: "preview-week-meta" },
  { id: "workout", label: "Workout", valueKey: "workout", textClass: "preview-week-meta" }
];
// A header row, a row per PREVIEW_WEEK_TEXT_ROW_CONFIG entry and a highlights
// row, against a label column and a column per day. The outline has a line
// above the table and below each row, and one left of the table and right of
// each column: the edges usePreviewWeekOutline measures.
const PREVIEW_WEEK_TABLE_BODY_ROW_COUNT = PREVIEW_WEEK_TEXT_ROW_CONFIG.length + 1;
const PREVIEW_WEEK_TABLE_ROW_COUNT = PREVIEW_WEEK_TABLE_BODY_ROW_COUNT + 1;
const PREVIEW_WEEK_TABLE_COLUMN_COUNT = PREVIEW_WEEK_DAY_ORDER.length + 1;
const PREVIEW_WEEK_HORIZONTAL_LINE_COUNT = PREVIEW_WEEK_TABLE_ROW_COUNT + 1;
const PREVIEW_WEEK_VERTICAL_LINE_COUNT = PREVIEW_WEEK_TABLE_COLUMN_COUNT + 1;

// The lines evenly spaced from 0% to 100%, until the real grid is measured.
const DEFAULT_PREVIEW_WEEK_HORIZONTAL_LINE_OFFSETS = Array.from(
  { length: PREVIEW_WEEK_HORIZONTAL_LINE_COUNT },
  (_, index) => `${(index / Math.max(PREVIEW_WEEK_HORIZONTAL_LINE_COUNT - 1, 1)) * 100}%`
);

const DEFAULT_PREVIEW_WEEK_VERTICAL_LINE_OFFSETS = Array.from(
  { length: PREVIEW_WEEK_VERTICAL_LINE_COUNT },
  (_, index) => `${(index / Math.max(PREVIEW_WEEK_VERTICAL_LINE_COUNT - 1, 1)) * 100}%`
);

/**
 * The week outline's starting line positions, as `{ horizontal, vertical }`
 * lists of percentages, evenly spaced. PreviewStage seeds its state with them,
 * and usePreviewWeekOutline replaces them with measured ones on the week
 * chapter. Each call returns new arrays, so state never holds the shared ones.
 */
export const createDefaultPreviewWeekLineOffsets = () => ({
  horizontal: [...DEFAULT_PREVIEW_WEEK_HORIZONTAL_LINE_OFFSETS],
  vertical: [...DEFAULT_PREVIEW_WEEK_VERTICAL_LINE_OFFSETS]
});

// ---- Week, dashboard and table-of-contents timings, and the particles -------
export const PREVIEW_WEEK_LINE_STAGGER_MS = 120;
const PREVIEW_WEEK_LINE_DRAW_MS = 520;
export const PREVIEW_WEEK_OUTLINE_START_MS = 180;
// Each line starts PREVIEW_WEEK_LINE_STAGGER_MS after the one before, the
// horizontals first, so this is the last one's start plus one line's draw.
export const PREVIEW_WEEK_OUTLINE_DRAW_MS =
  (PREVIEW_WEEK_HORIZONTAL_LINE_COUNT + PREVIEW_WEEK_VERTICAL_LINE_COUNT - 1) *
    PREVIEW_WEEK_LINE_STAGGER_MS +
  PREVIEW_WEEK_LINE_DRAW_MS;
export const PREVIEW_WEEK_HEADER_REVEAL_MS = 620;
export const PREVIEW_WEEK_ROW_TYPING_MS = 1800;
export const PREVIEW_WEEK_SCAN_DELAY_MS = 400;
// The same as the duration of `preview-week-live-scan-once` in
// styles/workout-week/structure.css, so the table starts to break apart as the
// scan ends.
const PREVIEW_WEEK_SCAN_DURATION_MS = 5000;
export const PREVIEW_WEEK_BREAK_AFTER_SCAN_START_MS = PREVIEW_WEEK_SCAN_DURATION_MS;
// The dissolve: square pixels of an element per particle, the particles each
// element may take and the whole table's caps, their sizes and durations, the
// delay that runs the dissolve down the table from top to bottom and its random
// jitter, and how long the table itself takes to fade.
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
// The pause after the dissolve before the walkthrough moves to the dashboard.
export const PREVIEW_DASHBOARD_AUTO_ADVANCE_MS = 820;
export const PREVIEW_DASHBOARD_STAGE_START_MS = 280;
export const PREVIEW_DASHBOARD_STAGE_STEP_MS = 480;
// The highest stage PreviewDashboardChapter reveals a card at.
export const PREVIEW_DASHBOARD_FINAL_STAGE = 8;
// How long the table of contents keeps a switch's expanding and contracting
// classes.
export const PREVIEW_TOC_SWITCH_MS = 760;
// The fewest training days the week shows; the visitor's are topped up to it.
export const PREVIEW_WEEK_MIN_WORKOUT_DAYS = 5;
// Lower-case day names and short forms, for normalizePreviewTrainingDay.
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
