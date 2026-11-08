/**
 * The running rest on the session page (roadmap B6): the seconds left, from the
 * rest's end time and the clock, and one call to onEnd when it ends in time.
 */
import { useEffect, useEffectEvent, useRef } from "react";
import useNow from "./useNow";

// An end seen later than this, as after a locked phone, alerts nothing.
const LATE_MS = 5000;

/**
 * `{ remaining, over }` for the rest that ends at `restEndsAt` (ms since the
 * epoch): the whole seconds left, rounded up, and whether it has ended. Once
 * per rest, `onEnd` runs when the end is seen within 5 seconds of it, so a
 * phone unlocked minutes later shows the rest over without a late buzz or beep.
 */
export default function useRestTimer(restEndsAt, onEnd) {
  const now = useNow(restEndsAt);
  const over = now >= restEndsAt;
  const endedFor = useRef(null);
  const end = useEffectEvent(onEnd);

  // Runs onEnd on the first render that sees this rest over, if it is not late.
  useEffect(() => {
    if (!over || endedFor.current === restEndsAt) return;
    endedFor.current = restEndsAt;
    if (now - restEndsAt <= LATE_MS) end();
  }, [over, now, restEndsAt]);

  return { remaining: over ? 0 : Math.ceil((restEndsAt - now) / 1000), over };
}
