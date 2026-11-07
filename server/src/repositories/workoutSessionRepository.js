/**
 * Prisma-native persistence for workout sessions: the row mapper the API
 * returns, what every session read selects with it, and the save, which keeps
 * a link to a plan day only when that day exists in one of the user's plans.
 */
import { toPlanPayload } from "../services/dashboard/planPayloadService.js";
import { EXERCISES } from "../services/planning/exerciseLibrary.js";
import { dateOnlyToDate, toDateOnly, toIso, toJsonArray, toNumberOrNull } from "./rowValues.js";
import { legacyOrIdWhere, getUserPk } from "./userLookup.js";

// Each library exercise's movement pattern by its name, trimmed and lower-cased
// (every name is distinct that way), for tagging a logged exercise (roadmap B2).
const PATTERN_BY_NAME = new Map(
  EXERCISES.map((exercise) => [exercise.name.trim().toLowerCase(), exercise.pattern])
);

/**
 * What every read of workout_sessions includes, so mapWorkoutSession can give
 * a linked session its plan's id as the client knows it, and its sets in the
 * order they were logged.
 */
export const WORKOUT_SESSION_INCLUDE = {
  generatedPlan: { select: { id: true, legacyId: true } },
  exerciseSets: { orderBy: [{ exerciseOrder: "asc" }, { setNumber: "asc" }] }
};

// A session's set rows, already in order, grouped into one entry per
// exercise as the API takes and returns them. Every number reads through
// toNumberOrNull (`loadKg` and `rpe` are Decimal columns), so a missing one is
// null and a measured 0, a failed set or a bodyweight load, stays 0. Each
// exercise carries its library pattern, or null for a name typed by hand.
const groupExerciseSets = (rows) => {
  const exercises = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const set = {
      reps: toNumberOrNull(row.reps),
      seconds: toNumberOrNull(row.seconds),
      loadKg: toNumberOrNull(row.loadKg),
      rpe: toNumberOrNull(row.rpe)
    };
    const last = exercises[exercises.length - 1];
    if (last && last.order === row.exerciseOrder) last.sets.push(set);
    else exercises.push({ order: row.exerciseOrder, name: row.exerciseName, sets: [set] });
  }
  return exercises.map(({ name, sets }) => ({
    name,
    pattern: PATTERN_BY_NAME.get(String(name).trim().toLowerCase()) ?? null,
    sets
  }));
};

// The rows for `exerciseSets`, numbered from 1 within each exercise, each
// carrying the session's own user.
const toExerciseSetRows = (sessionId, userPk, exerciseSets) =>
  exerciseSets.flatMap((exercise, exerciseOrder) =>
    exercise.sets.map((set, index) => ({
      sessionId,
      userId: userPk,
      exerciseOrder,
      exerciseName: exercise.name,
      setNumber: index + 1,
      reps: set.reps ?? null,
      seconds: set.seconds ?? null,
      loadKg: set.loadKg ?? null,
      rpe: set.rpe ?? null
    }))
  );

/**
 * Maps a workout_sessions row to the session the API returns. `intensityRpe`
 * is a Decimal column, read through toNumberOrNull, so an unrecorded RPE is
 * null, not 0. `planId` is the linked plan's id as the client knows it
 * (`legacyId || id`), and `planDayIndex` the day; both are null for an
 * off-plan session, and for one whose plan was deleted, which leaves the index
 * behind (004_workout_plan_day.sql). A linked row always has its index: the
 * migration's link check refuses a plan without one.
 */
export const mapWorkoutSession = (row = {}) => ({
  id: row.legacyId || row.id,
  date: toDateOnly(row.workoutDate),
  focus: row.focus || "General",
  duration: row.durationMinutes ?? null,
  exercises: toJsonArray(row.exercises),
  sets: row.sets ?? null,
  reps: row.reps ?? null,
  intensityRpe: toNumberOrNull(row.intensityRpe),
  notes: row.notes || "",
  planId: row.generatedPlan ? row.generatedPlan.legacyId || row.generatedPlan.id : null,
  planDayIndex: row.generatedPlan ? row.planDayIndex : null,
  exerciseSets: groupExerciseSets(row.exerciseSets),
  createdAt: toIso(row.createdAt)
});

/**
 * Builds the workout-session writer over `prisma`. Returns `saveWorkoutSession`,
 * which the workout route calls.
 */
export const createWorkoutSessionRepository = ({ prisma }) => {
  // The plan's primary key when `planId` names one of this user's plans whose
  // saved structure has a day at `planDayIndex`, and otherwise null. Scoped to
  // the user, so another user's plan reads exactly as an unknown one.
  const resolvePlanDay = async (userPk, planId, planDayIndex) => {
    if (!planId || planDayIndex === null || planDayIndex === undefined) return null;
    const plan = await prisma.generatedPlan.findFirst({
      where: { userId: userPk, ...legacyOrIdWhere(planId, "legacyId") },
      select: { id: true, planPayload: true }
    });
    const payload = toPlanPayload(plan?.planPayload);
    return payload && planDayIndex < payload.days.length ? plan.id : null;
  };

  /**
   * Inserts a session, or updates the existing row carrying the same legacy id
   * for this user, keeping that row's `createdAt`.
   *
   * Read-then-write rather than a Prisma `upsert` for the same reason as
   * progress metrics: `workout_sessions_user_legacy_idx` is a *partial* unique
   * index (`where legacy_id is not null`), which schema.prisma cannot express,
   * so `upsert` has no constraint to target.
   *
   * The link to a plan day is written whole or not at all: an update without
   * one clears it. Returns null when the user cannot be resolved.
   *
   * The session and its sets are written in one transaction, so a set the
   * table refuses leaves no session behind. The sets are replaced only when
   * `exerciseSets` is a list: an update without one, which is all a client on
   * the old bundle can send, keeps the sets already stored.
   */
  const saveWorkoutSession = async ({ userId, session = {} }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return null;

    const legacyId = session.id || null;
    const existing = legacyId
      ? await prisma.workoutSession.findFirst({
          where: { userId: userPk, legacyId },
          select: { id: true }
        })
      : null;
    const generatedPlanId = await resolvePlanDay(userPk, session.planId, session.planDayIndex);

    const data = {
      userId: userPk,
      legacyId,
      workoutDate: dateOnlyToDate(session.date),
      focus: session.focus || "General",
      durationMinutes: session.duration ?? null,
      exercises: toJsonArray(session.exercises),
      sets: session.sets ?? null,
      reps: session.reps ?? null,
      intensityRpe: session.intensityRpe ?? null,
      notes: session.notes || "",
      generatedPlanId,
      planDayIndex: generatedPlanId ? session.planDayIndex : null,
      createdAt: session.createdAt ? new Date(session.createdAt) : new Date()
    };

    const row = await prisma.$transaction(async (tx) => {
      // An update keeps the time the session was first saved, so a replay of an
      // entry logged offline does not move it. Prisma leaves an undefined field
      // untouched.
      const saved = existing
        ? await tx.workoutSession.update({
            where: { id: existing.id },
            data: { ...data, createdAt: undefined }
          })
        : await tx.workoutSession.create({ data });
      if (Array.isArray(session.exerciseSets)) {
        await tx.exerciseSet.deleteMany({ where: { sessionId: saved.id } });
        await tx.exerciseSet.createMany({
          data: toExerciseSetRows(saved.id, userPk, session.exerciseSets)
        });
      }
      return tx.workoutSession.findUnique({
        where: { id: saved.id },
        include: WORKOUT_SESSION_INCLUDE
      });
    });

    return mapWorkoutSession(row);
  };

  return { saveWorkoutSession };
};
