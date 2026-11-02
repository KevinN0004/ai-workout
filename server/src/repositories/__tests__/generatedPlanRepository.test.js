import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "../../db/prisma.js";
import { createGeneratedPlanRepository, GENERATED_PLAN_LIMIT } from "../generatedPlanRepository.js";
import { createUserReadRepository } from "../userReadRepository.js";

// Pins the plan prune against real Postgres. Which plans it keeps is decided by
// the order the dashboard reads them in, so the tests compare against that
// read rather than restating the order.

const { pruneGeneratedPlans } = createGeneratedPlanRepository({ prisma });
const { findUserWithDashboard } = createUserReadRepository({ prisma });

const createUser = (email, legacyUserId) =>
  prisma.appUser.create({ data: { email, passwordHash: "x", legacyUserId } });

// One plan a second, oldest first, so creation order is the read order reversed.
const seedPlans = (userId, count, prefix, { sameTime = false } = {}) =>
  prisma.generatedPlan.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      userId,
      legacyId: `${prefix}-${index}`,
      planText: `plan ${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, sameTime ? 0 : index))
    }))
  });

const plansOf = async (userId) =>
  (await prisma.generatedPlan.findMany({ where: { userId }, select: { legacyId: true } }))
    .map((row) => row.legacyId)
    .sort();

// The plans the dashboard reads for this user, through the real read.
const readSetOf = async (userId) =>
  (await findUserWithDashboard(userId)).dashboard.plans.map((plan) => plan.id).sort();

beforeEach(async () => {
  await prisma.appUser.deleteMany({});
});

afterAll(async () => {
  await prisma.appUser.deleteMany({});
});

describe("pruneGeneratedPlans", () => {
  test("deletes the plans past the newest ones the dashboard reads", async () => {
    const user = await createUser("prune-one@example.com");
    await seedPlans(user.id, GENERATED_PLAN_LIMIT + 1, "p");

    expect(await pruneGeneratedPlans({ userId: user.id })).toBe(1);

    const kept = await plansOf(user.id);
    expect(kept).toHaveLength(GENERATED_PLAN_LIMIT);
    expect(kept).not.toContain("p-0");
    expect(kept).toContain(`p-${GENERATED_PLAN_LIMIT}`);
  });

  // Rows saved in the same instant are told apart by id, in the read and in
  // the prune alike, so the prune never deletes a plan the dashboard shows.
  test("keeps exactly the plans the read returns when their times tie", async () => {
    const user = await createUser("prune-tie@example.com");
    await seedPlans(user.id, GENERATED_PLAN_LIMIT + 3, "t", { sameTime: true });
    const readBefore = await readSetOf(user.id);

    expect(await pruneGeneratedPlans({ userId: user.id })).toBe(3);

    expect(await plansOf(user.id)).toEqual(readBefore);
  });

  test("leaves every other user's plans alone", async () => {
    const owner = await createUser("prune-owner@example.com");
    const other = await createUser("prune-other@example.com");
    await seedPlans(owner.id, GENERATED_PLAN_LIMIT + 1, "own");
    await seedPlans(other.id, GENERATED_PLAN_LIMIT + 1, "other");

    await pruneGeneratedPlans({ userId: owner.id });

    // Counted across both accounts, the owner would keep about half its plans.
    expect(await plansOf(owner.id)).toHaveLength(GENERATED_PLAN_LIMIT);
    expect(await plansOf(other.id)).toHaveLength(GENERATED_PLAN_LIMIT + 1);
  });

  test("deletes nothing at or under the limit", async () => {
    const user = await createUser("prune-few@example.com");
    await seedPlans(user.id, 5, "few");

    expect(await pruneGeneratedPlans({ userId: user.id })).toBe(0);
    expect(await plansOf(user.id)).toHaveLength(5);
  });

  // A session can hold the legacy id instead of the UUID (commit 19cc8ac).
  test("resolves a legacy id, and does nothing for an unknown user", async () => {
    const user = await createUser("prune-legacy@example.com", "legacy-prune");
    await seedPlans(user.id, GENERATED_PLAN_LIMIT + 1, "lg");

    expect(await pruneGeneratedPlans({ userId: "legacy-prune" })).toBe(1);
    expect(await pruneGeneratedPlans({ userId: crypto.randomUUID() })).toBe(0);
  });
});
