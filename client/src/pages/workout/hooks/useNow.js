/**
 * The current time for the session page's clocks (roadmap B6), read again
 * every second and whenever the page is shown or hidden.
 */
import { useEffect, useState } from "react";

const SECOND_MS = 1000;

/**
 * Date.now(), read again every second and on each visibilitychange, so a clock
 * built on it catches up at once after a locked phone or a background tab,
 * whose timers the browser slows or stops. A new `since` reads it at once, so a
 * clock restarted between ticks starts from the true time.
 */
export default function useNow(since) {
  const [now, setNow] = useState(() => Date.now());

  // Reads the clock now, each second, and when the page's visibility changes.
  useEffect(() => {
    const read = () => setNow(Date.now());
    read();
    const timer = setInterval(read, SECOND_MS);
    document.addEventListener("visibilitychange", read);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, [since]);

  return now;
}
