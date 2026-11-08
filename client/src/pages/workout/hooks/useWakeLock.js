/**
 * Keeps the screen awake while the session page is open (roadmap B6), where
 * the browser offers a Screen Wake Lock and allows it.
 */
import { useEffect } from "react";

const ignore = () => {};

/**
 * Asks for a screen wake lock on mount, and again whenever the page is shown,
 * since the browser lets the lock go when the page is hidden. Lets it go on
 * unmount. A browser without navigator.wakeLock, or one that refuses, changes
 * nothing.
 */
export default function useWakeLock() {
  // Holds the lock while mounted, asking again each time the page is shown.
  useEffect(() => {
    const wakeLock = navigator.wakeLock;
    if (!wakeLock) return undefined;
    let held = null;
    let closed = false;

    // Called inside then(), so a request that throws is a refusal too.
    const request = () =>
      Promise.resolve()
        .then(() => wakeLock.request("screen"))
        .then((sentinel) => {
          if (closed) sentinel.release().catch(ignore);
          else held = sentinel;
        }, ignore);
    const onVisibility = () => {
      if (document.visibilityState === "visible") request();
    };

    request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      held?.release().catch(ignore);
    };
  }, []);
}
