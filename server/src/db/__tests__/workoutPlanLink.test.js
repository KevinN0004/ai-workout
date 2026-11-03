import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "../prisma.js";

// Pins the link from a workout session to a day of a generated plan
// (server/db/postgres/004_workout_plan_day.sql) against the live schema, the
// way postgresUniqueIndexes.test.js pins the indexes Prisma cannot see.
//
// Deleting a plan must never delete a session, because the generate route
// prunes plans past each user's newest 200. And the reference's `set null`
// clears only generated_plan_id, so the link check has to allow an index left
// without a plan.

const EMAIL = "plan-link-schema@example.com";

const createUserAndPlan = async () => {
  const user = await prisma.appUser.create({ data: { email: EMAIL, passwordHash: "x" } });
  const plan = await prisma.generatedPlan.create({ data: { userId: user.id, planText: "Monday" } });
  return { user, plan };
};

// Raw SQL, so the test exercises the database's own rules rather than the
// Prisma model's.
const insertSession = (userId, planId, dayIndex) =>
  prisma.$executeRaw`
    insert into workout_sessions (user_id, generated_plan_id, plan_day_index)
    values (${userId}::uuid, ${planId}::uuid, ${dayIndex})
  `;

const linkOf = async (userId) =>
  (
    await prisma.$queryRaw`
      select generated_plan_id::text as plan_id, plan_day_index
      from workout_sessions
      where user_id = ${userId}::uuid
    `
  )[0];

const cleanUp = () => prisma.appUser.deleteMany({ where: { email: EMAIL } });

beforeEach(cleanUp);
afterAll(cleanUp);

describe("the plan-day link on workout_sessions", () => {
  test("has both columns, both checks, the reference and the index", async () => {
    const columns = await prisma.$queryRaw`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_name = 'workout_sessions'
        and column_name in ('generated_plan_id', 'plan_day_index')
      order by column_name
    `;
    expect(columns).toEqual([
      { column_name: "generated_plan_id", data_type: "uuid", is_nullable: "YES" },
      { column_name: "plan_day_index", data_type: "smallint", is_nullable: "YES" }
    ]);

    // confdeltype 'n' is ON DELETE SET NULL. Both are Postgres's one-byte
    // "char", which a raw Prisma query cannot read without a cast.
    const constraints = await prisma.$queryRaw`
      select conname, contype::text as contype, confdeltype::text as confdeltype
      from pg_constraint
      where conrelid = 'workout_sessions'::regclass
        and conname in (
          'workout_sessions_plan_day_index_check',
          'workout_sessions_plan_link_check',
          'workout_sessions_generated_plan_id_fkey'
        )
      order by conname
    `;
    expect(constraints).toEqual([
      { conname: "workout_sessions_generated_plan_id_fkey", contype: "f", confdeltype: "n" },
      { conname: "workout_sessions_plan_day_index_check", contype: "c", confdeltype: " " },
      { conname: "workout_sessions_plan_link_check", contype: "c", confdeltype: " " }
    ]);

    const indexes = await prisma.$queryRaw`
      select indexdef
      from pg_indexes
      where indexname = 'workout_sessions_plan_day_idx'
    `;
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toMatch(/\(generated_plan_id, plan_day_index\)/);
  });

  test("deleting a plan keeps its sessions and clears only the reference", async () => {
    const { user, plan } = await createUserAndPlan();
    await insertSession(user.id, plan.id, 2);

    await prisma.generatedPlan.delete({ where: { id: plan.id } });

    expect(await linkOf(user.id)).toEqual({ plan_id: null, plan_day_index: 2 });
  });

  test("stores a link to the first day, index 0", async () => {
    const { user, plan } = await createUserAndPlan();
    await insertSession(user.id, plan.id, 0);

    expect(await linkOf(user.id)).toEqual({ plan_id: plan.id, plan_day_index: 0 });
  });

  test("refuses a negative day index", async () => {
    const { user, plan } = await createUserAndPlan();

    await expect(insertSession(user.id, plan.id, -1)).rejects.toThrow(
      /workout_sessions_plan_day_index_check/
    );
  });

  test("refuses a plan without a day index", async () => {
    const { user, plan } = await createUserAndPlan();

    await expect(insertSession(user.id, plan.id, null)).rejects.toThrow(
      /workout_sessions_plan_link_check/
    );
  });

  test("keeps an off-plan session valid, with neither column set", async () => {
    const { user } = await createUserAndPlan();
    await insertSession(user.id, null, null);

    expect(await linkOf(user.id)).toEqual({ plan_id: null, plan_day_index: null });
  });
});
