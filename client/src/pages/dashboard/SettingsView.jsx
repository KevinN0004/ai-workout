import { useMemo, useState } from "react";
import "./SettingsView.css";

const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);

const getRegionFromLocale = (locale) => {
  if (!locale || typeof locale !== "string") return "";
  const localeParts = locale.split(/[-_]/).filter(Boolean);
  if (localeParts.length > 1 && localeParts[1]) {
    return localeParts[1].toUpperCase();
  }
  try {
    const parsed = new Intl.Locale(locale);
    return parsed.region ? parsed.region.toUpperCase() : "";
  } catch {
    return "";
  }
};

const getPreferredMeasurementSystem = () => {
  if (typeof navigator === "undefined") return "metric";
  const locales = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  for (const locale of locales) {
    const region = getRegionFromLocale(locale);
    if (IMPERIAL_REGION_CODES.has(region)) {
      return "imperial";
    }
  }
  return "metric";
};

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

export default function SettingsView({ user, personal }) {
  // Both memoized because their fallback branches minted a fresh object/array
  // every render, defeating the tabs memo that depends on them.
  const profile = useMemo(() => user?.profile || {}, [user]);
  const measurementSystem = useMemo(() => getPreferredMeasurementSystem(), []);
  const fullName =
    personal?.name ||
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
    profile.name ||
    "";
  const trainingDays = useMemo(
    () => (Array.isArray(personal?.trainingDays) ? personal.trainingDays : []),
    [personal]
  );

  const [activeTab, setActiveTab] = useState("profile");
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
          { label: "Timeline", value: personal?.timeline },
          { label: "Experience", value: personal?.experience },
          { label: "Training days", value: trainingDays },
          { label: "Activity level", value: profile?.activity },
          { label: "Goal", value: personal?.goal || profile?.goal }
        ]
      },
      {
        id: "lifestyle",
        label: "Lifestyle",
        description: "Nutrition, cardio, and notes.",
        rows: [
          { label: "Nutrition", value: personal?.nutrition },
          { label: "Cardio", value: personal?.cardio },
          { label: "Notes", value: profile?.notes }
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
    [fullName, measurementSystem, personal, profile, trainingDays, user?.email]
  );
  const activeTabData = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  return (
    <section className="panel settings-view">
      <div className="panel-header">
        <div>
          <h2>Profile</h2>
          <p className="muted">Browse your account details by section.</p>
        </div>
      </div>
      <div className="settings-shell">
        <aside className="settings-tabs" role="tablist" aria-label="Profile sections">
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
            >
              <span>{tab.label}</span>
              <small className="muted">{tab.description}</small>
            </button>
          ))}
        </aside>
        <section
          className="panel settings-body"
          role="tabpanel"
          id={`settings-panel-${activeTabData.id}`}
          aria-labelledby={`settings-tab-${activeTabData.id}`}
        >
          <h3>{activeTabData.label}</h3>
          <div className="settings-list">
            {activeTabData.rows.map((row) => (
              <div className="settings-list-row" key={`${activeTabData.id}-${row.label}`}>
                <span className="muted">{row.label}</span>
                <strong className="settings-value">{displayValue(row.value)}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
