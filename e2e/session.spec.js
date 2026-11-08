import { expect, test } from "@playwright/test";

// The in-gym session end to end (roadmap B6): a plan day started as a session,
// sets logged with Done and one undone, the session kept on the device across a
// reload and a trip to the dashboard, and Finish saving it as a workout that
// Postgres keeps. The plan is generated as plan.spec.js does, with the same
// fixed answers, so Monday is "Full body A".

const account = {
  email: `session-${Date.now()}@example.test`,
  password: "session-password-123"
};

test.describe.serial("start a plan day as a session and finish it", () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    // One context for the whole file: the session cookie set at signup, and the
    // session kept in localStorage, have to survive into every later test.
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    // Deleted through the UI, as plan.spec.js does, so a passing run leaves no
    // account behind.
    await page.goto("/dashboard/settings");
    await page.getByRole("tab", { name: /^account/i }).click();
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Confirm deletion" }).click();
    await expect(page.getByRole("button", { name: "Get Started" })).toBeVisible();

    await context?.close();
  });

  test("a new account signs up and generates a plan", async () => {
    await page.goto("/auth");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await page.getByLabel("First name").fill("Sam");
    await page.getByLabel("Last name").fill("Ortiz");
    await page.getByLabel("Age").fill("31");
    await page.getByLabel("Sex").selectOption("Female");
    // As in smoke.spec.js: the height and weight labels hold the unit toggle,
    // and the password label holds the show/hide button.
    await page.getByPlaceholder("5", { exact: true }).fill("5");
    await page.getByPlaceholder("9", { exact: true }).fill("6");
    await page.getByPlaceholder("160").fill("150");
    await page.getByLabel("Email").fill(account.email);
    await page.getByPlaceholder("********").fill(account.password);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/dashboard/plans");
    await page.getByRole("button", { name: "Create weekly plan" }).click();
    const planner = page.getByRole("dialog");
    await planner.getByRole("button", { name: "Dumbbells" }).click();
    await planner.getByRole("button", { name: "Adjustable bench" }).click();
    await planner.getByRole("button", { name: "Next" }).click();
    await planner.getByLabel("Days per week").selectOption("3");
    await planner.getByLabel("Session length (minutes)").selectOption("45");
    await planner.getByLabel("Experience level").selectOption("Intermediate");
    await planner.getByLabel("Injuries or limitations").selectOption("Knee");
    await planner.getByRole("button", { name: "Next" }).click();
    await expect(planner.getByRole("heading", { name: "Focus" })).toBeVisible();
    await planner.getByRole("button", { name: "Next" }).click();
    await expect(planner.getByRole("heading", { name: "Health check" })).toBeVisible();
    await planner.getByRole("button", { name: "Generate workout" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/^This week's plan:/)).toBeVisible();
  });

  test("a plan day starts as a session, and Done and Undo log its sets", async () => {
    await page.goto("/dashboard/plans");
    await page.getByRole("button", { name: /^Mon Warmup: 8 minutes/ }).click();
    await page.getByRole("button", { name: "Start workout" }).click();

    await expect(page).toHaveURL(/\/workout$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Full body A/);
    await expect(page.getByText(/^Exercise 1 of \d+ · Set 1 of 3$/)).toBeVisible();

    // A first week has no loads yet, so the set opens at bodyweight; four steps
    // of 5 lb make it 20 lb. The RPE is tapped for the first set only.
    await expect(page.getByLabel("Load")).toHaveText("Bodyweight");
    for (let step = 0; step < 4; step += 1) {
      await page.getByRole("button", { name: "5 lb heavier" }).click();
    }
    await expect(page.getByLabel("Load")).toHaveText("20 lb");
    await page.getByRole("button", { name: "RPE 8" }).click();
    await page.getByRole("button", { name: "Done" }).click();

    const sets = page.getByRole("list", { name: "Sets done" });
    await expect(sets.getByRole("listitem")).toHaveCount(1);
    await expect(sets).toContainText(/^Set 1: \d+ reps, 20 lb, RPE 8/);

    // The second set copies the first's reps and load, never its RPE; undone,
    // it goes, and logged again it comes back.
    await page.getByRole("button", { name: "Done" }).click();
    await expect(sets.getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Undo set 2" }).click();
    await expect(sets.getByRole("listitem")).toHaveCount(1);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(sets.getByRole("listitem")).toHaveCount(2);
  });

  test("the session survives a reload and a trip to the dashboard", async () => {
    await page.reload();
    await expect(page.getByRole("list", { name: "Sets done" }).getByRole("listitem")).toHaveCount(
      2
    );

    await page.getByRole("button", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard\/workouts$/);
    const notice = page.getByRole("status").filter({ hasText: "Workout in progress" });
    await expect(notice).toBeVisible();

    await notice.getByRole("button", { name: "Resume" }).click();
    await expect(page).toHaveURL(/\/workout$/);
    await expect(page.getByRole("list", { name: "Sets done" }).getByRole("listitem")).toHaveCount(
      2
    );
  });

  test("Finish saves the session as a workout, and Postgres keeps it", async () => {
    const name = await page.getByRole("heading", { level: 2 }).textContent();
    const setLine = await page
      .getByRole("list", { name: "Sets done" })
      .getByRole("listitem")
      .first()
      .textContent();
    const reps = setLine.match(/^Set 1: (\d+) reps/)[1];

    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/api/dashboard/workout") &&
        response.request().method() === "POST" &&
        response.ok(),
      { timeout: 15_000 }
    );
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page).toHaveURL(/\/dashboard\/workouts$/);
    await saved;

    // Finished, the session is gone from the device, so there is nothing to resume.
    await expect(page.getByText(/Workout in progress/)).toHaveCount(0);

    // formatExerciseLine's wording, from the sets as Postgres returned them.
    await page.reload();
    const workoutLog = page.getByRole("heading", { name: "Workout log" }).locator("..");
    await expect(
      workoutLog.getByText(`${name}: ${reps}, ${reps} reps | 20 lb | RPE 8`)
    ).toBeVisible();

    // The plan day links to the session, as one logged through the form does.
    await page.goto("/dashboard/plans");
    await expect(page.getByRole("button", { name: /^Mon Warmup: 8 minutes/ })).toContainText(
      "Logged"
    );

    // With no session open, /workout has nothing to show and goes to the Logs.
    await page.goto("/workout");
    await expect(page).toHaveURL(/\/dashboard\/workouts$/);
  });
});
