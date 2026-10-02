/**
 * Prisma-native persistence for generated workout plans. It only inserts:
 * plans are read newest first by `createdAt`, and userReadRepository caps how
 * many it reads, so nothing prunes the table and it grows without bound.
 * That is a decision still to be made, not an oversight.
 */
import { toIso } from "./rowValues.js";
import { getUserPk } from "./userLookup.js";

const toJsonArray = (value) => (Array.isArray(value) ? value : []);

/**
 * Maps a generated_plans row to the plan the API returns. `id` is the legacy id
 * when the row has one, and the JSON list columns always read as arrays.
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
  plan: row.planText || ""
});

/**
 * Builds the plan writer over `prisma`. Returns `saveGeneratedPlan`, which the
 * generate route calls once it has a plan for a signed-in user.
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
        planPayload: {}
      }
    });

    return mapGeneratedPlan(row);
  };

  return { saveGeneratedPlan };
};
