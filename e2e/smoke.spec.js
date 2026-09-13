import { expect, test } from "@playwright/test";

// The one path nothing else in this repo checks: a real browser talking to the
// real server over the real proxy, against the built bundle.
//
// The client suite mocks fetch, so it never sees the CSRF token round trip or
// the session cookie. The server suite drives express with supertest, so it
// never sees the browser half. A defect in the wiring between them -- a cookie
// flag, a missing header, a proxy path -- passes both suites and breaks the app.
//
// Deliberately not covered here: plan generation, which calls Gemini and cannot
// run without a live key, and weather/air quality, which need geolocation.
// Geolocation is left denied in playwright.config.js, so the dashboard takes its
// own "location unavailable" path instead of reaching two live upstreams.

// A fresh account per run. There is no delete-account endpoint, so reusing one
// address would collide with the previous run's row on the second attempt.
const account = {
  email: `e2e-${Date.now()}@example.test`,
  password: "e2e-password-123"
};

// Distinctive enough that asserting on it cannot pass by matching some other
// part of the dashboard.
const WORKOUT_FOCUS = "E2E smoke focus";

test.describe.serial("signup and log a workout", () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    // One context for the whole file: the session cookie set at signup has to
    // survive into the workout test, and a per-test context would drop it.
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("a new account can sign up and reaches the dashboard", async () => {
    await page.goto("/auth");

    await page.getByRole("button", { name: "Sign Up" }).click();

    await page.getByLabel("First name").fill("Jordan");
    await page.getByLabel("Last name").fill("Lee");
    await page.getByLabel("Age").fill("28");
    await page.getByLabel("Sex").selectOption("Female");

    // Height and weight default to ft/lb, and their labels also contain the
    // unit toggle, so the placeholders are the unambiguous handle here.
    await page.getByPlaceholder("5", { exact: true }).fill("5");
    await page.getByPlaceholder("9", { exact: true }).fill("9");
    await page.getByPlaceholder("160").fill("160");

    await page.getByLabel("Email").fill(account.email);
    // Not getByLabel: the show/hide toggle inside this label carries
    // aria-label="Show password", so "Password" matches two elements.
    await page.getByPlaceholder("********").fill(account.password);

    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("a logged workout survives a reload", async () => {
    await page.getByRole("button", { name: "Add workout" }).first().click();

    await page.getByLabel("Duration (minutes)").fill("45");
    await page.getByLabel("Focus").fill(WORKOUT_FOCUS);

    await page.getByRole("button", { name: "Save workout" }).click();

    // It shows immediately because the write is optimistic, which proves
    // nothing about the server.
    await expect(page.getByText(WORKOUT_FOCUS).first()).toBeVisible();

    // The commit is deferred by OPTIMISTIC_UNDO_WINDOW_MS (4.5s) so the undo
    // toast can cancel it. Waiting for the POST is what makes the reload below
    // meaningful rather than racing it.
    // The route is registered under both /workouts and /workout-sessions, and
    // the client uses the latter, so this matches the prefix both share.
    await page.waitForResponse(
      (response) =>
        response.url().includes("/api/dashboard/workout") &&
        response.request().method() === "POST" &&
        response.ok(),
      { timeout: 15_000 }
    );

    // The real assertion: gone through the server, into Postgres, and back out
    // on a fresh read. An optimistic entry that never committed disappears here.
    await page.reload();

    await expect(page.getByText(WORKOUT_FOCUS).first()).toBeVisible();
  });
});
