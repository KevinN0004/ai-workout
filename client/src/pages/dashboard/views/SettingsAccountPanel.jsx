import { useState } from "react";
import "./SettingsAccountPanel.css";

// Two independent forms: changing a password and deleting the account.
// Both handlers resolve to { ok: true } or { ok: false, error } and never
// throw -- see client/src/app/events.js -- so every branch here is driven by
// the resolved value.
export default function SettingsAccountPanel({ onChangePassword, onDeleteAccount }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [deleteRevealed, setDeleteRevealed] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteSaving, setDeleteSaving] = useState(false);

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordSaving(true);
    setPasswordError("");
    const result = await onChangePassword({ currentPassword, newPassword });
    setPasswordSaving(false);
    if (result?.ok) {
      // Never leave a password sitting in a DOM input after it has been used.
      setCurrentPassword("");
      setNewPassword("");
      return;
    }
    setPasswordError(result?.error || "Unable to change password.");
  };

  // A destructive action this severe must never be one click. The button
  // below only reveals the confirmation step; it does not call
  // onDeleteAccount itself.
  const handleRevealDelete = () => {
    setDeleteRevealed(true);
  };

  const handleCancelDelete = () => {
    setDeleteRevealed(false);
    setDeletePassword("");
    setDeleteError("");
  };

  const handleDeleteSubmit = async (event) => {
    event.preventDefault();
    setDeleteSaving(true);
    setDeleteError("");
    const result = await onDeleteAccount(deletePassword);
    setDeleteSaving(false);
    if (result?.ok) {
      // deleteAccount navigates away and clears state itself on success, so
      // there is nothing left here to reset.
      return;
    }
    // Leave deleteRevealed and deletePassword as they are: the visitor must
    // be able to correct a typo without starting the reveal step over.
    setDeleteError(result?.error || "Unable to delete account.");
  };

  return (
    <div className="settings-account-panel">
      <form className="settings-account-form" onSubmit={handlePasswordSubmit}>
        <h4>Change password</h4>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        {passwordError && (
          <p className="error" role="alert">
            {passwordError}
          </p>
        )}
        <button type="submit" disabled={passwordSaving}>
          {passwordSaving ? "Changing..." : "Change password"}
        </button>
      </form>

      <div className="settings-account-danger">
        <h4>Delete account</h4>
        <p className="muted">
          Deleting your account permanently removes it, along with every workout, meal, metric and
          plan you have logged. This cannot be undone.
        </p>
        {!deleteRevealed ? (
          <button type="button" onClick={handleRevealDelete}>
            Delete account
          </button>
        ) : (
          <form className="settings-account-form" onSubmit={handleDeleteSubmit}>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </label>
            {deleteError && (
              <p className="error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="settings-account-actions">
              <button type="button" onClick={handleCancelDelete} disabled={deleteSaving}>
                Cancel
              </button>
              <button type="submit" disabled={deleteSaving}>
                {deleteSaving ? "Deleting..." : "Confirm deletion"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
