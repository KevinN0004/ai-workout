/**
 * The dashboard's bottom navigation bar: shortcuts to five views, which
 * responsive.css shows only on narrow screens. Rendered by DashboardPage.
 */
const MOBILE_NAV_ITEMS = [
  { key: "summary", label: "Home" },
  { key: "workouts", label: "Logs" },
  { key: "calories", label: "Goal" },
  { key: "plans", label: "Plans" },
  { key: "meal", label: "Meal" }
];

/**
 * One button per MOBILE_NAV_ITEMS entry, the one matching `dashView` marked
 * active. `onNavigate` receives the view key.
 */
export default function DashboardBottomNav({ dashView, onNavigate }) {
  return (
    <nav className="dashboard-bottom-nav" aria-label="Dashboard quick navigation">
      {MOBILE_NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={dashView === item.key ? "active" : ""}
          onClick={() => onNavigate(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
