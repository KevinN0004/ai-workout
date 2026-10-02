/**
 * Stops the page scrolling behind an open modal, through the `no-scroll` class
 * on body (base.css). Used by ModalPortal.
 */
import { useEffect } from "react";

// Shared by every caller, so with two modals open the page stays locked until
// the last one closes.
let lockCount = 0;

const syncBodyScrollClass = () => {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("no-scroll", lockCount > 0);
};

/** Holds one lock on the page's scrolling for as long as `locked` is true. */
export default function useBodyScrollLock(locked) {
  // Runs when `locked` flips; the cleanup releases this caller's lock when it
  // unlocks or unmounts.
  useEffect(() => {
    if (!locked) return undefined;
    lockCount += 1;
    syncBodyScrollClass();

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      syncBodyScrollClass();
    };
  }, [locked]);
}
