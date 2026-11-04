/**
 * Keeps keyboard focus inside an open overlay: ModalPortal, so every modal,
 * and DashboardDrawer. Focus moves in when it opens, cannot Tab out, and goes
 * back to whatever opened it when it closes.
 */
import { useEffect } from "react";

// What Tab can reach. A control that is disabled, taken out of the tab order,
// inside something hidden, or hidden by CSS is skipped by the filter below.
// checkVisibility is the browser's word on CSS; where it is missing (jsdom)
// every control counts as visible.
const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  '[contenteditable="true"]',
  "[tabindex]"
].join(", ");

const focusablesIn = (container) =>
  [...container.querySelectorAll(FOCUSABLE)].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.closest("[hidden], [inert]") &&
      (typeof element.checkVisibility !== "function" || element.checkVisibility())
  );

// Moves focus to the container's first control, or its last when `fromEnd`.
// A control can refuse focus (one hidden by CSS does), so each is tried in
// turn until one takes it.
const focusEdge = (container, fromEnd) => {
  const candidates = focusablesIn(container);
  if (fromEnd) candidates.reverse();
  for (const element of candidates) {
    element.focus();
    if (document.activeElement === element) return;
  }
};

// The open traps, oldest first. Only the newest acts, so an overlay opened
// over another holds focus until it closes and hands it back.
const openTraps = [];

/**
 * While `active`, holds focus inside the element `containerRef` points at.
 *
 * Done by watching where focus lands rather than by marking the page behind
 * `inert`: inert would also take the dashboard's toast, a live region, out of
 * the accessibility tree, and a modal can raise one while it stays open.
 */
export default function useFocusTrap(active, containerRef) {
  // Runs when the overlay opens; the cleanup releases the trap and returns
  // focus to the opener when it closes or unmounts.
  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container || typeof document === "undefined") return undefined;

    const opener = document.activeElement;
    const trap = { container };
    openTraps.push(trap);
    let backwards = false;

    // Tab on the last control and Shift+Tab on the first wrap round here:
    // left to the browser, focus would leave the page for its toolbar when
    // the overlay is the last thing in the document.
    const wrapAtTheEdges = (event) => {
      backwards = event.key === "Tab" && event.shiftKey;
      if (event.key !== "Tab" || openTraps[openTraps.length - 1] !== trap) return;
      const controls = focusablesIn(container);
      const edge = backwards ? controls[0] : controls[controls.length - 1];
      const outside = !container.contains(document.activeElement);
      if (controls.length && (outside || document.activeElement === edge)) {
        event.preventDefault();
        focusEdge(container, backwards);
      }
    };
    const keepFocusInside = (event) => {
      if (openTraps[openTraps.length - 1] !== trap) return;
      if (container.contains(event.target)) return;
      focusEdge(container, backwards);
    };

    document.addEventListener("keydown", wrapAtTheEdges, true);
    document.addEventListener("focusin", keepFocusInside);
    if (!container.contains(document.activeElement)) focusEdge(container, false);

    return () => {
      document.removeEventListener("keydown", wrapAtTheEdges, true);
      document.removeEventListener("focusin", keepFocusInside);
      openTraps.splice(openTraps.indexOf(trap), 1);
      // An opener that has since left the page ignores focus(), in jsdom and
      // in browsers alike, so it needs no check of its own.
      opener?.focus?.();
    };
  }, [active, containerRef]);
}
