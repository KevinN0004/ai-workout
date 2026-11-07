/**
 * The short line beside a control that cannot work offline. Each owner
 * disables its own control; this says why, and only while offline.
 */
import useConnection from "../hooks/useConnection";

/**
 * "You're offline" while the connection store reads offline, and nothing
 * otherwise (docs/specs/2026-11-06-offline-ready-pwa-design.md).
 */
export default function OfflineHint() {
  return useConnection() === "offline" ? <span className="muted">You&apos;re offline</span> : null;
}
