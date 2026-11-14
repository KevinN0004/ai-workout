/**
 * Query and params schemas for the dashboard routes, and the helpers that
 * validate a request against them.
 */
import { z } from "zod";
import { validateSchemaInput } from "../../services/http/requestValidationService.js";
import { SWAP_AREAS } from "../../services/planning/swaps.js";

export const dashboardPaginationQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).max(100000).optional()
  })
  .passthrough();

export const savedExerciseParamsSchema = z.object({
  id: z.string().trim().min(1).max(64)
});

/** The id in DELETE /api/dashboard/workouts/:id, as the client holds it. */
export const workoutParamsSchema = z.object({
  id: z.string().trim().min(1).max(64)
});

// The shape of a date key. Whether it is a real date, and a week that may still
// be answered, is checked by the progression rules.
const dateKeyField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The progression read's query: the client's local date, optional. */
export const progressionQuerySchema = z.object({ today: dateKeyField.optional() }).passthrough();

/** The week answer's path. */
export const progressionWeekParamsSchema = z.object({ weekStart: dateKeyField });

/** A lift answer's path: the week and the lift's key, as the progression read gives it. */
export const progressionLiftParamsSchema = z.object({
  weekStart: dateKeyField,
  liftKey: z.string().min(1).max(140)
});

/** What a lift can be answered: undo an automatic change, or settle an asked step up. */
export const liftDecisionBodySchema = z.object({ decision: z.enum(["undo", "accept", "decline"]) });

/** What the week can be answered: train a deload week normally. */
export const weekDecisionBodySchema = z.object({ decision: z.literal("normal") });

/**
 * Validates `req.query` against `schema` and returns the parsed data. On failure
 * it answers 400 with the first issue and returns null, so the route stops on a
 * null.
 */
export const validateQuery = (req, res, schema, fallbackPath = "query") => {
  const { data, error } = validateSchemaInput(schema, req.query || {}, fallbackPath);
  if (!error) return data;
  res.status(400).json({ error });
  return null;
};

/** The same as validateQuery, for `req.params`. */
export const validateParams = (req, res, schema, fallbackPath = "params") => {
  const { data, error } = validateSchemaInput(schema, req.params || {}, fallbackPath);
  if (!error) return data;
  res.status(400).json({ error });
  return null;
};

// Roadmap C4: a plan's id as the client knows it, an exercise's name as the
// plan writes it, and an area a swap can name.
const planIdField = z.string().trim().min(1).max(100);
const exerciseNameField = z.string().trim().min(1).max(140);
const swapAreaField = z.enum([...SWAP_AREAS]);

/** A plan swap's path: the plan. */
export const planSwapParamsSchema = z.object({ planId: planIdField });

/** The alternatives' query: the exercise, and an area that bothers, optional. */
export const planSwapQuerySchema = z
  .object({ exercise: exerciseNameField, area: swapAreaField.optional() })
  .passthrough();

/** A swap: the exercise in the plan, the alternative chosen, and any area named. */
export const planSwapBodySchema = z.object({
  from: exerciseNameField,
  to: exerciseNameField,
  area: swapAreaField.nullable().optional()
});

/** An undo: the swapped exercise's name. */
export const planUndoBodySchema = z.object({ name: exerciseNameField });
