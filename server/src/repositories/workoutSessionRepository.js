/**
 * Prisma-native persistence for workout sessions: the row mapper the API
 * returns, what every session read selects with it, and the save, which keeps
 * a link to a plan day only when that day exists in one of the user's plans.
 */
import { toPlanPayload } from "../services/dashboard/planPayloadService.js";
import { dateOnlyToDate, toDateOnly, toIso, toJsonArray, toNumberOrNull } from "./rowValues.js";
import { legacyOrIdWhere, getUserPk } from "./userLookup.js";

/**
 * What every read of workout_sessions includes, so mapWorkoutSession can give
 * a linked session its plan's id as the client knows it.
 */
export const WORKOUT_SESSION_INCLUDE = {
  generatedPlan: { select: { id: true, legacyId: true } }
};

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
   * for this user.
   *
   * Read-then-write rather than a Prisma `upsert` for the same reason as
   * progress metrics: `workout_sessions_user_legacy_idx` is a *partial* unique
   * index (`where legacy_id is not null`), which schema.prisma cannot express,
   * so `upsert` has no constraint to target.
   *
   * The link to a plan day is written whole or not at all: an update without
   * one clears it. Returns null when the user cannot be resolved.
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

    const row = existing
      ? await prisma.workoutSession.update({
          where: { id: existing.id },
          data,
          include: WORKOUT_SESSION_INCLUDE
        })
      : await prisma.workoutSession.create({ data, include: WORKOUT_SESSION_INCLUDE });

    return mapWorkoutSession(row);
  };

  return { saveWorkoutSession };
};
