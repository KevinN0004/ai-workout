import { readFile } from "node:fs/promises";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "../prisma.js";

// Pins server/db/postgres/005_clear_default_target_weight.sql against the live
// schema. Sign-up stored a 160 lb target in every account, so a stored 160 says
// nothing about whether the user chose it. The migration clears it only where
// the goals are still exactly the sign-up defaults; any other goals mean the
// user saved something, and are left as they are.

const MIGRATION = "005_clear_default_target_weight.sql";
const EMAIL_SUFFIX = "@target-weight-migration.example.com";

const migrationSql = () =>
  readFile(new URL(`../../../db/postgres/${MIGRATION}`, import.meta.url), "utf8");

// Raw SQL, so the goals are stored as the text gives them, key order included.
const createUser = async (name, goalsJson) => {
  await prisma.$executeRaw`
    insert into app_users (email, password_hash, goals)
    values (${name + EMAIL_SUFFIX}, 'x', ${goalsJson}::jsonb)
  `;
};

const goalsOf = async (name) =>
  (await prisma.appUser.findFirst({ where: { email: name + EMAIL_SUFFIX } })).goals;

const cleanUp = () => prisma.appUser.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });

beforeEach(cleanUp);
afterAll(cleanUp);

describe("clearing the sign-up default target weight", () => {
  test("is applied", async () => {
    const rows = await prisma.$queryRaw`
      select filename from schema_migrations where filename = ${MIGRATION}
    `;
    expect(rows).toEqual([{ filename: MIGRATION }]);
  });

  test("clears the target from goals that are exactly the defaults, in any key order", async () => {
    await createUser(
      "defaults",
      '{"targetWeight": 160, "targetCalories": 2200, "weeklyWorkouts": 3}'
    );
    await createUser(
      "reordered",
      '{"weeklyWorkouts": 3, "targetWeight": 160, "targetCalories": 2200}'
    );

    await prisma.$executeRawUnsafe(await migrationSql());

    expect(await goalsOf("defaults")).toEqual({ targetCalories: 2200, weeklyWorkouts: 3 });
    expect(await goalsOf("reordered")).toEqual({ targetCalories: 2200, weeklyWorkouts: 3 });
  });

  test.each([
    ["a chosen target", '{"targetWeight": 165, "targetCalories": 2200, "weeklyWorkouts": 3}'],
    ["chosen calories", '{"targetWeight": 160, "targetCalories": 2300, "weeklyWorkouts": 3}'],
    ["a chosen weekly goal", '{"targetWeight": 160, "targetCalories": 2200, "weeklyWorkouts": 4}'],
    ["a target alone", '{"targetWeight": 160}'],
    [
      "the defaults and another key",
      '{"targetWeight": 160, "targetCalories": 2200, "weeklyWorkouts": 3, "protein": 150}'
    ],
    ["no goals", "{}"]
  ])("leaves goals holding %s untouched", async (_label, goalsJson) => {
    await createUser("other", goalsJson);

    await prisma.$executeRawUnsafe(await migrationSql());

    expect(await goalsOf("other")).toEqual(JSON.parse(goalsJson));
  });
});
