const MOBILE_NAV_ITEMS = [
  { key: "summary", label: "Home" },
  { key: "workouts", label: "Logs" },
  { key: "calories", label: "Goal" },
  { key: "plans", label: "Plans" },
  { key: "meal", label: "Meal" }
];

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

