import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "../../db/prisma.js";
import { buildPlanPayload } from "../../services/dashboard/planPayloadService.js";
import {
  createGeneratedPlanRepository,
  GENERATED_PLAN_LIMIT,
  mapGeneratedPlan
} from "../generatedPlanRepository.js";
import { createUserReadRepository } from "../userReadRepository.js";

// Pins the plan writes against real Postgres: the structure each plan is saved
// with, and the prune. Which plans the prune keeps is decided by the order the
// dashboard reads them in, so the tests compare against that read rather than
// restating the order.

const { saveGeneratedPlan, pruneGeneratedPlans, findPlanForUser, rewritePlan } =
  createGeneratedPlanRepository({ prisma });

// One of the real answers planPayloadService's tests are built on.
const realAnswer = readFileSync(
  new URL(
    "../../services/dashboard/__tests__/fixtures/plans/01-home-bodyweight-3d.txt",
    import.meta.url
  ),
  "utf8"
);
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

describe("the plan's structure", () => {
  const storedPayloadOf = async (userId) =>
    (await prisma.generatedPlan.findFirst({ where: { userId }, select: { planPayload: true } }))
      .planPayload;

  test("is stored with the plan and returned as its payload", async () => {
    const user = await createUser("payload-saved@example.com");
    const payload = buildPlanPayload(realAnswer);

    const saved = await saveGeneratedPlan({
      userId: user.id,
      entry: { plan: realAnswer, payload }
    });

    expect(saved.payload).toEqual(payload);
    expect(await storedPayloadOf(user.id)).toEqual(payload);
  });

  // `{}` is the one way a row says "no structure", as every older plan's does.
  test.each([
    ["no structure", {}],
    ["a malformed structure", { payload: { version: 2, days: [], notes: [] } }]
  ])("stores {} for an entry with %s, and returns null", async (_label, extra) => {
    const user = await createUser(`payload-none-${extra.payload ? "bad" : "absent"}@example.com`);

    const saved = await saveGeneratedPlan({ userId: user.id, entry: { plan: "x", ...extra } });

    expect(saved.payload).toBeNull();
    expect(await storedPayloadOf(user.id)).toEqual({});
  });

  test("reads a valid stored structure back, and anything else as null", () => {
    const payload = buildPlanPayload(realAnswer);

    expect(mapGeneratedPlan({ planPayload: payload }).payload).toEqual(payload);
    expect(mapGeneratedPlan({ planPayload: {} }).payload).toBeNull();
    expect(
      mapGeneratedPlan({ planPayload: { version: 1, days: "x", notes: [] } }).payload
    ).toBeNull();
  });
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

// Roadmap C4: a plan read for a swap, and rewritten under its row's lock.
describe("findPlanForUser and rewritePlan", () => {
  const payload = buildPlanPayload(realAnswer);
  const seedPlan = async (email, legacyId = null) => {
    const user = await createUser(email);
    const row = await prisma.generatedPlan.create({
      data: { userId: user.id, legacyId, planText: realAnswer, planPayload: payload }
    });
    return { user, row };
  };
  const textOf = async (id) =>
    (await prisma.generatedPlan.findUnique({ where: { id }, select: { planText: true } })).planText;

  test("finds the user's plan by its legacy id or its id, and no one else's", async () => {
    const { user, row } = await seedPlan("find-plan@example.com", "plan-legacy");
    const other = await createUser("find-plan-other@example.com");

    const byLegacy = await findPlanForUser({ userId: user.id, planId: "plan-legacy" });
    expect(byLegacy).toMatchObject({ id: "plan-legacy", plan: realAnswer, payload });
    expect(await findPlanForUser({ userId: user.id, planId: row.id })).toEqual(byLegacy);
    expect(await findPlanForUser({ userId: other.id, planId: "plan-legacy" })).toBeNull();
    expect(await findPlanForUser({ userId: crypto.randomUUID(), planId: row.id })).toBeNull();
  });

  test("writes what the rewrite returns, and returns the plan as written", async () => {
    const { user, row } = await seedPlan("rewrite-plan@example.com");
    const next = { ...payload, notes: ["A new note."] };

    const result = await rewritePlan({
      userId: user.id,
      planId: row.id,
      rewrite: (plan) => ({ payload: next, planText: `${plan.plan}\nchanged` })
    });

    expect(result.plan).toMatchObject({ id: row.id, payload: next });
    expect(await textOf(row.id)).toBe(`${realAnswer}\nchanged`);
  });

  test("changes nothing when the rewrite declines, and nothing for no such plan", async () => {
    const { user, row } = await seedPlan("rewrite-declined@example.com");
    const other = await createUser("rewrite-other@example.com");
    const rewrite = () => ({ payload, planText: "never" });

    expect(await rewritePlan({ userId: user.id, planId: row.id, rewrite: () => null })).toEqual({
      conflict: true
    });
    expect(await rewritePlan({ userId: other.id, planId: row.id, rewrite })).toBeNull();
    expect(await rewritePlan({ userId: crypto.randomUUID(), planId: row.id, rewrite })).toBeNull();
    expect(await textOf(row.id)).toBe(realAnswer);
  });

  // The race, staged: the first rewrite reads the plan and then waits inside its
  // transaction. The lock makes the second wait for the first to commit, so it
  // reads the first's text and both changes land. Without the lock the second
  // reads the old text, writes, and the first's write then drops it.
  test("a rewrite waits for one in flight, so neither is lost", async () => {
    const { user, row } = await seedPlan("rewrite-race@example.com");
    let release;
    const held = new Promise((resolve) => (release = resolve));
    let firstRead;
    const firstHasRead = new Promise((resolve) => (firstRead = resolve));
    const appending = (suffix, wait) => async (plan) => {
      if (wait) {
        firstRead();
        await held;
      }
      return { payload, planText: `${plan.plan}${suffix}` };
    };

    const first = rewritePlan({ userId: user.id, planId: row.id, rewrite: appending("+x", true) });
    await firstHasRead;
    const second = rewritePlan({ userId: user.id, planId: row.id, rewrite: appending("+y") });
    await Promise.race([second, new Promise((resolve) => setTimeout(resolve, 300))]);
    release();
    await Promise.all([first, second]);

    expect(await textOf(row.id)).toBe(`${realAnswer}+x+y`);
  });
});
