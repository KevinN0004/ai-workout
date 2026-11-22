/**
 * The week's progression (roadmap B4): each lift's load for the week of the
 * newest plan, read from the server and answered there. Called by
 * DashboardPage, above its signed-out return.
 */
// @ts-check
import { useCallback, useEffect, useRef, useState } from "react";
import { liftDecisionBody, weekDecisionBody } from "../../../app/requestBodies";
import { getLocalDateKey } from "../../../app/units";

/**
 * @template T
 * @typedef {import("../../../app/network.js").Wire<T>} Wire
 */
/** @typedef {import("../../../../../server/src/routes/dashboard/registerProgressionRoutes.js").ProgressionResponse} ProgressionResponse */
/** @typedef {import("../../../../../server/src/routes/dashboard/registerProgressionRoutes.js").ProgressionAnsweredResponse} ProgressionAnsweredResponse */
/** @typedef {import("../../../../../server/src/services/http/errorResponseService.js").ErrorBody} ErrorBody */
/** @typedef {import("../../../app/requestBodies.js").LiftDecisionBody["decision"]} LiftDecision */

/**
 * An answer to the week: a lift's, with its `liftKey`, or the week's own
 * ("normal", the deload declined) without one. A null decision takes it back.
 * @typedef {{ liftKey?: string, decision: LiftDecision | import("../../../app/requestBodies.js").WeekDecisionBody["decision"] | null }} ProgressionAnswer
 */

const PROGRESSION_PATH = "/api/dashboard/progression";
const ANSWER_FAILED = "Could not save that answer. Try again.";

/**
 * Reads the week for `dashboard`'s newest plan with today's local date, and
 * reads it again whenever that plan or its lifts, the profile `notes` or the
 * saved workout sessions change, since each can move the week's targets. A session whose id
 * starts `optimistic-` is not saved yet and is left out. A stale answer is
 * dropped by request id, and a failed read leaves the week null. Returns
 * `progression`, null without a plan; `answer({ liftKey, decision })`, which
 * puts a lift's answer, or the week's when there is no `liftKey`, and takes it
 * back when `decision` is null; and `error`, why the last answer failed.
 * @param {{ dashboard: import("../../../app/dashboard.js").Dashboard | null, notes: unknown, apiFetch: import("../../../app/network.js").ApiFetch }} input
 */
export default function useProgression({ dashboard, notes, apiFetch }) {
  const [progression, setProgression] = useState(
    /** @type {Wire<ProgressionResponse>["progression"] | null} */ (null)
  );
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  const planId = dashboard?.plans?.[0]?.id ?? null;
  const savedIds = (Array.isArray(dashboard?.workoutSessions) ? dashboard.workoutSessions : [])
    .map((session) => String(session.id))
    .filter((id) => !id.startsWith("optimistic-"));
  // A swap (roadmap C4) keeps the plan's id and changes its lifts, which the
  // week is built from.
  const liftNames = (dashboard?.plans?.[0]?.payload?.days ?? []).flatMap((day) =>
    (day.prescriptions ?? []).map((prescription) => prescription.name)
  );
  const key = JSON.stringify([planId, notes ?? "", savedIds, liftNames]);

  // Reads the week whenever its key changes. The key is in the dependencies
  // because it, not anything read here, says when the week may have moved.
  useEffect(() => {
    if (!apiFetch || !planId) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const read = async () => {
      try {
        const response = await apiFetch(`${PROGRESSION_PATH}?today=${getLocalDateKey()}`);
        if (!response.ok) throw new Error(ANSWER_FAILED);
        const data = /** @type {Wire<ProgressionResponse>} */ (await response.json());
        if (requestRef.current !== requestId) return;
        setProgression(data.progression ?? null);
        setError("");
      } catch {
        if (requestRef.current === requestId) setProgression(null);
      }
    };
    read();
  }, [apiFetch, planId, key]);

  const weekStart = progression?.weekStart;
  const answer = useCallback(
    async (/** @type {ProgressionAnswer} */ { liftKey, decision }) => {
      if (!weekStart) return;
      const path = liftKey
        ? `${PROGRESSION_PATH}/${weekStart}/lifts/${encodeURIComponent(liftKey)}`
        : `${PROGRESSION_PATH}/${weekStart}/week`;
      const options = decision
        ? {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            // A lift's answer is accept, decline or undo, and the week's is normal.
            body: JSON.stringify(
              liftKey
                ? liftDecisionBody(/** @type {LiftDecision} */ (decision))
                : weekDecisionBody(/** @type {"normal"} */ (decision))
            )
          }
        : { method: "DELETE" };
      // The answer's week is newer than any read still in flight.
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      try {
        const response = await apiFetch(path, options);
        // One read for both outcomes: a refusal's ErrorBody or the answered
        // week, each of whose fields is optional.
        const data = /** @type {Wire<ProgressionAnsweredResponse> & ErrorBody} */ (
          await response.json().catch(() => ({}))
        );
        if (!response.ok) throw new Error(data?.error || ANSWER_FAILED);
        if (requestRef.current !== requestId) return;
        setProgression(data.progression ?? null);
        setError("");
      } catch (err) {
        if (requestRef.current === requestId)
          setError(/** @type {Error} */ (err)?.message || ANSWER_FAILED);
      }
    },
    [apiFetch, weekStart]
  );

  return { progression: planId ? progression : null, error, answer };
}
