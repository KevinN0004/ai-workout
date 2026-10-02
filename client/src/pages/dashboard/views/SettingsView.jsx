/**
 * The dashboard's Settings view: the account's profile and settings by tab,
 * editing in place for three of them, and the account panel. Rendered by
 * DashboardPage, which loads it lazily.
 */
import { useMemo, useState } from "react";
import { getPreferredMeasurementSystem } from "../../../app/units";
import { profileToPersonal } from "../../../app/profileMapping";
import SettingsEditForm from "../settings/SettingsEditForm";
import SettingsAccountPanel from "../settings/SettingsAccountPanel";
import { EDITABLE_TABS, fieldsForTab } from "../settings/settingsFields";
import "./SettingsView.css";

const formatHeightByLocation = (heightCm, measurementSystem) => {
  const cmNum = Number(heightCm);
  if (!cmNum || Number.isNaN(cmNum)) return "Not set";
  if (measurementSystem !== "imperial") return `${Math.round(cmNum)} cm`;
  const totalInches = cmNum / 2.54;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return `${feet} ft ${inches} in`;
};

const formatWeightByLocation = (weightKg, measurementSystem) => {
  const kgNum = Number(weightKg);
  if (!kgNum || Number.isNaN(kgNum)) return "Not set";
  if (measurementSystem !== "imperial") return `${Math.round(kgNum)} kg`;
  return `${Math.round(kgNum / 0.453592)} lb`;
};

const displayValue = (value) => {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Not set";
  if (value === null || value === undefined) return "Not set";
  if (typeof value === "string") return value.trim() || "Not set";
  return String(value);
};

/**
 * Shows the stored profile tab by tab, height and weight in the visitor's
 * locale units, and edits the profile, training and lifestyle tabs one at a
 * time (EDITABLE_TABS). `onSaveProfile` is submitProfile in events.js, which
 * resolves to `{ ok: true }` or `{ ok: false, error }`; the account handlers go
 * to SettingsAccountPanel on the Account tab. The connected-apps, privacy and
 * notifications tabs show fixed text.
 */
