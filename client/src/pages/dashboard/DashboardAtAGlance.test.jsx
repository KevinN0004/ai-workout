import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import DashboardAtAGlance from "./DashboardAtAGlance";

// Purely prop-driven, but every one of its four cards picks its wording from
// the shape of the data rather than from a flag -- and the integration suites
// that render it only ever supply one shape (no workout, calories under
// target, both ambient readings loaded and clean). Everything below is the
// other shapes.

const DEFAULTS = {
  nextWorkout: null,
  caloriesGap: 0,
  avgCalories: 2000,
  calorieGoal: 2200,
  weatherLoading: false,
  weatherRecommendation: null,
  weatherError: "",
  weatherLastUpdatedAt: null,
  airQualityLoading: false,
  airSummary: null,
  airQualityError: "",
  airQualityLastUpdatedAt: null,
  formatRelativeUpdatedAt: () => "just now",
  onAddWorkout: () => {},
  onOpenMeal: () => {},
  onOpenTips: () => {}
};

const renderGlance = (props = {}) => render(<DashboardAtAGlance {...DEFAULTS} {...props} />);

// The four cards are in a fixed order and only the first has a heading that
// changes, so they are addressed by position rather than by name.
const CARDS = { workout: 0, calories: 1, weather: 2, air: 3 };
const card = (name) => screen.getAllByRole("article")[CARDS[name]];
const headline = (name) => card(name).querySelector(".dashboard-glance-value")?.textContent;
const note = (name) => card(name).querySelectorAll("p.muted")[0]?.textContent;
const updated = (name) => card(name).querySelector(".dashboard-glance-updated")?.textContent;

