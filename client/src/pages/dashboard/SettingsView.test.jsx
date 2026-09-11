import { fireEvent, render, screen } from "@testing-library/react";
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
