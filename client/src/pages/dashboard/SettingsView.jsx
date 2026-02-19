import "./SettingsView.css";

export default function SettingsView({ user, onLogout }) {
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
            <div className="settings-list-row">
              <span className="muted">Email</span>
              <strong>{user?.email}</strong>
            </div>
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
