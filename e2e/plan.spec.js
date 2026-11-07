import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Plan generation end to end: the planner's four steps, the rule-based
// generator behind /api/generate, the saved plan on the plan hub, and logging
// a workout against one of its days. Since the generator
// needs no Gemini key, this runs keyless, and playwright.config.js empties
// GEMINI_API_KEY so the notes are always the rule-written ones.
//
// The answers are fixed so the plan is too: a home setup with dumbbells and a
// bench, three days, an intermediate lifter, a knee injury. The generator then
// swaps Monday's goblet squat for a box squat with its knee cue.

const account = {
  email: `plan-${Date.now()}@example.test`,
  password: "plan-password-123"
};

test.describe.serial("generate a plan and log a day of it", () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    // One context for the whole file: the session cookie set at signup has to
    // survive into every later test.
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    // Deleted through the UI, as a11y.spec.js does, so a passing run leaves no
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
    await page.getByLabel("First name").fill("Riley");
    await page.getByLabel("Last name").fill("Park");
    await page.getByLabel("Age").fill("34");
    await page.getByLabel("Sex").selectOption("Male");
    // As in smoke.spec.js: the height and weight labels hold the unit toggle,
    // and the password label holds the show/hide button.
    await page.getByPlaceholder("5", { exact: true }).fill("5");
    await page.getByPlaceholder("9", { exact: true }).fill("10");
    await page.getByPlaceholder("160").fill("180");
    await page.getByLabel("Email").fill(account.email);
    await page.getByPlaceholder("********").fill(account.password);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("the planner's four steps generate a rule-built plan", async () => {
    await page.goto("/dashboard/plans");
    await page.getByRole("button", { name: "Create weekly plan" }).click();
    const planner = page.getByRole("dialog");

    // Step 1: the environment and equipment.
    await expect(planner.getByRole("heading", { name: "Environment" })).toBeVisible();
    await planner.getByRole("button", { name: "Dumbbells" }).click();
    await planner.getByRole("button", { name: "Adjustable bench" }).click();
    await planner.getByRole("button", { name: "Next" }).click();

    // Step 2: the schedule, level and injuries.
    await planner.getByLabel("Days per week").selectOption("3");
    await planner.getByLabel("Session length (minutes)").selectOption("45");
    await planner.getByLabel("Experience level").selectOption("Intermediate");
    await planner.getByLabel("Injuries or limitations").selectOption("Knee");
    await planner.getByRole("button", { name: "Next" }).click();

    // Step 3: no focus.
    await expect(planner.getByRole("heading", { name: "Focus" })).toBeVisible();
    await planner.getByRole("button", { name: "Next" }).click();

    // Step 4: the health check, every answer left at no.
    await expect(planner.getByRole("heading", { name: "Health check" })).toBeVisible();
    await expect(
      planner.getByLabel("Are you pregnant, or have you given birth in the last six months?")
    ).toHaveValue("no");
    const generated = page.waitForResponse(
      (response) =>
        response.url().includes("/api/generate") && response.request().method() === "POST"
    );
    await planner.getByRole("button", { name: "Generate workout" }).click();

    const response = await generated;
    expect(response.status()).toBe(200);

    // The rules built it, and wrote its notes: Monday is full body A, and the
    // notes carry the knee line and the red-flag line every plan ends with.
    const answer = await response.json();
    expect(answer.plan).toMatch(/^Monday - Full body A$/m);
    expect(answer.payload.notes.join("\n")).toMatch(/commonly bother your knee/);
    expect(answer.payload.notes.at(-2)).toMatch(/^Stop and get medical help/);
    expect(answer.savedPlan).toBeTruthy();

    // Generated from the dashboard, the planner closes onto the summary, which
    // now reads the new plan's week.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(planner).toBeHidden();
    await expect(page.getByText(/^This week's plan:/)).toBeVisible();
  });

  test("the plan is saved, and a day of it can be logged", async () => {
    await page.goto("/dashboard/plans");
    // The day cards are labelled "Mon" and so on, and the meal cards start the
    // same way, so the workout card is the one that opens with its warmup.
    const monday = page.getByRole("button", { name: /^Mon Warmup: 8 minutes/ });
    // Its squat is the knee's regression, with the cue.
    await expect(monday).toContainText(
      "Dumbbell box squat: 3 x 10-12 (Rest 60-90s, stop 1-2 reps short of failure; " +
        "knee: sit back to a box at a height that stays comfortable)"
    );

    await monday.click();
    await page.getByRole("button", { name: "Log this workout" }).click();
    // The day pre-fills the focus and notes, and a card per prescribed
    // exercise with its rows empty and its targets as placeholders. The
    // duration is left to the person, and it is required.
    const log = page.getByRole("dialog", { name: "Log workout" });
    await expect(log.getByLabel("Focus")).toHaveValue("Monday - Full body A");
    const squat = log.getByRole("group", { name: "Dumbbell box squat" });
    await expect(squat.getByLabel(/^Set \d reps, Dumbbell box squat$/)).toHaveCount(3);
    await expect(squat.getByLabel("Set 1 reps, Dumbbell box squat")).toHaveAttribute(
      "placeholder",
      "10-12"
    );
    await expect(squat.getByLabel("Set 1 reps, Dumbbell box squat")).toHaveValue("");

    // Three sets of the squat, the first with its load; the other cards stay
    // empty, and a blank row is no set.
    for (const [index, reps] of ["12", "11", "10"].entries()) {
      await squat.getByLabel(`Set ${index + 1} reps, Dumbbell box squat`).fill(reps);
    }
    await squat.getByLabel("Set 1 load in lb, Dumbbell box squat").fill("30");
    await log.getByLabel("Duration (minutes)").fill("45");
    await log.getByRole("button", { name: "Save workout" }).click();

    // The save is deferred by the undo window, so wait for the POST before the
    // reload that proves it reached Postgres.
    await page.waitForResponse(
      (saved) =>
        saved.url().includes("/api/dashboard/workout") &&
        saved.request().method() === "POST" &&
        saved.ok(),
      { timeout: 15_000 }
    );
    await page.reload();

    await expect(monday).toContainText("Logged");

    // The sets came back from Postgres: in kg there, in pounds here again.
    await page.goto("/dashboard/workouts");
    const workoutLog = page.getByRole("heading", { name: "Workout log" }).locator("..");
    await expect(workoutLog.getByText("Dumbbell box squat: 12, 11, 10 reps | 30 lb")).toBeVisible();

    // Roadmap B2: the Progress panel above it counts the squat's three sets
    // toward Legs this week (the day was logged today), and its heaviest set is
    // the loaded one. Twelve reps is past the e1RM window, so there is no e1RM.
    const progress = page.getByRole("region", { name: "Progress", exact: true });
    const legs = progress
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: "Legs", exact: true }) });
    await expect(legs.getByRole("cell").first()).toHaveText("3");
    await expect(
      progress.getByText("Dumbbell box squat: heaviest 30 lb × 12", { exact: true })
    ).toBeVisible();
  });

  // Roadmap B4: a day logged last week with every set at the top of the range
  // at RPE 8 steps its lifts up this week. The plan answered "Knee", so the box
  // squat, the knee's regression, asks first; the bench press has no knee flag
  // and steps up on its own.
  test("last week's sets set this week's loads, and a step up can be undone", async () => {
    // Last week's Monday in the browser's own zone, as the log form dates it.
    const lastMonday = await page.evaluate(() => {
      const date = new Date();
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7) - 7);
      const pad = (value) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    });
    const openMonday = async () => {
      await page.getByRole("button", { name: /^Mon Warmup: 8 minutes/ }).click();
      return page.getByRole("region", { name: "This week's loads" });
    };

    await page.goto("/dashboard/plans");
    await openMonday();
    await page.getByRole("button", { name: "Log this workout" }).click();
    const log = page.getByRole("dialog", { name: "Log workout" });
    await log.getByLabel("Date").fill(lastMonday);
    for (const [name, reps, load] of [
      ["Dumbbell box squat", "12", "30"],
      ["Dumbbell bench press", "10", "40"]
    ]) {
      const card = log.getByRole("group", { name });
      for (const set of [1, 2, 3]) {
        await card.getByLabel(`Set ${set} reps, ${name}`).fill(reps);
        await card.getByLabel(`Set ${set} load in lb, ${name}`).fill(load);
        await card.getByLabel(`Set ${set} RPE, ${name}`).fill("8");
      }
    }
    await log.getByLabel("Duration (minutes)").fill("45");
    await log.getByRole("button", { name: "Save workout" }).click();
    await page.waitForResponse(
      (saved) =>
        saved.url().includes("/api/dashboard/workout") &&
        saved.request().method() === "POST" &&
        saved.ok(),
      { timeout: 15_000 }
    );
    await page.reload();

    // 40 lb is stored as 18.14 kg and read back as 40 lb; 30 lb as 13.61 kg.
    let loads = await openMonday();
    const bench = loads.getByRole("listitem").filter({ hasText: /^Dumbbell bench press/ });
    const squat = loads.getByRole("listitem").filter({ hasText: /^Dumbbell box squat/ });
    await expect(bench).toContainText("Dumbbell bench press: Up to 45 lb, from 40");
    await expect(bench).toContainText(/Every set reached 10 reps at RPE 8 or below on Mon \d+ \w+/);
    await expect(squat).toContainText("Dumbbell box squat: Up to 35 lb? Now 30");
    await expect(squat.getByRole("button", { name: "Go up on Dumbbell box squat" })).toBeVisible();
    await expect(
      squat.getByRole("button", { name: "Keep the load on Dumbbell box squat" })
    ).toBeVisible();

    // The day details with a change and a question on screen.
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`)).toEqual([]);

    // The log offers the week's loads as placeholders: the step up's target,
    // and the asked lift's current load until it is answered.
    await page.getByRole("button", { name: "Log this workout" }).click();
    await expect(log.getByLabel("Set 1 load in lb, Dumbbell bench press")).toHaveAttribute(
      "placeholder",
      "45"
    );
    await expect(log.getByLabel("Set 1 load in lb, Dumbbell bench press")).toHaveValue("");
    await expect(log.getByLabel("Set 1 load in lb, Dumbbell box squat")).toHaveAttribute(
      "placeholder",
      "30"
    );
    await page.keyboard.press("Escape");
    await expect(log).toBeHidden();

    loads = await openMonday();
    await loads.getByRole("button", { name: "Undo the step up for Dumbbell bench press" }).click();
    await expect(bench).toContainText("Dumbbell bench press: Hold at 40 lb");
    await expect(
      bench.getByRole("button", { name: "Take back your answer for Dumbbell bench press" })
    ).toBeVisible();
  });
});
