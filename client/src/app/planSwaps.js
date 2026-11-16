/**
 * The plan swap requests (roadmap C4, docs/specs/2026-11-08-exercise-swaps-design.md):
 * an exercise's alternatives in a saved plan, the swap and the undo, over App's
 * apiFetch. Each returns what the server answers, or throws its message.
 */
// @ts-check
import { planSwapBody, planUndoBody } from "./requestBodies";

const OPTIONS_FAILED = "Could not load the alternatives. Try again.";
const SWAP_FAILED = "Could not swap that exercise. Try again.";
const UNDO_FAILED = "Could not undo that swap. Try again.";

/** @param {string} planId */
const pathOf = (planId) => `/api/dashboard/plans/${encodeURIComponent(planId)}/swaps`;

/** @param {Record<string, unknown>} body */
const postOf = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

/** @typedef {import("./network.js").ApiFetch} ApiFetch */

/**
 * The parsed answer, or an Error with the server's message, or `fallback` when
 * the refusal says nothing it can read. The answer is not typed yet (D1 phase 3
 * spec, decision 2).
 * @param {ApiFetch} apiFetch
 * @param {string} path
 * @param {RequestInit | undefined} options
 * @param {string} fallback
 */
const send = async (apiFetch, path, options, fallback) => {
  const response = await apiFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || fallback);
  return data;
};

/**
 * The alternatives to `exercise` in the plan `planId`, under the plan's rules
 * and `area` when one is named: `{ exercise, area, areas, alternatives }`.
 * @param {ApiFetch} apiFetch
 * @param {string} planId
 * @param {string} exercise
 * @param {string | null | undefined} [area]
 */
export const fetchSwapOptions = (apiFetch, planId, exercise, area) => {
  const query = new URLSearchParams({ exercise, ...(area ? { area } : {}) });
  return send(apiFetch, `${pathOf(planId)}?${query}`, undefined, OPTIONS_FAILED);
};

/**
 * Swaps `from` for `to` in the plan `planId`, and returns the plan as swapped.
 * @param {ApiFetch} apiFetch
 * @param {string} planId
 * @param {Parameters<typeof planSwapBody>[0]} swap
 */
export const swapExercise = async (apiFetch, planId, { from, to, area }) =>
  (await send(apiFetch, pathOf(planId), postOf(planSwapBody({ from, to, area })), SWAP_FAILED))
    .plan;

/**
 * Takes back the swap that put `name` in the plan `planId`, and returns the plan.
 * @param {ApiFetch} apiFetch
 * @param {string} planId
 * @param {string} name
 */
export const undoExerciseSwap = async (apiFetch, planId, name) =>
  (await send(apiFetch, `${pathOf(planId)}/undo`, postOf(planUndoBody(name)), UNDO_FAILED)).plan;
