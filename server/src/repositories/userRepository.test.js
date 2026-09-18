import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "../db/prisma.js";
import { createUserRepository } from "./userRepository.js";

const { deleteUser } = createUserRepository({ prisma });

const createUser = async (overrides = {}) =>
  prisma.appUser.create({
    data: {
      legacyUserId: overrides.legacyUserId ?? crypto.randomUUID(),
      email: overrides.email ?? `delete-${crypto.randomUUID().slice(0, 8)}@example.com`,
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$placeholder"
    }
  });

beforeEach(async () => {
  await prisma.appUser.deleteMany({});
});

afterAll(async () => {
  await prisma.appUser.deleteMany({});
});

describe("deleteUser", () => {
  // The whole delete-account feature rests on the six onDelete: Cascade
  // relations in schema.prisma actually being enforced by Postgres, not just
  // declared. The migration that created these tables is hand-written SQL
  // (server/db/postgres/001_foundation.sql), not generated from the schema, so
  // the two can disagree. This seeds real child rows across three different
  // relations and checks the tables directly after the delete, rather than
  // trusting the schema file.
  test("removes the user row and cascades to workout sessions, meal logs and progress metrics", async () => {
    const user = await createUser();

    await prisma.workoutSession.create({ data: { userId: user.id, focus: "Push" } });
    await prisma.mealLog.create({ data: { userId: user.id, name: "Oats" } });
    await prisma.progressMetric.create({ data: { userId: user.id, weightLb: 180 } });

    expect(await prisma.workoutSession.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.mealLog.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.progressMetric.count({ where: { userId: user.id } })).toBe(1);

    expect(await deleteUser({ userId: user.id })).toBe(true);

    expect(await prisma.appUser.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.workoutSession.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.mealLog.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.progressMetric.count({ where: { userId: user.id } })).toBe(0);
  });

  test("returns false for an id that matches no user", async () => {
    expect(await deleteUser({ userId: crypto.randomUUID() })).toBe(false);
    expect(await deleteUser({ userId: "no-such-legacy-id" })).toBe(false);
  });

  // Regression for the class of bug 19cc8ac fixed: callers may hold the
  // legacy string id rather than the UUID primary key, and userIdWhere must
  // resolve either. A UUID-shaped input takes the OR(legacyUserId, id) branch,
  // which the case above already exercises via the primary key side, so this
  // pins the other branch: a non-UUID legacy id that only matches
  // legacyUserId.
  test("deletes by legacy string id, not only the uuid primary key", async () => {
    const legacyUserId = `legacy-${crypto.randomUUID().slice(0, 8)}`;
    const user = await createUser({ legacyUserId });
    await prisma.workoutSession.create({ data: { userId: user.id, focus: "Legacy" } });

    expect(await deleteUser({ userId: legacyUserId })).toBe(true);

    expect(await prisma.appUser.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.workoutSession.count({ where: { userId: user.id } })).toBe(0);
  });
});
