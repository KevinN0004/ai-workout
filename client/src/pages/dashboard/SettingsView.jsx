import "./SettingsView.css";

export default function SettingsView({ user, onLogout }) {
  return (
    <section className="panel dashboard-card span-2">
      <div className="panel-header">
        <div>
          <h2>Settings</h2>
          <p className="muted">Manage your profile and account actions.</p>
        </div>
      </div>
      <div className="dashboard-split">
        <section className="panel dashboard-card">
          <h3>Profile</h3>
          <div className="list">
            <div className="list-row">
              <span className="muted">Email</span>
              <strong>{user?.email}</strong>
            </div>
          </div>
        </section>
        <aside className="dashboard-side">
          <section className="panel dashboard-card">
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
