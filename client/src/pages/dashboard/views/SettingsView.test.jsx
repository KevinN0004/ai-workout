import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import SettingsView from "./SettingsView";

// Prop-driven, but with real formatting underneath: the measurement system is
// inferred from the visitor's locale, and every row falls back to "Not set"
// rather than rendering an empty cell. Both are observably right or wrong.

const useLocale = (...locales) => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(locales);
  vi.spyOn(navigator, "language", "get").mockReturnValue(locales[0]);
};

const renderView = (props = {}) =>
  render(<SettingsView user={{ email: "a@b.c", profile: {} }} personal={{}} {...props} />);

// Reads the value cell sitting beside a row label.
const rowValue = (label) => {
  const labelEl = screen.getByText(label);
  return labelEl.parentElement?.textContent?.replace(label, "").trim();
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SettingsView", () => {
  describe("measurement system from locale", () => {
    test("a US locale renders height in feet and inches", () => {
      useLocale("en-US");
      renderView({ user: { email: "a@b.c", profile: { heightCm: 183 } } });
      expect(rowValue("Height")).toMatch(/\d+ ft \d+ in/);
    });

    test("a metric locale renders centimetres", () => {
      useLocale("en-GB");
      renderView({ user: { email: "a@b.c", profile: { heightCm: 183 } } });
      expect(rowValue("Height")).toBe("183 cm");
    });

    test("weight follows the same system", () => {
      useLocale("en-GB");
      renderView({ user: { email: "a@b.c", profile: { weightKg: 84 } } });
      expect(rowValue("Weight")).toBe("84 kg");
    });

    test("an underscore locale is parsed like a hyphenated one", () => {
      // Some browsers still report en_US.
      useLocale("en_US");
      renderView({ user: { email: "a@b.c", profile: { heightCm: 183 } } });
      expect(rowValue("Height")).toMatch(/\d+ ft \d+ in/);
    });

    test("a bare language with no region falls back to metric", () => {
      useLocale("en");
      renderView({ user: { email: "a@b.c", profile: { heightCm: 183 } } });
      expect(rowValue("Height")).toBe("183 cm");
    });

    test("the first imperial locale in the list wins", () => {
      useLocale("fr-FR", "en-US");
      renderView({ user: { email: "a@b.c", profile: { heightCm: 183 } } });
      expect(rowValue("Height")).toMatch(/\d+ ft \d+ in/);
    });
  });

  describe("missing values", () => {
    test.each([["Height"], ["Weight"], ["Body fat"]])(
      "%s reads Not set rather than blank when absent",
      (label) => {
        useLocale("en-GB");
        renderView();
        expect(rowValue(label)).toBe("Not set");
      }
    );

    test("a missing email reads Not set", () => {
      useLocale("en-GB");
      renderView({ user: { profile: {} } });
      expect(rowValue("Email")).toBe("Not set");
    });

    test("a missing name reads Not set", () => {
      useLocale("en-GB");
      renderView();
      expect(rowValue("Name")).toBe("Not set");
    });

    test("a null user does not take the view down", () => {
      useLocale("en-GB");
      expect(() => renderView({ user: null })).not.toThrow();
    });

    test("body fat renders as a percentage when present", () => {
      useLocale("en-GB");
      renderView({ user: { email: "a@b.c", profile: { bodyFat: 18.4 } } });
      expect(rowValue("Body fat")).toBe("18.4%");
    });
  });

  describe("tabs", () => {
    test("renders a tablist", () => {
      useLocale("en-GB");
      renderView();
      expect(screen.getByRole("tablist")).toBeInTheDocument();
    });

    test("opens on the profile tab", () => {
      useLocale("en-GB");
      renderView();
      expect(screen.getByText("Identity and body metrics.")).toBeInTheDocument();
    });

    test("clicking another tab swaps the panel and moves selection", () => {
      useLocale("en-GB");
      renderView();
      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBeGreaterThan(1);
      expect(tabs[0]).toHaveAttribute("aria-selected", "true");

      fireEvent.click(tabs[1]);

      // Note the description cannot be asserted on: it renders inside the tab
      // button itself, so it stays in the DOM whichever panel is open. The
      // panel is identified by its heading and by aria-selection instead.
      expect(tabs[0]).toHaveAttribute("aria-selected", "false");
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tabpanel")).toHaveAttribute(
        "aria-labelledby",
        tabs[1].getAttribute("id")
      );
    });

    test("only one panel is rendered at a time", () => {
      useLocale("en-GB");
      renderView();
      expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    });
  });
});

