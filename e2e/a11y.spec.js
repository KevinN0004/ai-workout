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

  // Tab must not leave an open modal for the page behind it. Focus moves in
  // when the modal opens, Tab and Shift+Tab go round inside it, and closing it
  // hands focus back to the button that opened it.
  test("an open modal holds keyboard focus, and returns it on close", async () => {
    const opener = page.getByRole("button", { name: "Add workout" }).first();
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Log workout" });
    await expect(dialog).toBeVisible();

    const focusIsInside = () =>
      page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
    expect(await focusIsInside()).toBe(true);
    // More presses than the modal has controls, both ways round.
    for (const key of ["Tab", "Shift+Tab"]) {
      for (let press = 0; press < 25; press += 1) {
        await page.keyboard.press(key);
        expect(await focusIsInside(), `${key} press ${press + 1}`).toBe(true);
      }
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  // The menu drawer is the one overlay not portalled through ModalPortal, so
  // it holds focus on its own, and is checked on its own.
  test("the menu drawer holds keyboard focus, and returns it on close", async () => {
    const menuButton = page.getByRole("button", { name: "Open dashboard menu" });
    await menuButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Dashboard menu" })).toBeVisible();

    const focusIsInside = () =>
      page.evaluate(() => Boolean(document.activeElement?.closest("aside.drawer")));
    expect(await focusIsInside()).toBe(true);
    for (const key of ["Tab", "Shift+Tab"]) {
      for (let press = 0; press < 15; press += 1) {
        await page.keyboard.press(key);
        expect(await focusIsInside(), `${key} press ${press + 1}`).toBe(true);
      }
    }

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Dashboard menu" })).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  // The planner is four steps in one dialog, and each step renders its own
  // controls. Its steps fade in, and axe scanning mid-fade measures colours
  // half drawn, so this runs with reduced motion, which the app honours.
  test("each step of the planner has no violations", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard/plans");
    await page.getByRole("button", { name: "Create weekly plan" }).first().click();
    const planner = page.getByRole("dialog");

    for (const step of ["Environment", "Schedule", "Focus", "Health check"]) {
      await expect(planner.getByRole("heading", { name: step })).toBeVisible();
      expectNoViolations(await analyze(page));
      if (step !== "Health check") await planner.getByRole("button", { name: "Next" }).click();
    }

    // The health check's PAR-Q+ link is the only link in the planner. axe
    // cannot settle the background behind it and files it as incomplete, not
    // as a violation, so its contrast is measured here: WCAG's ratio of the
    // link's colour against the modal's, at least 4.5 for body-size text.
    const ratio = await planner.getByRole("link", { name: "PAR-Q+" }).evaluate((link) => {
      const luminance = (css) => {
        const [r, g, b] = css
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map((value) => {
            const channel = Number(value) / 255;
            return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const fore = luminance(getComputedStyle(link).color);
      const back = luminance(getComputedStyle(link.closest(".modal")).backgroundColor);
      return (Math.max(fore, back) + 0.05) / (Math.min(fore, back) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);

    await page.keyboard.press("Escape");
    await expect(planner).toBeHidden();
    await page.emulateMedia({ reducedMotion: null });
  });

  // On a phone the dashboard shows a fixed bottom bar. Every modal must sit
  // above it, or the bar takes the tap meant for the modal's own buttons:
  // each button here is scrolled into view and must be what the centre of
  // its own box hits.
  test("on a phone, the bottom bar never covers a modal's buttons", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const tappable = (button) =>
      button.evaluate((element) => {
        element.scrollIntoView({ block: "end" });
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return element.contains(hit) ? "tappable" : `covered by ${hit?.textContent?.trim()}`;
      });

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Add workout" }).first().click();
    const workout = page.getByRole("dialog", { name: "Log workout" });
    expect(await tappable(workout.getByRole("button", { name: "Save workout" }))).toBe("tappable");
    await page.keyboard.press("Escape");

    await page.goto("/dashboard/plans");
    await page.getByRole("button", { name: "Create weekly plan" }).first().click();
    const planner = page.getByRole("dialog");
    expect(await tappable(planner.getByRole("button", { name: "Next" }))).toBe("tappable");
    await page.keyboard.press("Escape");

    // The drawer fills a phone's width and keeps Settings at its foot, where
    // the bar is.
    await page.getByRole("button", { name: "Open dashboard menu" }).click();
    const drawer = page.locator("aside.drawer");
    expect(await tappable(drawer.getByRole("button", { name: "Settings" }))).toBe("tappable");
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: null });
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
