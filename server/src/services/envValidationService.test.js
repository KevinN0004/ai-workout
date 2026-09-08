import { describe, expect, test } from "vitest";
import { validateEnv } from "./envValidationService.js";

const validEnv = { DATABASE_URL: "postgresql://user:pw@127.0.0.1:55432/ai_workout" };

describe("validateEnv", () => {
  test("accepts a minimal valid environment", () => {
    expect(validateEnv(validEnv)).toEqual([]);
  });

  test("requires a database connection string", () => {
    const errors = validateEnv({});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("DATABASE_URL");
  });

  test("accepts POSTGRES_URL as the alternative", () => {
    expect(validateEnv({ POSTGRES_URL: "postgresql://user:pw@127.0.0.1:5432/db" })).toEqual([]);
  });

  test("does not require CLIENT_ORIGIN outside production", () => {
    expect(validateEnv({ ...validEnv, NODE_ENV: "development" })).toEqual([]);
  });

  test("requires CLIENT_ORIGIN in production", () => {
    const errors = validateEnv({ ...validEnv, NODE_ENV: "production" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("CLIENT_ORIGIN");
  });

  test("accepts CLIENT_ORIGINS in production", () => {
    const env = { ...validEnv, NODE_ENV: "production", CLIENT_ORIGINS: "https://example.com" };
    expect(validateEnv(env)).toEqual([]);
  });

  test("rejects a non-numeric PORT", () => {
    const errors = validateEnv({ ...validEnv, PORT: "not-a-number" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("PORT must be a number");
  });

  test("rejects an out-of-range PORT", () => {
    const errors = validateEnv({ ...validEnv, PORT: "70000" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("PORT must be <= 65535");
  });

  test("ignores optional numeric settings that are unset or blank", () => {
    expect(
      validateEnv({ ...validEnv, ARGON2_TIME_COST: "", EXTERNAL_API_RETRIES: undefined })
    ).toEqual([]);
  });

  test("rejects a malformed upstream base URL", () => {
    const errors = validateEnv({ ...validEnv, WGER_BASE_URL: "not a url" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("WGER_BASE_URL");
  });

  test("rejects a Sentry sample rate outside 0..1", () => {
    const errors = validateEnv({ ...validEnv, SENTRY_TRACES_SAMPLE_RATE: "1.5" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("SENTRY_TRACES_SAMPLE_RATE");
  });

  test("reports every problem at once rather than stopping at the first", () => {
    const errors = validateEnv({ PORT: "abc", ARGON2_TIME_COST: "-1" });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  test("does not treat GEMINI_API_KEY as required", () => {
    expect(
      validateEnv({ ...validEnv, NODE_ENV: "production", CLIENT_ORIGIN: "https://x.com" })
    ).toEqual([]);
  });
});