export default function SettingsView({ user, onSaveProfile, onChangePassword, onDeleteAccount }) {
  // ---- Profile and units ----------------------------------------------------

  // Memoized so the memos below keep their inputs: the profile fallback and the
  // units would otherwise be a new object every render. The locale is read once
  // per mount.
  const profile = useMemo(() => user?.profile || {}, [user]);
  const measurementSystem = useMemo(() => getPreferredMeasurementSystem(), []);
  const units = useMemo(
    () =>
      measurementSystem === "imperial"
        ? { heightUnit: "ft", weightUnit: "lb" }
        : { heightUnit: "cm", weightUnit: "kg" },
    [measurementSystem]
  );

  // Every row and the edit form read the stored profile, some rows and all the
  // form's values through profileToPersonal, the mapper the save path uses in
  // reverse. App's in-memory `personal` is no substitute: it is the home flow's
  // form, and a returning visitor who signs in never passes through that flow,
  // so rows read from it would say "Not set" over a stored profile and the edit
  // form would seed blanks.
  const stored = useMemo(() => profileToPersonal(profile, units), [profile, units]);
  const fullName = stored.name;
  const trainingDays = stored.trainingDays;

  // ---- Tabs and their rows --------------------------------------------------
  const [activeTab, setActiveTab] = useState("profile");
  const [editingTab, setEditingTab] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const tabs = useMemo(
    () => [
      {
        id: "profile",
        label: "Profile",
        description: "Identity and body metrics.",
        rows: [
          { label: "Email", value: user?.email || "Not set" },
          { label: "Name", value: fullName || "Not set" },
          { label: "Age", value: profile?.age },
          { label: "Sex", value: profile?.sex },
          {
            label: "Height",
            value: formatHeightByLocation(profile?.heightCm, measurementSystem)
          },
          {
            label: "Weight",
            value: formatWeightByLocation(profile?.weightKg, measurementSystem)
          },
          {
            label: "Body fat",
            value: profile?.bodyFat ? `${profile.bodyFat}%` : "Not set"
          }
        ]
      },
      {
        id: "training",
        label: "Training",
        description: "Plan and workout preferences.",
        rows: [
          { label: "Timeline", value: stored.timeline },
          { label: "Experience", value: stored.experience },
          { label: "Training days", value: trainingDays },
          { label: "Activity level", value: profile?.activity },
          { label: "Goal", value: stored.goal }
        ]
      },
      {
        id: "lifestyle",
        label: "Lifestyle",
        description: "Nutrition, cardio, and notes.",
        rows: [
          { label: "Nutrition", value: stored.nutrition },
          { label: "Cardio", value: stored.cardio },
          { label: "Notes", value: profile?.notes }
        ]
      },
      {
        id: "account",
        label: "Account",
        description: "Credentials and account deletion.",
        rows: [
          { label: "Email", value: user?.email },
          { label: "Password", value: "••••••••" }
        ]
      },
      {
        id: "connected-apps",
        label: "Connected Apps",
        description: "External integrations and sync.",
        rows: [
          { label: "Wearable devices", value: "Not connected" },
          { label: "Health data sync", value: "Not connected" },
          { label: "Calendar sync", value: "Not connected" },
          { label: "Last sync", value: "Not synced yet" }
        ]
      },
      {
        id: "privacy",
        label: "Privacy",
        description: "Data visibility and account privacy.",
        rows: [
          { label: "Profile visibility", value: "Private" },
          { label: "Data sharing", value: "Disabled" },
          { label: "Personalized analytics", value: "Enabled" },
          { label: "Data export", value: "Available" }
        ]
      },
      {
        id: "notifications",
        label: "Notifications",
        description: "Reminders and alerts.",
        rows: [
          { label: "Email reminders", value: "Not configured" },
          { label: "Workout reminders", value: "Not configured" },
          { label: "Nutrition reminders", value: "Not configured" },
          { label: "Weekly summary", value: "Not configured" }
        ]
      }
    ],
    [fullName, measurementSystem, profile, stored, trainingDays, user?.email]
  );
  const activeTabData = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  // ---- Editing --------------------------------------------------------------
  const isEditing = editingTab === activeTabData.id;
  // Gated on the profile having arrived, the same source the form's values come
  // from, so Edit never opens a blank form over a real profile. The gate and the
  // values must read the same thing: gating on one source while seeding from
  // another opens a blank form whose save writes blanks over the stored profile,
  // and a guard on the wrong source looks deliberate, which is worse than none.
  const canEdit = EDITABLE_TABS.includes(activeTabData.id) && Boolean(user?.profile);

  const handleSave = async (draft, formUnits) => {
    setSaving(true);
    setSaveError("");
    // The spread over `stored` is redundant while SettingsEditForm seeds its
    // draft from the whole values object rather than only the fields it renders,
    // as it does: `draft` is already a complete profile, so a mutation removing
    // the spread survives. SettingsEditForm.test.jsx pins that invariant
    // ("carries fields it never rendered through to the save"), because it is
    // invisible from this side.
    //
    // The spread stays because it costs nothing and the failure it guards is
    // severe: were the form narrowed to return only its own tab's fields, this
    // is what would stop editing one tab blanking the other two. It is a known
    // equivalent mutant rather than an untested guard.
    //
    // The units are forwarded unchanged because submitProfile must convert with
    // the same ones the form rendered in.
    const result = await onSaveProfile({ ...stored, ...draft }, formUnits);
    setSaving(false);
    if (result?.ok) {
      setEditingTab("");
      return;
    }
    setSaveError(result?.error || "Unable to save profile.");
  };

  // ---- Render ---------------------------------------------------------------
  return (
    <section className="panel settings-view">
      <div className="panel-header">
        <div>
          <h2>Profile</h2>
          <p className="muted">Browse your account details by section.</p>
        </div>
      </div>
      <div className="settings-shell">
        {/* ---- Tab list ---- */}
        <div className="settings-tabs" role="tablist" aria-label="Profile sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={`settings-tab${activeTabData.id === tab.id ? " active" : ""}`}
              aria-selected={activeTabData.id === tab.id}
              aria-controls={`settings-panel-${tab.id}`}
              id={`settings-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              // Switching tabs mid-edit would unmount the form and discard the
              // draft with no warning. Locking the others makes the mode
              // visible instead of silently losing work.
              disabled={isEditing && tab.id !== activeTabData.id}
            >
              <span>{tab.label}</span>
              <small className="muted">{tab.description}</small>
            </button>
          ))}
        </div>
        {/* ---- The active tab: its rows, or the edit form ---- */}
        <section
          className="panel settings-body"
          role="tabpanel"
          id={`settings-panel-${activeTabData.id}`}
          aria-labelledby={`settings-tab-${activeTabData.id}`}
        >
          <div className="settings-body-header">
            <h3>{activeTabData.label}</h3>
            {canEdit && !isEditing && (
              <button type="button" onClick={() => setEditingTab(activeTabData.id)}>
                Edit
              </button>
            )}
          </div>
          {isEditing ? (
            <SettingsEditForm
              fields={fieldsForTab(activeTabData.id)}
              values={stored}
              measurementSystem={measurementSystem}
              onSave={handleSave}
              onCancel={() => {
                setEditingTab("");
                setSaveError("");
              }}
              error={saveError}
              saving={saving}
            />
          ) : (
            <>
              <div className="settings-list">
                {activeTabData.rows.map((row) => (
                  <div className="settings-list-row" key={`${activeTabData.id}-${row.label}`}>
                    <span className="muted">{row.label}</span>
                    <strong className="settings-value">{displayValue(row.value)}</strong>
                  </div>
                ))}
              </div>
              {activeTabData.id === "account" && (
                <SettingsAccountPanel
                  onChangePassword={onChangePassword}
                  onDeleteAccount={onDeleteAccount}
                />
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
