import { validationMessage } from "./validationMessages.js";

const toShortError = (value, maxLen = 240) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

export const getSchemaValidationMessage = (error, fallbackPath = "request") => {
  const issue = error?.issues?.[0];
  if (!issue) return "Invalid request.";
  const pathParts = Array.isArray(issue.path) ? issue.path.filter(Boolean) : [];
  const path = pathParts.length ? pathParts.join(".") : fallbackPath;
  const message = `${path}: ${issue.message}`;
  return toShortError(message) || "Invalid request.";
};

export const validateSchemaInput = (schema, input, fallbackPath = "request") => {
  const result = schema.safeParse(input, { error: validationMessage });
  if (result.success) return { data: result.data, error: "" };
  return {
    data: null,
    error: getSchemaValidationMessage(result.error, fallbackPath)
  };
};
