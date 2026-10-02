/**
 * Query and params schemas for the dashboard routes, and the helpers that
 * validate a request against them.
 */
import { z } from "zod";
import { validateSchemaInput } from "../../services/http/requestValidationService.js";

export const dashboardPaginationQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).max(100000).optional()
  })
  .passthrough();

export const savedExerciseParamsSchema = z.object({
  id: z.string().trim().min(1).max(64)
});

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
