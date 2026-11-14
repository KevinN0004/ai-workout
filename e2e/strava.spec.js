import { expect, test } from "@playwright/test";

// Strava import end to end (roadmap C2, docs/specs/2026-11-12-strava-import-design.md),
// against e2e/fakeStrava.js, which playwright.config.js starts and points the
// server at. It runs in the `deployable` project, on the server's own origin, as
// production does: the browser leaves for "Strava", comes back to the server's
// callback with its real cookies, and lands on Settings.
//
// Imports arrive two ways, as in production: the quiet sync the dashboard runs
// on the landing after connecting, and webhook events, which the spec delivers
// as Strava would. Sync now is not used: the landing's sync counts as an attempt,
// so a Sync now within the minute after it is skipped by the server's throttle.

const FAKE = "http://127.0.0.1:5099";
const SUBSCRIPTION_ID = 4242;
const stamp = Date.now();

const account = {
  email: `strava-${stamp}@example.test`,
  password: "strava-password-123"
};

// The fake's athlete differs per run, so an account a failed run left behind
// never holds this run's athlete (the server links each athlete to one account).
const ATHLETE_ID = 7_000_000 + (stamp % 1_000_000);
const MORNING_RUN = ATHLETE_ID * 10 + 1;
const EVENING_RUN = ATHLETE_ID * 10 + 2;

const DISCONNECTED = "Strava is disconnected, and the workouts imported from it are removed.";

const pad = (value) => String(value).padStart(2, "0");

// An activity as Strava's API answers it. `start_date_local` is the athlete's
// wall-clock time with a Z, as Strava writes it.
const run = (id, name, startsAt) => ({
  id,
  name,
  sport_type: "Run",
  type: "Run",
  start_date: startsAt.toISOString(),
  start_date_local: `${startsAt.getFullYear()}-${pad(startsAt.getMonth() + 1)}-${pad(startsAt.getDate())}T${pad(startsAt.getHours())}:${pad(startsAt.getMinutes())}:00Z`,
  moving_time: 1860,
  distance: 5012.4,
  has_heartrate: true,
  average_heartrate: 142.4
});

test.describe.serial("connect Strava, import, delete and disconnect", () => {
  let context;
  let page;

  const control = (command) => context.request.post(`${FAKE}/__control`, { data: command });
  const fakeState = async () => (await context.request.get(`${FAKE}/__control`)).json();

  // An activity event, as Strava posts it to the subscription's callback.
  const activityEvent = (aspectType, objectId) =>
    context.request.post("/webhooks/strava", {
      data: {
        aspect_type: aspectType,
        event_time: Math.floor(Date.now() / 1000),
        object_id: objectId,
        object_type: "activity",
        owner_id: ATHLETE_ID,
        subscription_id: SUBSCRIPTION_ID,
        updates: {}
      }
    });

  const importRow = (name) => page.locator(".workout-row", { hasText: name });

  test.beforeAll(async ({ browser }) => {
    // One context for the whole file: the session cookie set at signup has to
    // survive the round trip through the fake Strava.
    context = await browser.newContext();
    page = await context.newPage();
    await control({ action: "reset", athleteId: ATHLETE_ID });
  });

  test.afterAll(async () => {
    // Deleted through the UI, as the other suites do, so a passing run leaves no
    // account behind.
    await page.goto("/dashboard/settings");
    await page.getByRole("tab", { name: /^account/i }).click();
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Confirm deletion" }).click();
    await expect(page.getByRole("button", { name: "Get Started" })).toBeVisible();

    await context?.close();
  });

  test("a new account signs up", async () => {
    await page.goto("/auth");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await page.getByLabel("First name").fill("Jo");
    await page.getByLabel("Last name").fill("Strava");
    await page.getByLabel("Age").fill("31");
    await page.getByLabel("Sex").selectOption("Female");
    // As in smoke.spec.js: the height and weight labels hold the unit toggle,
    // and the password label holds the show/hide button.
    await page.getByPlaceholder("5", { exact: true }).fill("5");
    await page.getByPlaceholder("9", { exact: true }).fill("6");
    await page.getByPlaceholder("160").fill("140");
    await page.getByLabel("Email").fill(account.email);
    await page.getByPlaceholder("********").fill(account.password);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("connecting goes to Strava and back, and the landing's sync imports a run", async () => {
    await page.goto("/dashboard/settings");
    await page.getByRole("tab", { name: /Connected Apps/ }).click();
    const connect = page.getByRole("button", { name: "Connect with Strava" });
    await expect(connect).toBeEnabled();

    // The sync window opens when the account connects, so the run starts after.
    await control({
      action: "add",
      activity: run(MORNING_RUN, "Morning run", new Date(Date.now() + 2 * 60_000))
    });
    const landingSync = page.waitForResponse(
      async (response) =>
        response.url().endsWith("/api/integrations/strava/sync") &&
        response.request().method() === "POST" &&
        (await response.json().catch(() => ({}))).imported === 1
    );
    await connect.click();

    // Back on Settings, with the result shown once and gone from the address.
    await expect(
      page.getByText("Strava is connected. New activities will arrive here.")
    ).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
    await expect(page.getByText("Connected as Jo S.")).toBeVisible();
    await landingSync;
  });

  test("the imported run shows in the Logs, from Strava, with a link back", async () => {
    await page.goto("/dashboard/workouts");

    const row = importRow("Morning run");
    await expect(row).toContainText(/From Strava \| (3\.1 mi|5\.0 km) \| 142 bpm/);
    await expect(row.getByRole("link", { name: "View on Strava" })).toHaveAttribute(
      "href",
      `https://www.strava.com/activities/${MORNING_RUN}`
    );
  });

  test("a deleted import stays deleted when Strava sends it again", async () => {
    const row = importRow("Morning run");
    await row.getByRole("button", { name: "Delete" }).click();
    await row.getByRole("button", { name: "Delete workout" }).click();
    await expect(importRow("Morning run")).toHaveCount(0);

    // Strava reports an edit to the deleted run. The server answers at once and
    // then fetches the run, which the fake records, before refusing to bring it
    // back.
    expect((await activityEvent("update", MORNING_RUN)).status()).toBe(200);
    await expect
      .poll(async () => (await fakeState()).fetched.filter((id) => id === String(MORNING_RUN)))
      .toHaveLength(1);

    // A new run arrives by webhook, and only it appears.
    await control({ action: "add", activity: run(EVENING_RUN, "Evening run", new Date()) });
    expect((await activityEvent("create", EVENING_RUN)).status()).toBe(200);
    await expect
      .poll(
        async () => {
          await page.reload();
          await expect(page.getByRole("heading", { name: "Workout log" })).toBeVisible();
          return importRow("Evening run").count();
        },
        { timeout: 15_000 }
      )
      .toBe(1);
    await expect(importRow("Morning run")).toHaveCount(0);
  });

  test("disconnecting revokes access and removes every import", async () => {
    await page.goto("/dashboard/settings");
    await page.getByRole("tab", { name: /Connected Apps/ }).click();
    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(
      page.getByText("Your workouts imported from Strava will be removed.")
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm disconnect" }).click();

    await expect(page.getByText(DISCONNECTED)).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect with Strava" })).toBeVisible();
    expect((await fakeState()).revokes).toBe(1);

    await page.goto("/dashboard/workouts");
    await expect(page.getByRole("heading", { name: "Workout log" })).toBeVisible();
    await expect(page.getByText(/From Strava/)).toHaveCount(0);
  });
});