const renderEditable = (props = {}) =>
  renderView({
    user: { email: "a@b.c", profile: { name: "Jordan Fields", age: 34 } },
    personal: { name: "Jordan Fields", age: "34", trainingDays: [] },
    onSaveProfile: vi.fn().mockResolvedValue({ ok: true }),
    ...props
  });

describe("editing a tab", () => {
  test("offers Edit on an editable tab", () => {
    renderEditable();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  test("offers no Edit on a placeholder tab", () => {
    renderEditable();

    fireEvent.click(screen.getByRole("tab", { name: /Privacy/ }));

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  // The form seeds its draft once from `personal`. Task 10 hydrates that
  // asynchronously, so offering Edit before the profile has arrived would seed
  // blanks -- and handleSave posts { ...personal, ...draft }, letting those
  // blanks overwrite the stored profile. A save that wipes what it was meant to
  // edit is the worst failure available here, so the button is gated.
  test("offers no Edit until the profile has arrived", () => {
    renderEditable({ user: { email: "a@b.c" } });

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  test("swaps the rows for a form when Edit is clicked", () => {
    renderEditable();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Age")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  test("returns to the read view on cancel", () => {
    renderEditable();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Age")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  // Switching tabs mid-edit would unmount the form and silently discard the
  // draft. Locking the other tabs makes the mode explicit instead of losing
  // work without saying so.
  test("locks the other tabs while editing", () => {
    renderEditable();
    expect(screen.getByRole("tab", { name: /Training/ })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("tab", { name: /Training/ })).toBeDisabled();
  });

  test("unlocks them again on cancel", () => {
    renderEditable();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("tab", { name: /Training/ })).toBeEnabled();
  });

  test("sends the whole personal form merged with the edits", async () => {
    const onSaveProfile = vi.fn().mockResolvedValue({ ok: true });
    renderEditable({ onSaveProfile });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Age"), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaveProfile).toHaveBeenCalled());
    // Merged over `personal`, not the tab's fields alone -- each tab edits a
    // subset and personalToProfile builds a whole profile, so sending one tab's
    // fields would clear the others.
    expect(onSaveProfile.mock.calls[0][0]).toMatchObject({ name: "Jordan Fields", age: "35" });
  });

  // The assertion above cannot tell the merge from the form: the draft is seeded
  // FROM personal, so `name` is present either way. Only a field the edited tab
  // does not render can distinguish them -- cardio lives on the lifestyle tab,
  // so it reaches the payload solely through { ...personal, ...draft }. Without
  // the merge, editing one tab would blank every field on the other two.
  test("preserves fields the edited tab does not show", async () => {
    const onSaveProfile = vi.fn().mockResolvedValue({ ok: true });
    renderEditable({
      personal: { name: "Jordan Fields", age: "34", trainingDays: [], cardio: "Mixed" },
      onSaveProfile
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaveProfile).toHaveBeenCalled());
    expect(onSaveProfile.mock.calls[0][0].cardio).toBe("Mixed");
  });

  // And this is what proves the form is seeded at all. Passing values={{}} left
  // every other assertion green, because handleSave merges personal back in on
  // the way out -- so the payload looked right while the visitor stared at an
  // empty form.
  test("pre-fills the form with the values it is editing", () => {
    renderEditable();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Age")).toHaveValue(34);
  });

  // The units must follow the visitor's locale, not jsdom's ambient default.
  // The first version of this test asserted metric and passed only by accident
  // of what the environment happened to be -- it failed here because jsdom
  // defaults to en-US, which is imperial. Pinning both directions is what makes
  // the assertion about the code rather than about the test runner.
  test.each([
    ["en-GB", { heightUnit: "cm", weightUnit: "kg" }],
    ["en-US", { heightUnit: "ft", weightUnit: "lb" }]
  ])("saves with the units %s implies", async (locale, expected) => {
    useLocale(locale);
    const onSaveProfile = vi.fn().mockResolvedValue({ ok: true });
    renderEditable({ onSaveProfile });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaveProfile).toHaveBeenCalled());
    expect(onSaveProfile.mock.calls[0][1]).toEqual(expected);
  });

  test("closes the form once the save succeeds", async () => {
    renderEditable();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByLabelText("Age")).toBeNull());
  });

  test("keeps the form open and shows the error when the save fails", async () => {
    renderEditable({
      onSaveProfile: vi.fn().mockResolvedValue({ ok: false, error: "Age must be 10-120." })
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Age must be 10-120.")).toBeInTheDocument();
    expect(screen.getByLabelText("Age")).toBeInTheDocument();
  });
});
