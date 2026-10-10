/**
 * Closes an overlay when Escape is pressed while it is open. Used by
 * ModalPortal, which every modal goes through, and by DashboardDrawer, a plain
 * overlay rendered in place.
 */
import { useEffect } from "react";

/**
 * Listens for Escape only while `active`, and calls `onClose` when it comes.
 *
 * Shared rather than written twice: the modals and the drawer need the same
 * behaviour, and two copies of a keyboard listener that must agree is exactly
 * the shape that drifts, so there is one. It is also what lets each backdrop's
 * onClick stay a mouse-only convenience instead of needing a key handler of its
 * own: without it, a keyboard user would have to find the Close button.
 */
export default function useCloseOnEscape(active, onClose) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [active, onClose]);
}