describe("DashboardAtAGlance", () => {
  describe("the workout card", () => {
    test("invites a first workout when there is none", () => {
      renderGlance();

      expect(within(card("workout")).getByRole("heading")).toHaveTextContent("Workout status");
      expect(note("workout")).toBe("No workout logged yet. Add one to get started.");
      expect(headline("workout")).toBeUndefined();
    });

    test("names the session and its context once there is one", () => {
      renderGlance({
        nextWorkout: { context: "Next", date: "Mon 5 May", focus: "Push", duration: 45 }
      });

      expect(within(card("workout")).getByRole("heading")).toHaveTextContent("Next workout");
      expect(headline("workout")).toBe("Mon 5 May - Push");
      expect(note("workout")).toBe("45 min planned");
    });

    test("stands in for each missing part of a session rather than rendering a gap", () => {
      renderGlance({ nextWorkout: { context: "Today" } });

      expect(headline("workout")).toBe("Date pending - General");
      expect(note("workout")).toBe("-- min planned");
    });

    test("a zero-minute session reads as no duration", () => {
      // `duration || "--"` cannot tell a zero from an absent value. Harmless
      // here -- a zero-minute session is not a session -- but pinned so the
      // guard is not mistaken for a finite check later.
      renderGlance({ nextWorkout: { context: "Today", date: "Mon", focus: "Pull", duration: 0 } });

      expect(note("workout")).toBe("-- min planned");
    });
  });

  describe("the calories card", () => {
    test.each([
      ["exactly on target", 0, "On target"],
      ["under target", 150, "150 under target"],
      ["over target", -150, "150 over target"]
    ])("reads %s", (_label, caloriesGap, expected) => {
      // The over-target arm reports the absolute value, so a negative gap must
      // never reach the visitor as "-150 over target".
      renderGlance({ caloriesGap });

      expect(headline("calories")).toBe(expected);
    });

    test("rounds the average but shows the goal as given", () => {
      renderGlance({ avgCalories: 1999.6, calorieGoal: 2200 });

      expect(note("calories")).toBe("Avg 2000 / goal 2200 kcal");
    });
  });

  describe("the weather card", () => {
    test.each([
      ["a first check", { weatherLoading: true }, "Checking..."],
      [
        "a refresh over an existing reading",
        { weatherLoading: true, weatherRecommendation: { workoutType: "outdoor" } },
        "Refreshing..."
      ],
      [
        "an outdoor recommendation",
        { weatherRecommendation: { workoutType: "outdoor" } },
        "Outdoor friendly"
      ],
      [
        "an indoor recommendation",
        { weatherRecommendation: { workoutType: "indoor" } },
        "Indoor suggested"
      ],
      [
        "a recommendation with no workout type",
        { weatherRecommendation: { summary: "Mild" } },
        "Unavailable"
      ]
    ])("reports %s", (_label, props, expected) => {
      renderGlance(props);

      expect(headline("weather")).toBe(expected);
    });

    test("a failed lookup and no lookup at all are worded identically", () => {
      // A failed lookup and a lookup that has not happened share this wording,
      // so the headline alone does not tell them apart. That used to be written
      // as `weatherError ? "Unavailable" : "Unavailable"`, a condition that read
      // as though it distinguished them and could not; the condition is gone and
      // the wording is unchanged. The note underneath is what carries the
      // difference, which the last two assertions check.
      //
      // Giving the failed case its own wording is a copy decision nobody has
      // made. This test pins what it does today, either way.
      const { container: failed } = renderGlance({ weatherError: "Weather service unavailable" });
      const { container: neverRan } = renderGlance();
      const read = (container) => {
        const weatherCard = container.querySelectorAll("article")[CARDS.weather];
        return weatherCard.querySelector(".dashboard-glance-value").textContent;
      };

      expect(read(failed)).toBe(read(neverRan));
      expect(read(failed)).toBe("Unavailable");
      // The note underneath is where the two states still differ.
      expect(failed.textContent).toContain("Weather service unavailable");
      expect(neverRan.textContent).toContain("No weather update yet.");
    });

    test.each([
      [
        "the summary when there is one",
        { weatherRecommendation: { summary: "Clear, 18C" } },
        "Clear, 18C"
      ],
      ["the error when there is no summary", { weatherError: "Lookup failed" }, "Lookup failed"],
      ["a placeholder when there is neither", {}, "No weather update yet."]
    ])("notes %s", (_label, props, expected) => {
      renderGlance(props);

      expect(note("weather")).toBe(expected);
    });

    test("prefers the summary over the error when both arrive", () => {
      renderGlance({
        weatherRecommendation: { summary: "Clear, 18C" },
        weatherError: "Lookup failed"
      });

      expect(note("weather")).toBe("Clear, 18C");
    });
  });

  describe("the air quality card", () => {
    test.each([
      ["a first check", { airQualityLoading: true }, "Checking..."],
      [
        "a refresh over an existing reading",
        { airQualityLoading: true, airSummary: { level: "Good" } },
        "Refreshing..."
      ],
      ["the measured level", { airSummary: { level: "Moderate" } }, "Moderate"]
    ])("reports %s", (_label, props, expected) => {
      renderGlance(props);

      expect(headline("air")).toBe(expected);
    });

    test("a failed lookup and no lookup at all are worded identically", () => {
      // The air card shares the weather card's wording for both cases, and
      // carried the same dead condition until it was collapsed.
      renderGlance({ airQualityError: "Air quality service unavailable" });

      expect(headline("air")).toBe("Unavailable");
    });

    test("a reading with no level falls through to the same wording", () => {
      renderGlance({ airSummary: { guidance: "Fine for outdoor training" } });

      expect(headline("air")).toBe("Unavailable");
    });

    test.each([
      [
        "the guidance when there is one",
        { airSummary: { level: "Good", guidance: "Fine to train outside" } },
        "Fine to train outside"
      ],
      [
        "the error when there is no guidance",
        { airQualityError: "Lookup failed" },
        "Lookup failed"
      ],
      ["a placeholder when there is neither", {}, "No air quality guidance available."]
    ])("notes %s", (_label, props, expected) => {
      renderGlance(props);

      expect(note("air")).toBe(expected);
    });
  });

  describe("the freshness line", () => {
    test("formats each card's own timestamp", () => {
      const formatRelativeUpdatedAt = vi.fn(
        (value) => `formatted:${value === null ? "none" : value}`
      );
      renderGlance({
        weatherLastUpdatedAt: 1700000000000,
        airQualityLastUpdatedAt: 1700000600000,
        formatRelativeUpdatedAt
      });

      // Each card must be handed its own timestamp, not the other's.
      expect(updated("weather")).toBe("formatted:1700000000000");
      expect(updated("air")).toBe("formatted:1700000600000");
      expect(formatRelativeUpdatedAt).toHaveBeenCalledWith(1700000000000);
      expect(formatRelativeUpdatedAt).toHaveBeenCalledWith(1700000600000);
    });

    test("defers to the formatter for a card that has never loaded", () => {
      const formatRelativeUpdatedAt = vi.fn(() => "Never");
      renderGlance({ formatRelativeUpdatedAt });

      expect(updated("weather")).toBe("Never");
      expect(formatRelativeUpdatedAt).toHaveBeenCalledWith(null);
    });
  });

  describe("the shortcuts", () => {
    test.each([
      ["Add workout", "onAddWorkout"],
      ["Log meal", "onOpenMeal"],
      ["Open guides", "onOpenTips"]
    ])("%s runs its own handler and no other", (label, handlerName) => {
      const handlers = {
        onAddWorkout: vi.fn(),
        onOpenMeal: vi.fn(),
        onOpenTips: vi.fn()
      };
      renderGlance(handlers);

      fireEvent.click(screen.getByRole("button", { name: label }));

      expect(handlers[handlerName]).toHaveBeenCalledTimes(1);
      for (const [name, handler] of Object.entries(handlers)) {
        if (name !== handlerName) expect(handler).not.toHaveBeenCalled();
      }
    });
  });
});
