import { describe, expect, test } from "vitest";
import { validateDeployInputs } from "../manual-deploy.mjs";

// Importing the script must not migrate anything or POST a deploy hook -- the
// module guards its side effects behind a direct-invocation check. These tests
// passing at all is part of what proves that guard holds.

const NEON = "postgresql://user:pw@ep-cool-name-pooler.us-east-2.aws.neon.tech/neondb";
const VALID = {
  databaseUrl: `${NEON}?sslmode=verify-full`,
  hookUrl: "https://api.render.com/deploy/srv-abc123?key=xyz",
  serviceUrl: "https://ai-workout-example.onrender.com"
};

describe("validateDeployInputs", () => {
  test("accepts a pooled Neon URL with verify-full and reports no warnings", () => {
    const { errors, warnings, summary } = validateDeployInputs(VALID);

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(summary.databaseHost).toBe("ep-cool-name-pooler.us-east-2.aws.neon.tech");
    expect(summary.sslmode).toBe("verify-full");
  });

  test("names every missing variable at once rather than the first", () => {
    const { errors } = validateDeployInputs({});

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("PRODUCTION_DATABASE_URL");
    expect(errors[0]).toContain("RENDER_DEPLOY_HOOK_URL");
    expect(errors[0]).toContain("RENDER_SERVICE_URL");
  });

  test("rejects a localhost database, which is the dev one", () => {
    const { errors } = validateDeployInputs({
      ...VALID,
      databaseUrl: "postgresql://postgres:pw@127.0.0.1:55432/ai_workout"
    });

    expect(errors).toEqual([
      "PRODUCTION_DATABASE_URL points at localhost -- that is the dev database."
    ]);
  });

  test("rejects a non-postgres protocol", () => {
    const { errors } = validateDeployInputs({ ...VALID, databaseUrl: "https://example.com/db" });

    expect(errors.some((error) => error.includes("expected postgresql:"))).toBe(true);
  });

  test("warns rather than fails when sslmode is not verify-full", () => {
    const { errors, warnings } = validateDeployInputs({
      ...VALID,
      databaseUrl: `${NEON}?sslmode=require`
    });

    // A warning, not an error: pg treats require as an alias for verify-full
    // today, so this still connects. The runbook wants it spelled out so the
    // behaviour cannot drift on a major bump.
    expect(errors).toEqual([]);
    expect(warnings.some((warning) => warning.includes("verify-full"))).toBe(true);
  });

  test("warns when the host is not the pooled endpoint", () => {
    const { warnings } = validateDeployInputs({
      ...VALID,
      databaseUrl:
        "postgresql://user:pw@ep-cool-name.us-east-2.aws.neon.tech/neondb?sslmode=verify-full"
    });

    expect(warnings.some((warning) => warning.includes("-pooler"))).toBe(true);
  });

  test("warns about query params the pooled endpoint would reject", () => {
    const { warnings } = validateDeployInputs({
      ...VALID,
      databaseUrl: `${NEON}?sslmode=verify-full&options=-c%20timezone%3DUTC`
    });

    expect(warnings.some((warning) => warning.includes("options"))).toBe(true);
  });

  test("does not warn about channel_binding, which the driver handles", () => {
    // `neon connection-string --pooled` emits this by default. It is resolved by
    // the driver during SCRAM rather than sent on as a startup parameter, so
    // PgBouncer never sees it -- confirmed by connecting with pg 8.23. Warning
    // about the string Neon's own CLI produces would teach a reader to ignore
    // these warnings, which is worse than saying nothing.
    const { errors, warnings } = validateDeployInputs({
      ...VALID,
      databaseUrl: `${NEON}?sslmode=verify-full&channel_binding=require`
    });

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test("strips a trailing slash from the service URL", () => {
    // Left on, every polled URL would contain "//api/ready".
    const { serviceUrl } = validateDeployInputs({
      ...VALID,
      serviceUrl: "https://ai-workout-example.onrender.com/"
    });

    expect(serviceUrl).toBe("https://ai-workout-example.onrender.com");
  });

  test("does not leak the hook URL, only its length", () => {
    const { summary } = validateDeployInputs(VALID);

    expect(summary.hookLength).toBe(VALID.hookUrl.length);
    expect(JSON.stringify(summary)).not.toContain("xyz");
  });
});
