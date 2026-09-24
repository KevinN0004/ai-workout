import { describe, expect, test } from "vitest";
import { z } from "zod";
import { getSchemaValidationMessage, validateSchemaInput } from "../requestValidationService.js";

describe("requestValidationService", () => {
  test("returns readable issue path/message from zod error", () => {
    const schema = z.object({
      profile: z.object({
        age: z.number().min(18)
      })
    });
    const result = schema.safeParse({
      profile: { age: 16 }
    });

    expect(result.success).toBe(false);
    const message = getSchemaValidationMessage(result.error);
    expect(message).toMatch(/profile\.age/i);
    expect(message).toMatch(/greater than or equal to 18/i);
  });

  test("validateSchemaInput returns parsed data on success", () => {
    const schema = z.object({
      email: z.string().email()
    });

    const parsed = validateSchemaInput(schema, { email: "dev@example.com" });
    expect(parsed.error).toBe("");
    expect(parsed.data).toEqual({ email: "dev@example.com" });
  });

  test("validateSchemaInput returns normalized error on failure", () => {
    const schema = z.object({
      limit: z.number().int().min(1).max(100)
    });

    const parsed = validateSchemaInput(schema, { limit: 1000 }, "query");
    expect(parsed.data).toBeNull();
    expect(parsed.error).toMatch(/^limit:/i);
  });
});
