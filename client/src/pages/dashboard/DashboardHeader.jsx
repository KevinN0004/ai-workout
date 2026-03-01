export default function DashboardHeader({
  user,
  go,
  onOpenMenu,
  onNavigateSummary,
  profileMenuRef,
  profileMenuOpen,
  onToggleProfileMenu,
  onOpenSettings,
  onLogout
}) {
  if (!user) {
    return (
      <header className="title">
        <div className="header-top">
          <div className="header-left" />
          <div className="header-center">
            <h1>
              <button
                type="button"
                className="dashboard-title-button"
                onClick={onNavigateSummary}
                aria-label="Go to dashboard summary"
                title="Go to summary"
              >
                Dashboard
              </button>
            </h1>
          </div>
          <div className="auth-actions">
            <button type="button" className="ghost" onClick={() => go("/auth")}>
              Login / Sign up
            </button>
          </div>
        </div>
        <p className="muted">Please sign in to access your dashboard.</p>
      </header>
    );
  }

  return (
    <header className="title">
      <div className="header-top">
        <div className="header-left">
          <div className="nav-trigger">
            <button
              type="button"
              className="ghost icon-button"
              onClick={onOpenMenu}
              aria-label="Open dashboard menu"
              title="Open menu"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className="header-center">
          <h1>
            <button
              type="button"
              className="dashboard-title-button"
              onClick={onNavigateSummary}
              aria-label="Go to dashboard summary"
              title="Go to summary"
            >
              Dashboard
            </button>
          </h1>
        </div>
        <div className="auth-actions">
          <div className="profile-menu" ref={profileMenuRef}>
            <button
              type="button"
              className="ghost icon-button profile-icon-button"
              onClick={onToggleProfileMenu}
              aria-label="Open profile menu"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              aria-controls="profile-menu-dropdown"
              title={user.email}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <circle
                  cx="12"
                  cy="8"
                  r="4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M5 20c0-3.1 2.8-5 7-5s7 1.9 7 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {profileMenuOpen && (
              <div id="profile-menu-dropdown" className="profile-menu-dropdown" role="menu">
                <button
                  type="button"
                  className="profile-menu-item"
                  role="menuitem"
                  onClick={onOpenSettings}
                >
                  View profile
                </button>
                <button
                  type="button"
                  className="profile-menu-item"
                  role="menuitem"
                  onClick={onLogout}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

