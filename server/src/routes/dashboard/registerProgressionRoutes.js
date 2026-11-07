/**
 * The week's progression (roadmap B4): its read, and the answers that undo a
 * change, settle an asked step up or train a deload week normally. Registered
 * by dashboardRoutes.js.
 */
import { sendErrorResponse } from "../../services/http/errorResponseService.js";
import {
  allowedWeekStarts,
  buildProgression,
  clientToday,
  liftKeyOf,
  weekStartOf
} from "../../services/planning/progression.js";
import {
  liftDecisionBodySchema,
  progressionLiftParamsSchema,
  progressionQuerySchema,
  progressionWeekParamsSchema,
  validateParams,
  validateQuery,
  weekDecisionBodySchema
} from "./validation.js";

const NO_USER = "User not found.";
const NO_PLAN = "There is no plan with a saved structure to answer for.";
const NO_LIFT = "That lift is not one of this week's lifts.";
const CLOSED_WEEK = "Answers can only be given for this week.";

/**
 * Registers GET /api/dashboard/progression, and PUT and DELETE on
 * /api/dashboard/progression/:weekStart/lifts/:liftKey and
 * /api/dashboard/progression/:weekStart/week, all behind `requireAuth`. Each
 * answers `{ progression }`. From `deps`, `findUserWithDashboard` and
 * `mapDbDocToUser` load the user as the dashboard read does, and the three
 * answer functions come from progressionDecisionRepository.js.
 */
export const registerProgressionRoutes = (app, deps) => {
  const {
    requireAuth,
    validateBody,
    findUserWithDashboard,
    mapDbDocToUser,
    listWeekDecisions,
    saveDecision,
    removeDecision
  } = deps;

  // The week of `today` for the user: the newest plan, every session the
  // dashboard read holds, the profile note and the week's answers. Undefined
  // when the user row is gone, and null when the plan has no saved structure.
  const loadWeek = async (userId, today) => {
    const userDoc = await findUserWithDashboard(userId);
    if (!userDoc) return undefined;
    const { dashboard, profile } = mapDbDocToUser(userDoc);
    const decisions = await listWeekDecisions({ userId, weekStart: weekStartOf(today) });
    return buildProgression({
      plan: dashboard.plans[0] ?? null,
      sessions: dashboard.workoutSessions,
      decisions,
      today,
      notes: profile.notes
    });
  };

  // `today` is the client's local date, kept when it is within a day of the
  // server's and replaced otherwise; one that is not a date key is a 400.
  app.get("/api/dashboard/progression", requireAuth, async (req, res) => {
    try {
      const query = validateQuery(req, res, progressionQuerySchema);
      if (!query) return;
      const progression = await loadWeek(req.user.id, clientToday(query.today, new Date()));
      if (progression === undefined) return res.status(404).json({ error: NO_USER });
      return res.json({ progression });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  // One handler for all four answers. A week other than the Monday of a date
  // within a day of the server's is a 400, so an old link cannot rewrite
  // history, and a lift the week does not hold is a 404, so no row is stored
  // for it. A body schema saves its decision; without one the answer is removed.
  const answer = (paramsSchema, bodySchema) => async (req, res) => {
    try {
      const params = validateParams(req, res, paramsSchema);
      if (!params) return;
      const body = bodySchema ? validateBody(req, res, bodySchema) : {};
      if (!body) return;
      if (!allowedWeekStarts(new Date()).includes(params.weekStart)) {
        return res.status(400).json({ error: CLOSED_WEEK });
      }

      const userId = req.user.id;
      const { weekStart } = params;
      const week = await loadWeek(userId, weekStart);
      if (week === undefined) return res.status(404).json({ error: NO_USER });
      if (week === null) return res.status(404).json({ error: NO_PLAN });
      // A lift key of spaces alone trims to the week's '', so the path decides.
      const onLift = "liftKey" in params;
      const liftKey = onLift ? liftKeyOf(params.liftKey) : "";
      if (onLift && !week.lifts.some((lift) => lift.key === liftKey)) {
        return res.status(404).json({ error: NO_LIFT });
      }

      if (body.decision)
        await saveDecision({ userId, weekStart, liftKey, decision: body.decision });
      else await removeDecision({ userId, weekStart, liftKey });
      return res.json({ progression: await loadWeek(userId, weekStart) });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  };

  const liftPath = "/api/dashboard/progression/:weekStart/lifts/:liftKey";
  const weekPath = "/api/dashboard/progression/:weekStart/week";
  app.put(liftPath, requireAuth, answer(progressionLiftParamsSchema, liftDecisionBodySchema));
  app.delete(liftPath, requireAuth, answer(progressionLiftParamsSchema));
  app.put(weekPath, requireAuth, answer(progressionWeekParamsSchema, weekDecisionBodySchema));
  app.delete(weekPath, requireAuth, answer(progressionWeekParamsSchema));
};
