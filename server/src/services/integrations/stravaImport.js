/**
 * The rules for bringing a Strava activity in (roadmap C2,
 * docs/specs/2026-11-12-strava-import-design.md, "The import rules"), as pure
 * functions of the activity and what the user already has.
 */
// @ts-check

/** The sport types that a workout logged in the app that day already covers. */
export const STRENGTH_SPORTS = new Set(["WeightTraining", "Workout", "Crossfit"]);

/**
 * What to do with an activity: "skip-deleted" when the user deleted it here,
 * "update" when it is already imported, "skip-duplicate" for a new strength-type
 * activity on a day with an app-logged workout, and "create" otherwise.
 * @param {{ workout: { sport: string | null }, deletedHere: boolean, appWorkoutThatDay: boolean, existing: boolean }} facts
 */
export const decideImport = ({ workout, deletedHere, appWorkoutThatDay, existing }) => {
  if (deletedHere) return "skip-deleted";
  if (existing) return "update";
  if (appWorkoutThatDay && STRENGTH_SPORTS.has(String(workout.sport))) return "skip-duplicate";
  return "create";
};

/**
 * The activity ids of `imports` that Strava no longer lists, but only from a
 * `complete` list: a partial one could be missing an activity that still exists.
 * @param {{ imports: { externalId: string }[], listedIds: Set<string>, complete: boolean }} args
 */
export const deletionsFrom = ({ imports, listedIds, complete }) =>
  complete
    ? imports.map((item) => item.externalId).filter((externalId) => !listedIds.has(externalId))
    : [];
