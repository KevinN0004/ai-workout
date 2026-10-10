import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Accessibility coverage against the real rendered pages. The linter is not a
// substitute: jsx-a11y's two label rules, which its recommended set already
// leaves off and eslint.config.js pins off, fire on
// `<label>Name <input /></label>` when switched on, and axe passes that markup
// without complaint. When the two disagree about rendered output, this file is
// the authority -- so three more jsx-a11y rules are switched off in
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
    // This suite signs up its own account and, unlike smoke.spec.js, never
    // submits the delete confirmation as part of a test -- the two account
    // scans below stop at "revealed" so axe can see that state. Without this
    // the account would join the e2e-* leak CLAUDE.md describes. Reached via
    // the UI rather than a direct API call so it exercises the same
    // requireAuth + CSRF path the rest of this suite already went through,
    // and does not depend on which test ran last.
    await page.goto("/dashboard/settings");
    await page.getByRole("tab", { name: /^account/i }).click();
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Confirm deletion" }).click();
    await expect(page.getByRole("button", { name: "Get Started" })).toBeVisible();

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

  // The profile edit form is the newest form in the app and carries markup
  // nothing else here does: two number inputs that together mean one height,
  // and an inline error beside the controls rather than in a dialog. It is
  // reached only by signing in and opening a tab, which is why it lives at the
  // end of this serial run rather than in its own file.
  test("the settings profile edit form has no violations", async () => {
    await page.goto("/dashboard/settings");
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

    expectNoViolations(await analyze(page));
  });

  // The training tab is the one with a checkbox group.
  //
  // The group's NAME is asserted explicitly rather than left to axe, because
  // axe does not check it: removing the <legend> was mutation-tested here and
  // survived the scan. Each checkbox keeps its own label either way, so a
  // legend-less fieldset is not a violation by axe's default rules -- but it
  // does cost a screen reader user the one piece of context that says what the
  // seven checkboxes are FOR. getByRole("group", { name }) fails if the legend
  // goes, which the scan alone would not.
  test("the training day checkbox group is named and has no violations", async () => {
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("tab", { name: /Training/ }).click();
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("checkbox", { name: "Monday" })).toBeVisible();

    await expect(page.getByRole("group", { name: "Training days" })).toBeVisible();

    expectNoViolations(await analyze(page));
  });

  // The account tab is the newest surface in the app and the only one with a
  // destructive, multi-step confirmation. Two states matter: as first shown,
  // and with the confirmation revealed -- a different DOM with an extra
  // labelled input, which is exactly the shape a missing label or a
  // mis-scoped error region would hide in only one of the two.
  test("the account tab has no violations", async () => {
    // Navigates rather than dismissing whatever the previous test left open.
    // This used to open with a Cancel click that only worked because the test
    // before it ended with the profile edit form on screen -- legal under
    // describe.serial, but it made reordering or inserting a test break this
    // one with a failure that pointed nowhere near the cause.
    await page.goto("/dashboard/settings");
    await page.getByRole("tab", { name: /^account/i }).click();
    await expect(page.getByRole("button", { name: "Delete account" })).toBeVisible();
    await expect(page.getByLabel("Current password")).toBeVisible();

    expectNoViolations(await analyze(page));
  });

  test("the delete confirmation step has no violations", async () => {
    await page.getByRole("button", { name: "Delete account" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();

    expectNoViolations(await analyze(page));
  });

  // A third state, and the one the other two cannot reach: an error rendered.
  // The panel's failures live in a `.error` element, whose contrast against
  // the panel background nothing in this suite had ever measured -- the two
  // scans above both run with no error on screen. `.error` is shared app-wide,
  // so this is likely fine; "likely" is what a gate is supposed to replace.
  test("the account panel's error state has no violations", async () => {
    await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Confirm deletion" }).click();

    // The server answers 401 and the panel renders the message in role="alert".
    await expect(page.getByRole("alert")).toBeVisible();

    expectNoViolations(await analyze(page));

    // Leave the panel closed so the afterAll deletion starts from a known
    // state rather than inheriting this failed attempt.
    await page.getByRole("button", { name: "Cancel" }).click();
  });
});
