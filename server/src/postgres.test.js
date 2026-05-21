import { describe, expect, test } from "vitest";
import { resolvePostgresConfig } from "./postgres.js";

describe("resolvePostgresConfig", () => {
  test("is disabled when no Postgres URL is configured", () => {
    const config = resolvePostgresConfig({});

    expect(config.configured).toBe(false);
    expect(config.databaseUrl).toBe("");
    expect(config.safeDatabaseUrl).toBe("");
    expect(config.ssl).toBe(false);
  });

  test("accepts DATABASE_URL and redacts credentials in status output", () => {
    const config = resolvePostgresConfig({
      DATABASE_URL: "postgres://fitness_user:secret@localhost:5432/ai_workout",
      POSTGRES_SSL: "true",
      POSTGRES_SSL_REJECT_UNAUTHORIZED: "false"
    });

    expect(config.configured).toBe(true);
    expect(config.databaseUrl).toBe("postgres://fitness_user:secret@localhost:5432/ai_workout");
    expect(config.safeDatabaseUrl).toBe("postgres://redacted:redacted@localhost:5432/ai_workout");
    expect(config.ssl).toBe(true);
    expect(config.sslRejectUnauthorized).toBe(false);
  });
});
