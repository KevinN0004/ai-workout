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

// A fresh account per run. The account is deleted by the last test in this
// file, but the timestamp still keeps it unique: a run that fails before
// reaching that test leaves the row behind, and the next run must not collide
// with it.
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
    // No account cleanup here on purpose. The last test in this file deletes
    // the account itself as the thing under test, and by the time this runs
    // it may already be gone -- closing the page is the only cleanup needed,
    // and it does not care whether the account still exists.
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

  // The one thing a unit test cannot see: POST /api/auth/password stamps
  // passwordChangedAt, which invalidates every OTHER session, and reissues a
  // fresh cookie so THIS device stays signed in. A server test can assert the
  // stamp and the new token exist; only a real browser can show that the
  // browser is still authenticated afterwards rather than bounced to login.
  test("changing the password keeps the session signed in", async () => {
    const newPassword = "e2e-password-456";

    await page.goto("/dashboard/settings");
    await page.getByRole("tab", { name: /^account/i }).click();

    await page.getByLabel("Current password").fill(account.password);
    await page.getByLabel("New password").fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();

    // The toast is the confirmation the request round-tripped through the
    // server rather than failing silently -- the handler never throws, it
    // resolves { ok: false } on a rejection instead.
    await expect(page.getByText("Password changed.")).toBeVisible();

    // The real assertion. A reload discards all client state and re-derives
    // `user` from GET /api/auth/me using only the cookie the browser now
    // holds. If the route had invalidated the old session without reissuing a
    // replacement, this would land back on the signed-out header instead.
    await page.reload();

    await expect(page).toHaveURL(/\/dashboard\/settings/);
    await expect(page.getByRole("button", { name: "Open dashboard menu" })).toBeVisible();
    await page.getByRole("tab", { name: /^account/i }).click();
    await expect(page.getByRole("button", { name: "Change password" })).toBeVisible();

    // The account object's password is now stale; the deletion test below
    // needs the new one.
    account.password = newPassword;
  });

  // Last on purpose: it destroys the account the tests above depend on, and
  // the block is serial.
  test("the account can be deleted and the credentials stop working", async () => {
    await page.goto("/dashboard/settings");
    await page.getByRole("tab", { name: /^account/i }).click();

    await page.getByRole("button", { name: "Delete account" }).click();
    // Not getByLabel("Password") alone: "Current password" and "New password"
    // above also match that substring, so this needs the exact name.
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Confirm deletion" }).click();

    // deleteAccount clears local state and navigates to "/", which -- signed
    // out -- renders the intro stage rather than any dashboard chrome.
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("button", { name: "Get Started" })).toBeVisible();

    // The real assertion: the row is gone from Postgres, not merely hidden by
    // cleared client state. A login attempt with the same credentials must be
    // rejected by the server.
    await page.goto("/auth");
    await page.getByLabel("Email").fill(account.email);
    // Not getByLabel: same collision as signup, the show/hide toggle sits
    // inside the same <label>.
    await page.getByPlaceholder("********").fill(account.password);
    // Scoped to the form: the login/sign-up mode toggle above the form is
    // also named "Login" and is not inside it, so an unscoped query is
    // ambiguous between the two.
    await page.locator("form.auth-form").getByRole("button", { name: "Login" }).click();

    await expect(page.getByText(/incorrect|not found|invalid/i)).toBeVisible();
  });
});
