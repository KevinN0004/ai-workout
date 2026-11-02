/**
 * Prisma-native persistence for generated workout plans: the insert, and the
 * prune that keeps each user's newest GENERATED_PLAN_LIMIT, which is every plan
 * the dashboard reads (userReadRepository.js). A foreign key to a plan must be
 * ON DELETE SET NULL, so a prune never deletes or blocks the row that holds it.
 */
import { toPlanPayload } from "../services/dashboard/planPayloadService.js";
import { toIso, toJsonArray } from "./rowValues.js";
import { getUserPk } from "./userLookup.js";

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
 * `pruneGeneratedPlans`, which it calls straight after.
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

  return { saveGeneratedPlan, pruneGeneratedPlans };
};
