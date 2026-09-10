import { describe, expect, test } from "vitest";
import { prisma } from "./prisma.js";

/**
 * Pins the unique indexes that `schema.prisma` cannot express.
 *
 * Uniqueness on these tables comes from *partial* indexes
 * (`where legacy_id is not null`) and *expression* indexes (`lower(email)`,
 * `lower(name)`). Prisma's schema language can represent neither, so its model
 * of the database is genuinely incomplete -- and `prisma db push` reconciles the
 * database to that model, which means it drops every one of them. The result is
 * silent: no error, just duplicate rows becoming possible on tables the
 * repositories assume are unique.
 *
 * A grep of the migration SQL would not catch this, because `db push` never
 * touches the SQL file -- it changes the database. So this asserts against the
 * live schema instead, which also makes it a check that the migration really
 * creates what it claims to.
 *
 * If this fails, do not "fix" it by adding @@unique to schema.prisma. Prisma
 * cannot express these; re-run the migrations instead, and find out who ran
 * `db push`.
 */

// The primary keys and `app_users_legacy_user_id_key` are deliberately absent:
// Prisma declares those itself, so they survive a push.
const INDEXES_PRISMA_CANNOT_SEE = [
  "app_users_email_lower_idx",
  "calorie_entries_user_legacy_idx",
  "generated_plans_user_legacy_idx",
  "meal_logs_user_legacy_idx",
  "progress_metrics_user_legacy_idx",
  "saved_exercises_user_external_idx",
  "saved_exercises_user_name_lower_idx",
  "workout_sessions_user_legacy_idx"
];

describe("unique indexes Prisma cannot express", () => {
  test("every one of them exists in the live database", async () => {
    const rows = await prisma.$queryRaw`
      select indexname
      from pg_indexes
      where schemaname = 'public'
    `;
    const present = new Set(rows.map((row) => row.indexname));

    // Guard against a vacuous pass on an empty or unmigrated database.
    expect(present.size).toBeGreaterThan(INDEXES_PRISMA_CANNOT_SEE.length);

    const missing = INDEXES_PRISMA_CANNOT_SEE.filter((name) => !present.has(name));
    expect(missing).toEqual([]);
  });

  test("each is still genuinely partial or expression-based", async () => {
    // If one of these ever became a plain unique index, Prisma *could* express
    // it -- and it should then move into schema.prisma rather than staying
    // here. This is what tells us that happened.
    const rows = await prisma.$queryRaw`
      select indexname, indexdef
      from pg_indexes
      where schemaname = 'public'
    `;
    const byName = new Map(rows.map((row) => [row.indexname, row.indexdef]));

    const plain = INDEXES_PRISMA_CANNOT_SEE.filter((name) => {
      const definition = byName.get(name) ?? "";
      const isPartial = / where /i.test(definition);
      const isExpression = /lower\(/i.test(definition);
      return !isPartial && !isExpression;
    });

    expect(plain).toEqual([]);
  });
});
