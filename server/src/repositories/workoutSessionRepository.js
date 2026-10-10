/**
 * Prisma-native persistence for workout sessions: the row mapper the API
 * returns, and the save.
 */
import { dateOnlyToDate, toDateOnly, toIso, toJsonArray, toNumberOrNull } from "./rowValues.js";
import { getUserPk } from "./userLookup.js";

/**
 * Maps a workout_sessions row to the session the API returns. `intensityRpe`
 * is a Decimal column, read through toNumberOrNull, so an unrecorded RPE is
 * null, not 0.
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
  createdAt: toIso(row.createdAt)
});

/**
 * Builds the workout-session writer over `prisma`. Returns `saveWorkoutSession`,
 * which the workout route calls.
 */
export const createWorkoutSessionRepository = ({ prisma }) => {
  /**
   * Inserts a session, or updates the existing row carrying the same legacy id
   * for this user.
   *
   * Read-then-write rather than a Prisma `upsert` for the same reason as
   * progress metrics: `workout_sessions_user_legacy_idx` is a *partial* unique
   * index (`where legacy_id is not null`), which schema.prisma cannot express,
   * so `upsert` has no constraint to target.
   *
   * Returns null when the user cannot be resolved.
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
      createdAt: session.createdAt ? new Date(session.createdAt) : new Date()
    };

    const row = existing
      ? await prisma.workoutSession.update({ where: { id: existing.id }, data })
      : await prisma.workoutSession.create({ data });

    return mapWorkoutSession(row);
  };

  return { saveWorkoutSession };
};
