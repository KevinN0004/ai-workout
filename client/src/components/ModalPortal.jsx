import { createPortal } from "react-dom";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

export default function ModalPortal({ open, children }) {
  useBodyScrollLock(open);

  if (!open || typeof document === "undefined" || !document.body) {
    return null;
  }

  return createPortal(children, document.body);
}
