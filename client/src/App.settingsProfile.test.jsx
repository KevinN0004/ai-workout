import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";

// Drives the assembled feature the way a signed-in visitor does: land on
// /dashboard/settings, read the profile, edit it, save, and inspect what
// actually reaches the network.
//
// Every other test on this path stubs the piece next to it -- SettingsView's
// tests stub onSaveProfile, the events tests stub apiFetch, the mapper's tests
// call it directly -- so each half can be right while the assembly is wrong.
// Two shipped-shaped defects got through exactly that way and are pinned here:
//
//   - Six rows read App's in-memory `personal`, which is never populated for a
//     signed-in visitor, so Settings showed "Not set" for the very fields the
//     server had just been taught to store.
//   - Edit was gated on user.profile while the form seeded from `personal`, so
//     it opened blank over a real profile and saving wrote the blanks back.
//
// The e2e suite is the only other place both halves run together, and it
// deliberately skips profile editing because that needs a real database.

const PROFILE = {
  firstName: "Jordan",
  lastName: "Fields",
  age: 34,
  sex: "Female",
  heightCm: 178,
  weightKg: 77,
  bodyFat: 22,
  activity: "High",
  timeline: "12 weeks",
  experience: "Intermediate",
  trainingDays: ["Monday", "Friday"],
  goal: "Mobility",
  sleep: "7 - 8 hours",
  nutrition: "High-protein",
  cardio: "Mixed",
  notes: "Back injury"
};

const DASHBOARD = {
  workouts: [],
  workoutSessions: [],
  calories: [],
  mealLogs: [],
  progressMetrics: [],
  plans: [],
  savedExercises: [],
  goals: { targetWeight: 160, targetCalories: 2200, weeklyWorkouts: 3 }
};

let calls;

const stubApi = (profile = PROFILE) => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, opts) => {
      const u = String(url);
      calls.push({ url: u, opts });
      if (u.includes("/api/auth/me")) {
        return { ok: true, json: async () => ({ user: { email: "a@b.c", profile } }) };
      }
      if (u.includes("/api/profile")) {
        return { ok: true, json: async () => ({ profile }) };
      }
      if (u.includes("/api/csrf-token")) {
        return { ok: true, json: async () => ({ csrfToken: "t" }) };
      }
      if (u.includes("/api/dashboard")) {
        return { ok: true, json: async () => ({ dashboard: DASHBOARD }) };
      }
      return { ok: true, json: async () => ({}) };
    })
  );
};

// The settings view is lazy-loaded, so this awaits a real dynamic import rather
// than a microtask flush.
const openSettings = async () => {
  window.history.pushState({}, "", "/dashboard/settings");
  render(<App />);
  await waitFor(() => expect(screen.queryByRole("tablist")).toBeTruthy(), { timeout: 5000 });
};

// Reads the value cell beside a row label, distinguishing the label element
// from any other occurrence of the same text elsewhere on the dashboard.
const rowValue = (label) => {
  const el = screen.queryAllByText(label).find((node) => node.className === "muted");
  return el?.parentElement?.textContent?.replace(label, "").trim();
};

const profilePost = () =>
  calls.find((c) => c.url.includes("/api/profile") && c.opts?.method === "POST");

beforeEach(() => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB"]);
  vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a signed-in visitor reads their stored profile", () => {
  test.each([
    ["Timeline", "12 weeks"],
    ["Experience", "Intermediate"],
    ["Training days", "Monday, Friday"],
    ["Goal", "Mobility"]
  ])("the Training tab shows the stored %s", async (label, expected) => {
    stubApi();
    await openSettings();

    fireEvent.click(screen.getByRole("tab", { name: /Training/ }));

    expect(rowValue(label)).toBe(expected);
  });

  test.each([
    ["Nutrition", "High-protein"],
    ["Cardio", "Mixed"]
  ])("the Lifestyle tab shows the stored %s", async (label, expected) => {
    stubApi();
    await openSettings();

    fireEvent.click(screen.getByRole("tab", { name: /Lifestyle/ }));

    expect(rowValue(label)).toBe(expected);
  });
});

describe("and edits it", () => {
  test("opens the form already filled in", async () => {
    stubApi();
    await openSettings();

    fireEvent.click(screen.getByRole("tab", { name: /Training/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Experience")).toHaveValue("Intermediate");
  });

  test("sends the edited field", async () => {
    stubApi();
    await openSettings();

    fireEvent.click(screen.getByRole("tab", { name: /Training/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Experience"), { target: { value: "Advanced" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(profilePost()).toBeTruthy(), { timeout: 3000 });
    expect(JSON.parse(profilePost().opts.body).experience).toBe("Advanced");
  });

  // Editing one tab must not blank the rest of the profile. These are all
  // fields the Training tab never rendered.
  test.each([
    ["weightKg", 77],
    ["heightCm", 178],
    ["bodyFat", 22],
    ["notes", "Back injury"],
    ["nutrition", "High-protein"],
    ["cardio", "Mixed"]
  ])("preserves %s, which the edited tab never showed", async (field, expected) => {
    stubApi();
    await openSettings();

    fireEvent.click(screen.getByRole("tab", { name: /Training/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(profilePost()).toBeTruthy(), { timeout: 3000 });
    expect(JSON.parse(profilePost().opts.body)[field]).toEqual(expected);
  });

  // The whole point of the hydration guard: no profile means nothing to edit,
  // and offering Edit anyway is how a blank form overwrites a real record.
  // `null`, not `undefined` -- a default parameter only fires on undefined, so
  // stubApi(undefined) would quietly hand back the full profile and the test
  // would assert nothing. That is the same trap the mapper's `units || {}`
  // guard exists for.
  test("offers no Edit before the profile has arrived", async () => {
    stubApi(null);
    await openSettings();

    fireEvent.click(screen.getByRole("tab", { name: /Training/ }));

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});
