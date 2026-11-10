/**
 * The exercise swaps in a saved plan (roadmap C4): the alternatives to one of
 * its exercises, the swap, and the undo, each under the rules the plan was built
 * with (services/planning/swaps.js). Registered by dashboardRoutes.js.
 */
import { sendErrorResponse } from "../../services/http/errorResponseService.js";
import {
  SWAP_AREAS,
  applySwap,
  rulesForPlan,
  swapOptions,
  undoSwap
} from "../../services/planning/swaps.js";
import {
  planSwapBodySchema,
  planSwapParamsSchema,
  planSwapQuerySchema,
  planUndoBodySchema,
  validateParams,
  validateQuery
} from "./validation.js";

const NO_PLAN = "That plan was not found.";
const NO_STRUCTURE = "That plan has no saved structure to swap in.";
const NOT_IN_PLAN = "That exercise is not in this plan.";
const CHANGED = "The plan has changed. Reload it and try again.";
const NOTHING_SWAPPED = "That exercise has no swap to undo.";

/**
 * The profile's age, which shapes a plan's doses as it does when one is
 * generated, or null when the profile has none.
 */
const ageOf = (req) => (typeof req.user?.profile?.age === "number" ? req.user.profile.age : null);

/**
 * Registers GET and POST on /api/dashboard/plans/:planId/swaps and POST on its
 * /undo, all behind `requireAuth`. `:planId` is the plan's id as the client
 * knows it. The GET answers `{ exercise, area, areas, alternatives }`, and each
 * POST `{ plan }`, the plan as the dashboard maps it. From `deps`,
 * `findPlanForUser` and `rewritePlan` come from generatedPlanRepository.js.
 */
export const registerPlanSwapRoutes = (app, deps) => {
  const { requireAuth, validateBody, findPlanForUser, rewritePlan } = deps;
  const path = "/api/dashboard/plans/:planId/swaps";

  // Another user's plan is a 404 like a missing one, and a plan without a saved
  // structure has nothing to swap. A name that is not one of its prescriptions,
  // or not in the library, is a 400.
  app.get(path, requireAuth, async (req, res) => {
    try {
      const params = validateParams(req, res, planSwapParamsSchema);
      if (!params) return;
      const query = validateQuery(req, res, planSwapQuerySchema);
      if (!query) return;

      const plan = await findPlanForUser({ userId: req.user.id, planId: params.planId });
      if (!plan) return res.status(404).json({ error: NO_PLAN });
      if (!plan.payload) return res.status(404).json({ error: NO_STRUCTURE });
      const area = query.area ?? null;
      const rules = rulesForPlan(plan, { age: ageOf(req), area });
      const alternatives = swapOptions(plan, query.exercise, rules);
      if (!alternatives) return res.status(400).json({ error: NOT_IN_PLAN });
      return res.json({ exercise: query.exercise, area, areas: SWAP_AREAS, alternatives });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  // One handler for the swap and the undo. `change` works the new plan out
  // from the plan as stored, inside rewritePlan's lock, so the alternatives are
  // worked out again there and the client's list is never trusted. A change the
  // stored plan cannot take is a 409 with `conflict`, since the plan has moved
  // under the client.
  const write = (bodySchema, conflict, change) => async (req, res) => {
    try {
      const params = validateParams(req, res, planSwapParamsSchema);
      if (!params) return;
      const body = validateBody(req, res, bodySchema);
      if (!body) return;

      let unstructured = false;
      const result = await rewritePlan({
        userId: req.user.id,
        planId: params.planId,
        rewrite: (plan) => {
          if (plan.payload) return change(plan, body, ageOf(req));
          unstructured = true;
          return null;
        }
      });
      if (!result) return res.status(404).json({ error: NO_PLAN });
      if (unstructured) return res.status(404).json({ error: NO_STRUCTURE });
      if (result.conflict) return res.status(409).json({ error: conflict });
      return res.json({ plan: result.plan });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  };

  app.post(
    path,
    requireAuth,
    write(planSwapBodySchema, CHANGED, (plan, { from, to, area = null }, age) =>
      applySwap(plan, { from, to, area }, rulesForPlan(plan, { age, area }))
    )
  );
  app.post(
    `${path}/undo`,
    requireAuth,
    write(planUndoBodySchema, NOTHING_SWAPPED, (plan, { name }) => undoSwap(plan, name))
  );
};
