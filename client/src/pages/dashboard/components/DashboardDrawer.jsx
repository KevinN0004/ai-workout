/**
 * The dashboard's slide-in navigation drawer, opened from the header's menu
 * button. Rendered by DashboardPage; whether it is open is App's state.
 */
import useCloseOnEscape from "../../../hooks/useCloseOnEscape";

/**
 * Lists `items` as view links, apart from "settings", which always has its own
 * button in the footer. Closes on Escape, on a backdrop click and from its
 * close button; `onNavigate` receives the view key.
 */
export default function DashboardDrawer({ open, dashView, items, onClose, onNavigate }) {
  // The drawer is not portalled through ModalPortal, so it needs the same
  // Escape handling directly. Called before the early return to keep the hook
  // count stable across renders.
  useCloseOnEscape(open, onClose);

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()} role="navigation">
        <div className="drawer-header">
          <h3>Dashboard menu</h3>
          <button
            type="button"
            className="ghost icon-button"
            aria-label="Close dashboard menu"
            title="Close menu"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="drawer-links">
          {items
            .filter((item) => item.key !== "settings")
            .map((item) => (
              <button
                key={item.key}
                type="button"
                className={dashView === item.key ? "active" : ""}
                onClick={() => onNavigate(item.key)}
              >
                {item.label}
              </button>
            ))}
        </div>
        <div className="drawer-footer">
          <button
            type="button"
            className={dashView === "settings" ? "active" : ""}
            onClick={() => onNavigate("settings")}
          >
            Settings
          </button>
        </div>
      </aside>
    </div>
  );
}
