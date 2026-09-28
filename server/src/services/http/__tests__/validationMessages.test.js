import { describe, expect, test } from "vitest";
import {
  generatePlanBodySchema,
  loginBodySchema,
  progressMetricBodySchema,
  savedExerciseBodySchema,
  signupBodySchema,
  validateBody,
  workoutSessionBodySchema
} from "../apiSchemaService.js";
import { validateSchemaInput } from "../requestValidationService.js";
import {
  coordinateQuerySchema,
  mealDbSearchQuerySchema,
  wgerExerciseIdParamsSchema,
  wgerExercisesQuerySchema
} from "../../../routes/external/validation.js";

// The client shows the server's validation error to users verbatim, so this
// wording is user-facing. zod 4 rewrote its default messages ("Too small:
// expected string to have >=8 characters"); these pin the zod 3 wording users
// saw before the upgrade. Every expected string below was recorded from zod
// 3.25.76 running these same schemas, not written from memory.

// validateBody answers through res; capture what it would have sent.
const bodyError = (schema, body) => {
  let sent = null;
  const res = {
    status: () => res,
    json: (payload) => {
      sent = payload;
      return res;
    }
  };
  validateBody({ body }, res, schema);
  return sent?.error;
};

const profile = {
  firstName: "A",
  lastName: "B",
  age: 30,
  heightCm: 175,
  weightKg: 70,
  sex: "Male"
};
const signup = (overrides) => ({ email: "a@b.c", password: "longenough", profile, ...overrides });

describe("request body messages", () => {
  test.each([
    ["a missing field", loginBodySchema, {}, "email: Required"],
    [
      "a wrong type",
      loginBodySchema,
      { email: 42, password: "x" },
      "email: Expected string, received number"
    ],
    [
      "a blank number",
      workoutSessionBodySchema,
      { date: "2026-09-26", duration: "" },
      "duration: Expected number, received null"
    ],
    [
      "a non-object",
      signupBodySchema,
      signup({ profile: "me" }),
      "profile: Expected object, received string"
    ],
    [
      "an unparseable flag",
      signupBodySchema,
      signup({ rememberMe: "maybe" }),
      "rememberMe: Expected boolean, received string"
    ],
    [
      "a string under its floor",
      signupBodySchema,
      signup({ password: "short" }),
      "password: String must contain at least 8 character(s)"
    ],
    [
      "a trimmed-empty string",
      signupBodySchema,
      signup({ email: "   " }),
      "email: String must contain at least 1 character(s)"
    ],
    [
      "a string over its cap",
      generatePlanBodySchema,
      { goal: "x".repeat(500) },
      "goal: String must contain at most 120 character(s)"
    ],
    [
      "a number under its floor",
      signupBodySchema,
      signup({ profile: { ...profile, age: 5 } }),
      "profile.age: Number must be greater than or equal to 10"
    ],
    [
      "a number over its cap",
      workoutSessionBodySchema,
      { date: "2026-09-26", duration: 999 },
      "duration: Number must be less than or equal to 360"
    ],
    [
      "a list over its cap",
      savedExerciseBodySchema,
      { name: "Row", muscles: Array(11).fill("Lats") },
      "muscles: Array must contain at most 10 element(s)"
    ],
    [
      "a value outside an enum",
      signupBodySchema,
      signup({ profile: { ...profile, trainingDays: ["Funday"] } }),
      "profile.trainingDays.0: Invalid enum value. Expected 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday', received 'Funday'"
    ],
    [
      "an unknown key on a strict schema",
      progressMetricBodySchema,
      { date: "2026-09-26", mood: "great" },
      "request: Unrecognized key(s) in object: 'mood'"
    ],
    [
      "no branch of a union",
      savedExerciseBodySchema,
      { name: "Row", muscles: [{ nope: 1 }] },
      "muscles.0: Invalid input"
    ]
  ])("%s reads as it did before zod 4", (_label, schema, body, expected) => {
    expect(bodyError(schema, body)).toBe(expected);
  });
});

describe("query and params messages", () => {
  test.each([
    [
      "a non-numeric coordinate",
      coordinateQuerySchema,
      { latitude: "north", longitude: "0" },
      "query",
      "latitude: Expected number, received nan"
    ],
    [
      "a fractional id",
      wgerExerciseIdParamsSchema,
      { id: "1.5" },
      "params",
      "id: Expected integer, received float"
    ],
    [
      "a fractional page size",
      wgerExercisesQuerySchema,
      { limit: "2.5" },
      "query",
      "limit: Expected integer, received float"
    ],
    [
      "an empty list",
      wgerExercisesQuerySchema,
      { category: [] },
      "query",
      "category: Array must contain at least 1 element(s)"
    ],
    [
      "a query over its cap",
      mealDbSearchQuerySchema,
      { query: "x".repeat(101) },
      "query",
      "query: String must contain at most 100 character(s)"
    ]
  ])("%s reads as it did before zod 4", (_label, schema, input, path, expected) => {
    expect(validateSchemaInput(schema, input, path).error).toBe(expected);
  });

  // A message written into the schema outranks the per-parse wording, so the
  // one custom message these schemas carry must come through untouched.
  test("a schema's own message still wins", () => {
    expect(validateSchemaInput(mealDbSearchQuerySchema, { limit: "5" }, "query").error).toBe(
      "query: query or q is required"
    );
  });
});
