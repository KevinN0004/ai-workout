import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Accessibility coverage against the real rendered pages. This exists because
// nothing else in the repo checks accessibility at all, and because the linter
// is not a substitute: jsx-a11y's recommended set reported 153 findings here,
// 128 of them false positives on `<label>Name <input /></label>`, which axe
// passes without complaint. When the two disagree about rendered output, this
// file is the authority -- so three jsx-a11y rules are switched off in
// eslint.config.js on the strength of it, and it is what should catch a real
// keyboard trap if one ever ships.
//
// It scans the three states a visitor actually passes through, rather than
// every route, because each needs a real session or a real interaction to
// reach. Adding a state means signing up again, which is why they share one
// context and run in order.

const account = {
  email: `a11y-${Date.now()}@example.test`,
  password: "a11y-password-123"
};

// axe rejects a page from browser.newPage(); it needs an explicit context.
const analyze = (page) => new AxeBuilder({ page }).analyze();

const expectNoViolations = (results) => {
  // Name the rules in the failure message. `toEqual([])` on the raw nodes
  // prints a wall of serialised DOM that says nothing about what broke.
  const summary = results.violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`);
  expect(summary).toEqual([]);
};

test.describe.serial("accessibility", () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("the login form has no violations", async () => {
    await page.goto("/auth");

    expectNoViolations(await analyze(page));
  });

  test("the signup form has no violations", async () => {
    await page.getByRole("button", { name: "Sign Up" }).click();

    expectNoViolations(await analyze(page));
  });

  test("the dashboard has no violations", async () => {
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

    expectNoViolations(await analyze(page));
  });

  // Modals are where the serious violation was: every one had role="dialog"
  // with no accessible name, so a screen reader announced "dialog" and nothing
  // else. They are now named by their own visible heading.
  test("an open modal has no violations and is named", async () => {
    await page.getByRole("button", { name: "Add workout" }).first().click();

    const dialog = page.getByRole("dialog", { name: "Log workout" });
    await expect(dialog).toBeVisible();

    expectNoViolations(await analyze(page));
  });

  // The behaviour behind the three jsx-a11y interaction rules being off. If a
  // backdrop click is the only way out, this is what fails.
  test("a modal can be dismissed with the keyboard alone", async () => {
    await expect(page.getByRole("dialog", { name: "Log workout" })).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog", { name: "Log workout" })).toBeHidden();
  });
});
