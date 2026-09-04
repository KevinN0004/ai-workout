import { toIso } from "./rowValues.js";
import { getUserPk } from "./userLookup.js";

/**
 * Prisma-native persistence for generated workout plans.
 *
 * Task 5 of docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md.
 *
 * That plan called this the one task with a genuine design question, because
 * the route asks for `$push` with `$position: 0` and `$slice: 200` -- prepend
 * to a capped list -- and warned that choosing between "insert plus bounded
 * delete" and "insert plus ordered read" changes behaviour under concurrency.
 *
 * There is no such question. Both operators are inert. Probed against a live
 * database: 205 rows inserted, the user read returned 200 and the table kept
 * all 205; pushing another left 206 stored and still 200 returned, newest
 * first. So plans are always inserted, ordering comes from `createdAt desc`,
 * and the 200 limit is applied by the reader in prismaDataModels' loadUserRelated.
 *
 * This repository therefore only inserts. The table growing without bound is
 * pre-existing behaviour, not something introduced here -- worth a separate
 * decision if it ever matters.
 */

const toJsonArray = (value) => (Array.isArray(value) ? value : []);

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
  plan: row.planText || ""
});

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
        planPayload: {}
      }
    });

    return mapGeneratedPlan(row);
  };

  return { saveGeneratedPlan };
};
