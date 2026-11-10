/**
 * The week's progression (roadmap B4): each lift's load for the week of the
 * newest plan, read from the server and answered there. Called by
 * DashboardPage, above its signed-out return.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getLocalDateKey } from "../../../app/units";

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
 */
export default function useProgression({ dashboard, notes, apiFetch }) {
  const [progression, setProgression] = useState(null);
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
        const data = await response.json();
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
    async ({ liftKey, decision }) => {
      if (!weekStart) return;
      const path = liftKey
        ? `${PROGRESSION_PATH}/${weekStart}/lifts/${encodeURIComponent(liftKey)}`
        : `${PROGRESSION_PATH}/${weekStart}/week`;
      const options = decision
        ? {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision })
          }
        : { method: "DELETE" };
      // The answer's week is newer than any read still in flight.
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      try {
        const response = await apiFetch(path, options);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || ANSWER_FAILED);
        if (requestRef.current !== requestId) return;
        setProgression(data.progression ?? null);
        setError("");
      } catch (err) {
        if (requestRef.current === requestId) setError(err?.message || ANSWER_FAILED);
      }
    },
    [apiFetch, weekStart]
  );

  return { progression: planId ? progression : null, error, answer };
}
