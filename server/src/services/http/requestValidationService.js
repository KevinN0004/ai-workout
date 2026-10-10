/**
 * Validates a query string or route params against a zod schema without
 * answering the request, so the caller decides the response. Used by the
 * dashboard and external routes.
 */
import { validationMessage } from "./validationMessages.js";

const toShortError = (value, maxLen = 240) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

/**
 * The first issue in a zod error as `path: message`, cut to 240 characters. An
 * issue with no path is labelled with `fallbackPath`.
 */
export const getSchemaValidationMessage = (error, fallbackPath = "request") => {
  const issue = error?.issues?.[0];
  if (!issue) return "Invalid request.";
  const pathParts = Array.isArray(issue.path) ? issue.path.filter(Boolean) : [];
  const path = pathParts.length ? pathParts.join(".") : fallbackPath;
  const message = `${path}: ${issue.message}`;
  return toShortError(message) || "Invalid request.";
};

/**
 * Parses `input` with `schema`, in zod 3's wording (validationMessages.js).
 * Returns `{ data, error: "" }` on success, and `{ data: null, error }` with
 * the first issue's message on failure.
 */
export const validateSchemaInput = (schema, input, fallbackPath = "request") => {
  const result = schema.safeParse(input, { error: validationMessage });
  if (result.success) return { data: result.data, error: "" };
  return {
    data: null,
    error: getSchemaValidationMessage(result.error, fallbackPath)
  };
};
