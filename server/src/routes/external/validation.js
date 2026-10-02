/**
 * Query and params schemas for the external-data routes (weather, air quality,
 * wger and TheMealDB), and the helpers that validate a request against them.
 */
import { z } from "zod";
import { validateSchemaInput } from "../../services/http/requestValidationService.js";

export const coordinateQuerySchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180)
  })
  .passthrough();

export const airQualityQuerySchema = coordinateQuerySchema
  .extend({
    radiusKm: z.coerce.number().min(1).max(100).optional()
  })
  .passthrough();

const queryMultiValueSchema = z.union([
  z.string().trim().min(1),
  z.number(),
  z.array(z.union([z.string().trim().min(1), z.number()])).min(1)
]);

export const wgerExercisesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(80).optional(),
    offset: z.coerce.number().int().min(0).max(5000).optional(),
    language: z.coerce.number().int().min(1).max(100).optional(),
    category: queryMultiValueSchema.optional(),
    muscle: queryMultiValueSchema.optional(),
    equipment: queryMultiValueSchema.optional(),
    q: z.string().trim().max(120).optional()
  })
  .passthrough();

export const wgerExerciseIdParamsSchema = z.object({
  id: z.coerce.number().int().min(1).max(1000000)
});

export const wgerExerciseDetailsQuerySchema = z
  .object({
    language: z.coerce.number().int().min(1).max(100).optional()
  })
  .passthrough();

export const mealDbSearchQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(100).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(20).optional()
  })
  .passthrough()
  .refine((value) => Boolean(value.query || value.q), {
    message: "query or q is required",
    path: ["query"]
  });

/**
 * Validates `req.query` against `schema` and returns the parsed data. On failure
 * it answers 400 and returns null, so the route stops on a null. The error is
 * the first schema issue unless `options.message` gives a fixed one instead;
 * `options.fallbackPath` names the field when that issue carries no path.
 */
export const validateQuery = (req, res, schema, options = {}) => {
  const { fallbackPath = "query", message = "" } = options;
  const { data, error } = validateSchemaInput(schema, req.query || {}, fallbackPath);
  if (!error) return data;
  res.status(400).json({ error: message || error });
  return null;
};

/** The same as validateQuery, for `req.params`. */
export const validateParams = (req, res, schema, options = {}) => {
  const { fallbackPath = "params", message = "" } = options;
  const { data, error } = validateSchemaInput(schema, req.params || {}, fallbackPath);
  if (!error) return data;
  res.status(400).json({ error: message || error });
  return null;
};
