/**
 * Totals a plan-quality eval run, and the gate that compares it with the
 * committed reference: no structure break or failed call, and no count of hits
 * past the reference by more than its margin.
 */

// The break scorePlan gives a call that failed twice.
const FAILED_CALL = "failed";

// How far a count may rise past the reference's: the larger of 3 hits and a
// quarter of the reference, so small counts are not failed on noise.
const MIN_MARGIN = 3;
const MARGIN_SHARE = 0.25;

const emptyCounts = () => ({
  plans: 0,
  structureBreaks: 0,
  failedCalls: 0,
  injuryHits: 0,
  equipmentHits: 0
});

// One scored plan added into `counts`. A failed call is counted apart from the
// structure breaks: it says nothing about the plan.
const addPlan = (counts, { structure, injuryHits, equipmentHits }) => {
  counts.plans += 1;
  counts.failedCalls += structure.filter((name) => name === FAILED_CALL).length;
  counts.structureBreaks += structure.filter((name) => name !== FAILED_CALL).length;
  counts.injuryHits += injuryHits.length;
  counts.equipmentHits += equipmentHits.length;
};

/**
 * A run's counts, per profile and in total: plans, structure breaks, failed
 * calls, injury hits and equipment hits. `scores` are scorePlan results, each
 * with its `profile` name.
 */
export const summarize = (scores) => {
  const profiles = {};
  const totals = emptyCounts();
  for (const score of scores) {
    profiles[score.profile] ??= emptyCounts();
    addPlan(profiles[score.profile], score);
    addPlan(totals, score);
  }
  return { profiles, totals };
};

const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * Whether a run passes, and why not: it fails on any structure break or failed
 * call, and on injury or equipment hits that rise past the reference's by more
 * than the larger of 3 and 25% of the reference. With no reference (null), only
 * the first rule applies. Both arguments are summarize results.
 */
export const compare = (run, reference) => {
  const reasons = [];
  if (run.totals.structureBreaks) {
    reasons.push(plural(run.totals.structureBreaks, "structure break"));
  }
  if (run.totals.failedCalls) reasons.push(plural(run.totals.failedCalls, "failed call"));

  if (reference) {
    for (const [key, label] of [
      ["injuryHits", "injury hits"],
      ["equipmentHits", "equipment hits"]
    ]) {
      const before = reference.totals[key];
      const after = run.totals[key];
      const margin = Math.max(MIN_MARGIN, before * MARGIN_SHARE);
      if (after - before > margin) {
        reasons.push(`${label} rose from ${before} to ${after}, past the margin of ${margin}`);
      }
    }
  }

  return { pass: reasons.length === 0, reasons };
};
