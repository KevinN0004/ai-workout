import "./SettingsView.css";

const displayValue = (value) => {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Not set";
  if (value === null || value === undefined) return "Not set";
  if (typeof value === "string") return value.trim() || "Not set";
  return String(value);
};

export default function SettingsView({ user, personal, onLogout }) {
  const profile = user?.profile || {};
  const fullName =
    personal?.name ||
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
    profile.name ||
    "";
  const trainingDays = Array.isArray(personal?.trainingDays) ? personal.trainingDays : [];

  const rows = [
    { label: "Email", value: user?.email || "Not set" },
    { label: "Name", value: fullName },
    { label: "Timeline", value: personal?.timeline },
    { label: "Experience", value: personal?.experience },
    { label: "Training days", value: trainingDays },
    { label: "Nutrition", value: personal?.nutrition },
    { label: "Cardio", value: personal?.cardio }
  ];

  return (
    <section className="panel settings-view">
      <div className="panel-header">
        <div>
          <h2>Settings</h2>
          <p className="muted">Manage your profile and account actions.</p>
        </div>
      </div>
      <div className="settings-layout">
        <section className="panel settings-card">
          <h3>Profile</h3>
          <div className="settings-list">
            {rows.map((row) => (
              <div className="settings-list-row" key={row.label}>
                <span className="muted">{row.label}</span>
                <strong className="settings-value">{displayValue(row.value)}</strong>
              </div>
            ))}
          </div>
        </section>
        <aside className="settings-side">
          <section className="panel settings-card">
            <h3>Account</h3>
            <p className="muted">You can sign out from this device at any time.</p>
            <button type="button" className="ghost" onClick={onLogout}>
              Log out
            </button>
          </section>
        </aside>
      </div>
    </section>
  );
}
