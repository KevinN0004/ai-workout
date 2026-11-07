/**
 * Prisma-native persistence for the answers to a week's progression (roadmap
 * B4): one row per user, week and lift, or '' for the week's own answer. Reads
 * take one week's rows, and the full unique key lets a save upsert.
 */
import { dateOnlyToDate } from "./rowValues.js";
import { getUserPk } from "./userLookup.js";

/**
 * Builds the answer store over `prisma`. Returns `listWeekDecisions`, which the
 * progression read and each answer route call, and `saveDecision` and
 * `removeDecision`, which the PUT and DELETE routes call.
 */
export const createProgressionDecisionRepository = ({ prisma }) => {
  /** The week's answers as an object from lift key to decision; empty for an unknown user. */
  const listWeekDecisions = async ({ userId, weekStart }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return {};
    const rows = await prisma.progressionDecision.findMany({
      where: { userId: userPk, weekStart: dateOnlyToDate(weekStart) },
      select: { liftKey: true, decision: true }
    });
    return Object.fromEntries(rows.map((row) => [row.liftKey, row.decision]));
  };

  /** Stores the answer, replacing one already given; null when the user cannot be resolved. */
  const saveDecision = async ({ userId, weekStart, liftKey, decision }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return null;
    const week = dateOnlyToDate(weekStart);
    return prisma.progressionDecision.upsert({
      where: { userId_weekStart_liftKey: { userId: userPk, weekStart: week, liftKey } },
      create: { userId: userPk, weekStart: week, liftKey, decision },
      update: { decision }
    });
  };

  /** Takes the answer back. Returns how many rows went: 0 when there was none. */
  const removeDecision = async ({ userId, weekStart, liftKey }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return 0;
    const { count } = await prisma.progressionDecision.deleteMany({
      where: { userId: userPk, weekStart: dateOnlyToDate(weekStart), liftKey }
    });
    return count;
  };

  return { listWeekDecisions, saveDecision, removeDecision };
};
