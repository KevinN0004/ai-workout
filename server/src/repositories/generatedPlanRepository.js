/**
 * Prisma-native persistence for generated workout plans: the insert, the prune
 * that keeps each user's newest GENERATED_PLAN_LIMIT, which is every plan the
 * dashboard reads (userReadRepository.js), and a swap's read and locked rewrite.
 * A foreign key to a plan must be ON DELETE SET NULL, so a prune never blocks.
 */
import { toPlanPayload } from "../services/dashboard/planPayloadService.js";
import { toIso, toJsonArray } from "./rowValues.js";
import { getUserPk, legacyOrIdWhere } from "./userLookup.js";

/** How many plans each user keeps, and how many the dashboard reads. */
export const GENERATED_PLAN_LIMIT = 200;

/**
 * Newest first, with ties broken by id. The dashboard reads in this order and
 * the prune deletes past the limit in it, so the plans kept are the plans read.
 */
export const GENERATED_PLAN_ORDER = [{ createdAt: "desc" }, { id: "desc" }];

/**
 * Maps a generated_plans row to the plan the API returns. `id` is the legacy id
 * when the row has one, the JSON list columns always read as arrays, and
 * `payload` is the plan's stored structure, or null for a row that has none.
 */
export const mapGeneratedPlan = (row = {}) => ({
  id: row.legacyId || row.id,
  createdAt: toIso(row.createdAt),
  goal: row.goal || "",
  equipment: toJsonArray(row.equipment),
  duration: row.durationMinutes ?? null,
  level: row.level || "",
  injuries: row.injuries || "",
  days: row.days ?? null,
  environment: row.environment || "",
  focuses: toJsonArray(row.focuses),
  plan: row.planText || "",
  payload: toPlanPayload(row.planPayload)
});

/**
 * Builds the plan writer over `prisma`. Returns `saveGeneratedPlan`, which the
 * generate route calls once it has a plan for a signed-in user, and
 * `pruneGeneratedPlans`, which it calls straight after; and `findPlanForUser`
 * and `rewritePlan`, which the plan swap routes call (roadmap C4).
 */
export const createGeneratedPlanRepository = ({ prisma }) => {
  /** Returns null when the user cannot be resolved, matching the other repositories. */
  const saveGeneratedPlan = async ({ userId, entry = {} }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return null;

    const row = await prisma.generatedPlan.create({
      data: {
        userId: userPk,
        legacyId: entry.id || null,
        goal: entry.goal || "",
        equipment: toJsonArray(entry.equipment),
        durationMinutes: entry.duration ?? null,
        level: entry.level || "",
        injuries: entry.injuries || "",
        days: entry.days ?? null,
        environment: entry.environment || "",
        focuses: toJsonArray(entry.focuses),
        planText: entry.plan || "",
        // `{}` is how a row says it has no structure, as every older plan's does.
        planPayload: toPlanPayload(entry.payload) ?? {}
      }
    });

    return mapGeneratedPlan(row);
  };

  /**
   * Deletes the user's plans past the newest GENERATED_PLAN_LIMIT, which no
   * route can read, and returns how many went. 0 when the user cannot be
   * resolved. It needs no lock: the route prunes after its own insert has
   * committed, so whichever prune runs last sees every plan saved before it.
   */
  const pruneGeneratedPlans = async ({ userId }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return 0;

    const unread = await prisma.generatedPlan.findMany({
      where: { userId: userPk },
      orderBy: GENERATED_PLAN_ORDER,
      skip: GENERATED_PLAN_LIMIT,
      select: { id: true }
    });
    if (unread.length === 0) return 0;

    // The ids came from this user's plans alone, so they scope the delete.
    const { count } = await prisma.generatedPlan.deleteMany({
      where: { id: { in: unread.map((row) => row.id) } }
    });
    return count;
  };

  // The where for the user's plan the client knows as `planId` (legacyId || id).
  const planWhere = (userPk, planId) => ({
    userId: userPk,
    ...legacyOrIdWhere(planId, "legacyId")
  });

  /**
   * The user's plan the client knows as `planId` (`legacyId || id`), mapped, or
   * null when the user or that plan of theirs cannot be found (roadmap C4).
   */
  const findPlanForUser = async ({ userId, planId }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return null;
    const row = await prisma.generatedPlan.findFirst({ where: planWhere(userPk, planId) });
    return row ? mapGeneratedPlan(row) : null;
  };

  /**
   * Rewrites the user's plan `planId` with what `rewrite(plan)` returns, given
   * the plan mapped: `{ payload, planText }`, or null to change nothing. It runs
   * in one transaction that locks the plan's row before reading it, so two
   * rewrites at once take turns and the second reads the first's plan; neither
   * is lost. Only that one row is locked. Returns `{ plan }` as written,
   * `{ conflict: true }` when `rewrite` declined, or null for no such plan.
   */
  const rewritePlan = async ({ userId, planId, rewrite }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return null;
    return prisma.$transaction(async (tx) => {
      const found = await tx.generatedPlan.findFirst({
        where: planWhere(userPk, planId),
        select: { id: true }
      });
      if (!found) return null;
      await tx.$queryRaw`select id from generated_plans where id = ${found.id}::uuid for update`;
      const row = await tx.generatedPlan.findUnique({ where: { id: found.id } });
      const next = await rewrite(mapGeneratedPlan(row));
      if (!next) return { conflict: true };
      const updated = await tx.generatedPlan.update({
        where: { id: found.id },
        data: { planPayload: next.payload, planText: next.planText }
      });
      return { plan: mapGeneratedPlan(updated) };
    });
  };

  return { saveGeneratedPlan, pruneGeneratedPlans, findPlanForUser, rewritePlan };
};
