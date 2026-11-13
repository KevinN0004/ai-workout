/**
 * Turns a Strava activity into the workout an import stores (roadmap C2,
 * docs/specs/2026-11-12-strava-import-design.md, "Data"). What Strava leaves out
 * stays absent, and every value fits the workout_sessions checks.
 */
// @ts-check

// The workout_sessions limits: the session's 5-360 minute check, the logging
// form's 500-character notes and 80-character focus, and 008's 60-character sport.
const MIN_MINUTES = 5;
const MAX_MINUTES = 360;
const NOTES_MAX = 500;
const FOCUS_MAX = 80;
const SPORT_MAX = 60;

// Labels the CamelCase split would read badly.
const LABELS = new Map([
  ["EBikeRide", "E-bike ride"],
  ["EMountainBikeRide", "E-mountain bike ride"],
  ["HighIntensityIntervalTraining", "HIIT"],
  ["Crossfit", "CrossFit"]
]);

/** @param {unknown} value */
const text = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * The positive number `value` holds, or null. Absence is tested before any
 * conversion, so null, "" and a missing key never become 0; and 0 itself is
 * null, since Strava's 0 distance means "no distance".
 * @param {unknown} value
 */
export const positiveOrNull = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

/**
 * The words a Strava sport type reads as: "WeightTraining" is "Weight training".
 * "Activity" when there is none.
 * @param {unknown} type
 */
export const sportLabel = (type) => {
  const name = text(type);
  if (!name) return "Activity";
  const known = LABELS.get(name);
  if (known) return known;
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
};

/**
 * Minutes of moving time within the session check's range, or null: an activity
 * shorter or longer still imports, without a duration, rather than failing.
 * @param {unknown} seconds
 */
const minutesOf = (seconds) => {
  const value = positiveOrNull(seconds);
  if (value === null) return null;
  const minutes = Math.round(value / 60);
  return minutes >= MIN_MINUTES && minutes <= MAX_MINUTES ? minutes : null;
};

/**
 * The YYYY-MM-DD at the front of `value`, the activity's local start as Strava
 * writes it. Never converted through a time zone, so the day is the athlete's.
 * @param {unknown} value
 */
const dateOf = (value) => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text(value));
  return match ? match[1] : null;
};

/**
 * The workout an import of `activity` stores: its id, sport, local date, label,
 * minutes, title, and its distance and average heart rate when Strava has them.
 * @param {any} activity
 */
export const toWorkout = (activity) => {
  const sport = (text(activity.sport_type) || text(activity.type)).slice(0, SPORT_MAX) || null;
  return {
    externalId: String(activity.id),
    sport,
    workoutDate: dateOf(activity.start_date_local),
    focus: sportLabel(sport).slice(0, FOCUS_MAX),
    durationMinutes: minutesOf(activity.moving_time),
    notes: text(activity.name).slice(0, NOTES_MAX),
    distanceMeters: positiveOrNull(activity.distance),
    averageHeartrate:
      activity.has_heartrate === true ? positiveOrNull(activity.average_heartrate) : null
  };
};
