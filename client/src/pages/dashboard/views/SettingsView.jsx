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

export default function SettingsView({ user, onSaveProfile, onChangePassword, onDeleteAccount }) {
  // Both memoized because their fallback branches minted a fresh object/array
  // every render, defeating the tabs memo that depends on them.
  const profile = useMemo(() => user?.profile || {}, [user]);
  const measurementSystem = useMemo(() => getPreferredMeasurementSystem(), []);
  const units = useMemo(
    () =>
      measurementSystem === "imperial"
        ? { heightUnit: "ft", weightUnit: "lb" }
        : { heightUnit: "cm", weightUnit: "kg" },
    [measurementSystem]
  );

  // Everything this view shows and edits comes from the stored profile, through
  // the same mapper the save path uses in reverse.
  //
  // Six of these rows -- timeline, experience, trainingDays, goal, nutrition,
  // cardio -- used to read App's in-memory `personal` instead. That was only
  // ever correct while those fields were unpersisted, which is the defect this
  // whole change set out to fix. A signed-in visitor's `personal` is never
  // populated: they are redirected off "/" to the dashboard before the home
  // flow that fills it can run. So those rows read "Not set" whatever the
  // server had stored, and the edit form seeded blanks over a real profile.
  const stored = useMemo(() => profileToPersonal(profile, units), [profile, units]);
  const fullName = stored.name;
  const trainingDays = stored.trainingDays;

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

  const isEditing = editingTab === activeTabData.id;
  // Gated on the profile having arrived, which is now the same condition the
  // form's values are derived from -- so there is no window where Edit opens a
  // blank form over a real profile.
  //
  // An earlier version gated on user?.profile while the form seeded from App's
  // `personal`, which is a different thing entirely: a signed-in visitor has a
  // profile but an empty `personal`, so Edit appeared, the form opened blank,
  // and saving wrote those blanks over the stored profile. Guarding one source
  // while reading another is worse than not guarding at all, because it looks
  // deliberate.
  const canEdit = EDITABLE_TABS.includes(activeTabData.id) && Boolean(user?.profile);

  const handleSave = async (draft, formUnits) => {
    setSaving(true);
    setSaveError("");
    // The spread over `stored` is deliberately redundant TODAY, and a mutation
    // removing it survives -- SettingsEditForm seeds its draft from the whole
    // values object rather than only the fields it renders, so `draft` is
    // already a complete profile. That invariant is pinned in
    // SettingsEditForm.test.jsx ("carries fields it never rendered through to
    // the save"), because it is invisible from this side.
    //
    // It stays because the cost is nothing and the failure it guards is severe:
    // if the form is ever narrowed to return only its own tab's fields, this is
    // what stops editing one tab blanking the other two. Kept as a known
    // equivalent mutant rather than as an untested guard.
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

  return (
    <section className="panel settings-view">
      <div className="panel-header">
        <div>
          <h2>Profile</h2>
          <p className="muted">Browse your account details by section.</p>
        </div>
      </div>
      <div className="settings-shell">
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
