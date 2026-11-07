import { expect, test } from "@playwright/test";

// A workout logged with no network, across the wire
// (docs/specs/2026-11-06-offline-ready-pwa-design.md). It is kept on the
// device, survives a reload with no network, and reaches the server exactly
// once when the connection comes back: the replay key makes a second send an
// update, never a second row.
//
// It runs in the deployable project, the only one where the service worker
// runs, because the reload with no network has to be answered from its cache.

const account = {
  email: `offline-${Date.now()}@example.test`,
  password: "offline-password-123"
};

const FOCUS = `Offline focus ${Date.now()}`;

test.describe.serial("a workout logged offline", () => {
  let context;
  let page;
  // The Logs view's workout list. The dashboard's glance line names the
  // latest workout too, so "exactly once" is counted here.
  const workoutLog = () =>
    page.locator(".log-section", { has: page.getByRole("heading", { name: "Workout log" }) });

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    // Deleted through the UI, as a11y.spec.js does, so a failed run leaves
    // only what a failed run of any spec here leaves.
    await context.setOffline(false);
    await page.goto("/dashboard/settings");
    await page.getByRole("tab", { name: /^account/i }).click();
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Confirm deletion" }).click();
    await expect(page.getByRole("button", { name: "Get Started" })).toBeVisible();
    await context.close();
  });

  test("signs up, and the worker takes control of the page", async () => {
    await page.goto("/auth");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await page.getByLabel("First name").fill("Jordan");
    await page.getByLabel("Last name").fill("Lee");
    await page.getByLabel("Age").fill("28");
    await page.getByLabel("Sex").selectOption("Female");
    await page.getByPlaceholder("5", { exact: true }).fill("5");
    await page.getByPlaceholder("9", { exact: true }).fill("9");
    await page.getByPlaceholder("160").fill("160");
    await page.getByLabel("Email").fill(account.email);
    await page.getByPlaceholder("********").fill(account.password);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.goto("/dashboard/workouts", { waitUntil: "networkidle" });
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
  });

  test("is kept on the device and marked not sent yet", async () => {
    await context.setOffline(true);

    await page.getByRole("button", { name: "Add workout" }).first().click();
    await page.getByLabel("Duration (minutes)").fill("40");
    await page.getByLabel("Focus").fill(FOCUS);
    await page.getByRole("button", { name: "Save workout" }).click();

    // After the undo window, the send gets no answer and the entry is kept.
    await expect(workoutLog().getByText("Not sent yet")).toBeVisible({ timeout: 15_000 });
    await expect(workoutLog().getByText(FOCUS)).toBeVisible();
  });

  test("is still there after a reload with no network", async () => {
    await page.reload();

    await expect(workoutLog().getByText(FOCUS)).toBeVisible();
    await expect(workoutLog().getByText("Not sent yet")).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "Entries you log are saved on this device and sent when you reconnect."
    );
  });

  test("reaches the server exactly once when the connection is back", async () => {
    // A browser that fires no online event (Playwright's Firefox emulation)
    // comes back on the connection probe's next 30-second tick, so the wait
    // for the toast below needs more than the default 30-second test budget.
    test.setTimeout(60_000);
    await context.setOffline(false);

    await expect(page.getByText("1 entry saved.")).toBeVisible({ timeout: 45_000 });
    await expect(workoutLog().getByText("Not sent yet")).toHaveCount(0);

    await page.reload();
    await expect(workoutLog().getByText(FOCUS)).toHaveCount(1);
    await expect(workoutLog().getByText("Not sent yet")).toHaveCount(0);
  });
});
