import { createPortal } from "react-dom";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import useCloseOnEscape from "../hooks/useCloseOnEscape";

export default function ModalPortal({ open, onClose, children }) {
  useBodyScrollLock(open);
  // Every modal in the app is portalled through here, so handling Escape once
  // covers all of them. Called before the early return: a hook that ran only
  // while open would change the hook count between renders.
  useCloseOnEscape(open, onClose);

  if (!open || typeof document === "undefined" || !document.body) {
    return null;
  }

  return createPortal(children, document.body);
}
