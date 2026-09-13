import { useEffect } from "react";

/**
 * Closes an overlay when Escape is pressed, while it is open.
 *
 * Shared rather than written twice. Every modal goes through ModalPortal, but
 * the dashboard drawer does not -- it is a plain overlay rendered in place --
 * and both need the same behaviour. Two copies of a keyboard listener that must
 * agree is exactly the shape that drifts, so there is one.
 *
 * Before this existed, no overlay in the app handled Escape at all: a mouse
 * user could dismiss one by clicking the backdrop, a keyboard user had to find
 * the Close button. It is also what lets each backdrop's onClick stay a
 * mouse-only convenience instead of needing a key handler of its own.
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
