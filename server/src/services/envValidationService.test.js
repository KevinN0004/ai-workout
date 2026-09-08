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

  test("rejects an ARGON2_MEMORY_COST below argon2's own floor", () => {
    // argon2.hash throws below 1024 regardless of what toPositiveInt would
    // tolerate -- a floor here that admits 8 is worse than no floor at all.
    const errors = validateEnv({ ...validEnv, ARGON2_MEMORY_COST: "8" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("ARGON2_MEMORY_COST must be >= 1024");
  });

  test("rejects an ARGON2_TIME_COST below argon2's own floor", () => {
    const errors = validateEnv({ ...validEnv, ARGON2_TIME_COST: "1" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("ARGON2_TIME_COST must be >= 2");
  });

  test("accepts argon2 settings sitting exactly at the library's floors", () => {
    expect(validateEnv({ ...validEnv, ARGON2_TIME_COST: "2", ARGON2_MEMORY_COST: "1024" })).toEqual(
      []
    );
  });

  test("rejects a REDIS_PORT outside the valid TCP port range", () => {
    const errors = validateEnv({ ...validEnv, REDIS_PORT: "70000" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("REDIS_PORT must be <= 65535");
  });

  test("rejects a WGER_DEFAULT_LANGUAGE above the reader's 1..100 range", () => {
    // toNullableNumber(value, 1, 100) silently drops anything outside this
    // range and falls back to its default -- an unbounded validator would
    // tell the operator their setting took effect when it did not.
    const errors = validateEnv({ ...validEnv, WGER_DEFAULT_LANGUAGE: "500" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("WGER_DEFAULT_LANGUAGE must be <= 100");
  });

  test("treats a whitespace-only value as blank, not as a value that satisfies a required var", () => {
    // Pins isBlank's `.trim()` behaviour: a plain falsy check (`!value`)
    // would treat "   " as truthy and let it slip past the DATABASE_URL check.
    const errors = validateEnv({ DATABASE_URL: "   " });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("DATABASE_URL");
  });
});
