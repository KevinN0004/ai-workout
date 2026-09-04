import { dateOnlyToDate, toDateOnly, toIso, toNumberOrNull } from "./rowValues.js";
import { getUserPk } from "./userLookup.js";

/**
 * Prisma-native persistence for workout sessions.
 *
 * Task 2 of docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md, and the
 * same shape as progressMetricRepository.js. The compatibility shim delegates
 * its WorkoutSession mapping here rather than keeping a private copy.
 */

const toJsonArray = (value) => (Array.isArray(value) ? value : []);

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
