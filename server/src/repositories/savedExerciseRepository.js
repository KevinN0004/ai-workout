import { toIso } from "./rowValues.js";
import { getUserPk } from "./userLookup.js";

/**
 * Prisma-native persistence for saved exercises.
 *
 * Task 4 of docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md.
 *
 * Unlike the workout and meal pipelines removed in Tasks 2 and 3, the pipeline
 * this replaces was genuinely live: the shim's extractFirstConcatEntry matched
 * that exact shape and routed it to an upsert. The deduplication below is
 * therefore behaviour to preserve, not dead intent.
 */

const toJsonArray = (value) => (Array.isArray(value) ? value : []);

export const mapSavedExercise = (row = {}) => ({
  id: row.legacyId || row.id,
  exerciseId: row.externalExerciseId ?? null,
  name: row.name || "",
  category: row.category || "",
  muscles: toJsonArray(row.muscles),
  equipment: toJsonArray(row.equipment),
  imageUrl: row.imageUrl || "",
  videoUrl: row.videoUrl || "",
  reason: row.reason || "",
  source: row.source || "wger",
  savedAt: toIso(row.savedAt)
});

export const createSavedExerciseRepository = ({ prisma }) => {
  /**
   * Saves an exercise, replacing any existing one the user already has for the
   * same external exercise id **or** the same name, compared case-insensitively.
   *
   * Both arms matter: the same movement can arrive with an id from the exercise
   * API or as free text, and the original pipeline treated either as a duplicate.
   *
   * Returns null when the user cannot be resolved.
   */
  const saveExercise = async ({ userId, entry = {} }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return null;

    const existing = await prisma.savedExercise.findFirst({
      where: {
        userId: userPk,
        OR: [
          ...(entry.exerciseId === null || entry.exerciseId === undefined
            ? []
            : [{ externalExerciseId: entry.exerciseId }]),
          { name: { equals: entry.name || "", mode: "insensitive" } }
        ]
      },
      select: { id: true }
    });

    const data = {
      userId: userPk,
      legacyId: entry.id || null,
      externalExerciseId: entry.exerciseId ?? null,
      name: entry.name || "",
      category: entry.category || "",
      muscles: toJsonArray(entry.muscles),
      equipment: toJsonArray(entry.equipment),
      imageUrl: entry.imageUrl || "",
      videoUrl: entry.videoUrl || "",
      reason: entry.reason || "",
      source: entry.source || "wger",
      savedAt: entry.savedAt ? new Date(entry.savedAt) : new Date()
    };

    const row = existing
      ? await prisma.savedExercise.update({ where: { id: existing.id }, data })
      : await prisma.savedExercise.create({ data });

    return mapSavedExercise(row);
  };

  /**
   * Removes one saved exercise belonging to this user. Scoped by user so an id
   * from another account cannot delete a row. Deleting an unknown id is a
   * no-op rather than an error, which is what the route has always reported.
   */
  const removeExercise = async ({ userId, entryId }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk || !entryId) return 0;

    const { count } = await prisma.savedExercise.deleteMany({
      where: { userId: userPk, legacyId: entryId }
    });
    return count;
  };

  return { saveExercise, removeExercise };
};
