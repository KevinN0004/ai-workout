/**
 * The portal every modal in the app renders through, from the planner modal
 * in app/components to the dashboard's own.
 */
import { useRef } from "react";
import { createPortal } from "react-dom";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import useCloseOnEscape from "../hooks/useCloseOnEscape";
import useFocusTrap from "../hooks/useFocusTrap";

/**
 * Renders `children` into document.body while `open`, and nothing otherwise.
 * While open, the page behind stops scrolling, Escape calls `onClose`, and
 * keyboard focus stays inside the modal and returns to its opener on close.
 */
export default function ModalPortal({ open, onClose, children }) {
  const trapRef = useRef(null);
  useBodyScrollLock(open);
  // Every modal in the app is portalled through here, so handling Escape and
  // focus once covers all of them. Called before the early return: a hook
  // that ran only while open would change the hook count between renders.
  useCloseOnEscape(open, onClose);
  useFocusTrap(open, trapRef);

  if (!open || typeof document === "undefined" || !document.body) {
    return null;
  }

  // The wrapper only carries the trap's ref. display: contents keeps it out
  // of the layout, so each modal's fixed backdrop sizes against the viewport
  // as before.
  return createPortal(
    <div ref={trapRef} style={{ display: "contents" }}>
      {children}
    </div>,
    document.body
  );
}
