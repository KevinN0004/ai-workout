import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import DashboardAtAGlance from "../DashboardAtAGlance";

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
        "Not checked yet"
      ]
    ])("reports %s", (_label, props, expected) => {
      renderGlance(props);

      expect(headline("weather")).toBe(expected);
    });

    test("a failed lookup reads differently from one that never ran", () => {
      // These shared the word "Unavailable" until the two states were given
      // their own wording. The note underneath always differed; the headline,
      // which is the line a visitor scans, did not.
      const { container: failed } = renderGlance({ weatherError: "Weather service unavailable" });
      const { container: neverRan } = renderGlance();
      const read = (container) => {
        const weatherCard = container.querySelectorAll("article")[CARDS.weather];
        return weatherCard.querySelector(".dashboard-glance-value").textContent;
      };

      expect(read(failed)).toBe("Couldn't check");
      expect(read(neverRan)).toBe("Not checked yet");
      expect(read(failed)).not.toBe(read(neverRan));
      // The note still carries the detail behind each.
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

    test("a failed lookup reads differently from one that never ran", () => {
      renderGlance({ airQualityError: "Air quality service unavailable" });
      expect(headline("air")).toBe("Couldn't check");

      renderGlance();
      expect(screen.getAllByRole("article")[4 + CARDS.air].textContent).toContain(
        "Not checked yet"
      );
    });

    test("a reading with no level falls through to the not-checked wording", () => {
      // The server always sets a level, so this is the component's contract
      // rather than a state the app produces.
      renderGlance({ airSummary: { guidance: "Fine for outdoor training" } });

      expect(headline("air")).toBe("Not checked yet");
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

  describe("retrying after a failure", () => {
    // The card had no way to act on an error: a visitor saw one and could do
    // nothing. These handlers already existed on DashboardPage and were being
    // passed to SummaryView, just not here.
    test.each([
      ["weather", { weatherError: "Lookup failed" }, "refreshWeatherRecommendation"],
      ["air quality", { airQualityError: "Lookup failed" }, "refreshAirQuality"]
    ])("the %s card offers a retry that calls its own handler", (_label, props, handlerName) => {
      const handlers = {
        refreshWeatherRecommendation: vi.fn(),
        refreshAirQuality: vi.fn()
      };
      renderGlance({ ...props, ...handlers });

      const retry = document.querySelector(".dashboard-glance-retry");
      fireEvent.click(retry);

      expect(handlers[handlerName]).toHaveBeenCalledTimes(1);
      const other =
        handlerName === "refreshAirQuality" ? "refreshWeatherRecommendation" : "refreshAirQuality";
      expect(handlers[other]).not.toHaveBeenCalled();
    });

    test("no retry is offered when nothing failed", () => {
      renderGlance({ refreshWeatherRecommendation: vi.fn(), refreshAirQuality: vi.fn() });

      expect(document.querySelectorAll(".dashboard-glance-retry")).toHaveLength(0);
    });

    test("no retry is offered when there is no handler to call", () => {
      // A button that does nothing is worse than no button.
      renderGlance({ weatherError: "Lookup failed", airQualityError: "Lookup failed" });

      expect(document.querySelectorAll(".dashboard-glance-retry")).toHaveLength(0);
    });

    test("each card only offers its own retry", () => {
      renderGlance({
        weatherError: "Lookup failed",
        refreshWeatherRecommendation: vi.fn(),
        refreshAirQuality: vi.fn()
      });

      expect(document.querySelectorAll(".dashboard-glance-retry")).toHaveLength(1);
    });

    test("the retry is disabled and renames itself while it runs", () => {
      renderGlance({
        weatherError: "Lookup failed",
        weatherLoading: true,
        refreshWeatherRecommendation: vi.fn()
      });
      const retry = document.querySelector(".dashboard-glance-retry");

      expect(retry).toBeDisabled();
      expect(retry.textContent).toBe("Retrying...");
      expect(retry.getAttribute("aria-label")).toBe("Retrying weather");
    });

    test("the retry is enabled and named plainly when idle", () => {
      renderGlance({ weatherError: "Lookup failed", refreshWeatherRecommendation: vi.fn() });
      const retry = document.querySelector(".dashboard-glance-retry");

      expect(retry).not.toBeDisabled();
      expect(retry.textContent).toBe("Retry");
      expect(retry.getAttribute("aria-label")).toBe("Retry weather");
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
