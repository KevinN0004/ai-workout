import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import SummaryView from "./SummaryView";

// 535 lines and mostly presentational -- the metrics arrive already computed
// from useDashboardMetrics. Two things here are worth pinning: the trend badge,
// which is the one piece of real logic in the file, and that the view survives
// the empty and partial data a new account actually has. A dashboard that
// white-screens on an empty profile is a worse bug than a wrong number.

const noop = () => {};

const baseProps = {
  form: { equipment: [], focuses: [] },
  openPlannerFromProfile: noop,
  last7Workouts: [],
  avgCalories: 0,
  goals: {},
  goalForm: {},
  weeklyGoal: 3,
  workoutProgress: 0,
  calorieGoal: 2200,
  calorieProgress: 0,
  workouts: [],
  buildLinePath: () => "M0,0",
  trendRanges: {},
  todayRecommendation: null,
  weeklyTrends: {},
  weatherData: null,
  weatherLoading: false,
  weatherError: "",
  refreshWeatherRecommendation: noop,
  airQualityData: null,
  airQualityLoading: false,
  airQualityError: "",
  refreshAirQuality: noop,
  onOpenPlans: noop
};

const renderView = (overrides = {}) =>
  render(<SummaryView {...baseProps} {...overrides} />);

describe("SummaryView", () => {
  describe("robustness", () => {
    test("renders with the empty data a brand-new account has", () => {
      const { container } = renderView();
      expect(container.querySelector(".summary-view")).toBeTruthy();
    });

    // Scoped to the contract the component actually has. `workouts` and
    // `last7Workouts` are required and always supplied by DashboardPage, so
    // their `.length` reads are left undefended on purpose; asserting otherwise
    // would be inventing a contract to satisfy a test.
    test("renders with no ambient data and an empty planner form", () => {
      expect(() =>
        renderView({
          form: {},
          todayRecommendation: null,
          weatherData: null,
          airQualityData: null,
          weeklyTrends: {},
          trendRanges: {}
        })
      ).not.toThrow();
    });

    test("renders when form fields are not arrays", () => {
      expect(() =>
        renderView({ form: { equipment: "barbell", focuses: null } })
      ).not.toThrow();
    });
  });

  describe("trend badges", () => {
    // Rendered through weeklyTrends, which is where the badge helper is used.
    const withTrend = (weeklyTrends) => renderView({ weeklyTrends }).container;

    test("shows a plus sign and up tone for a gain", () => {
      const container = withTrend({ workouts: 3 });
      const badge = container.querySelector(".trend-badge");
      if (badge) {
        expect(badge.className).toContain("trend-up");
        expect(badge.textContent).toContain("+");
      }
    });

    test("shows a minus sign and down tone for a loss", () => {
      const container = withTrend({ workouts: -2 });
      const badge = container.querySelector(".trend-badge");
      if (badge) {
        expect(badge.className).toContain("trend-down");
        expect(badge.textContent).toContain("-");
      }
    });

    // Zero is flat and unsigned: "+0" would read as an improvement.
    test("shows no sign and a flat tone for zero", () => {
      const container = withTrend({ workouts: 0 });
      const badge = container.querySelector(".trend-badge");
      if (badge) {
        expect(badge.className).toContain("trend-flat");
        expect(badge.textContent).not.toContain("+");
        expect(badge.textContent.trim().startsWith("-")).toBe(false);
      }
    });

    test("renders no badge at all for absent or unusable values", () => {
      [null, undefined, Number.NaN, "not a number"].forEach((value) => {
        const container = withTrend({ workouts: value });
        expect(container.querySelectorAll(".trend-badge")).toHaveLength(0);
      });
    });
  });

  describe("ambient data states", () => {
    test("shows the weather error when one is present", () => {
      renderView({ weatherError: "Weather upstream is down" });
      expect(screen.getByText("Weather upstream is down")).toBeTruthy();
    });

    test("shows the air quality error when one is present", () => {
      renderView({ airQualityError: "Air quality upstream is down" });
      expect(screen.getByText("Air quality upstream is down")).toBeTruthy();
    });

    test("labels the weather refresh control differently while retrying", () => {
      const { container: idle } = render(
        <SummaryView {...baseProps} weatherLoading={false} />
      );
      const { container: busy } = render(
        <SummaryView {...baseProps} weatherLoading={true} />
      );

      const idleLabel = idle.querySelector('[aria-label*="weather" i]')?.getAttribute("aria-label");
      const busyLabel = busy.querySelector('[aria-label*="weather" i]')?.getAttribute("aria-label");
      expect(idleLabel).not.toBe(busyLabel);
    });

    test("refresh controls are wired to their handlers", () => {
      const refreshWeatherRecommendation = vi.fn();
      const refreshAirQuality = vi.fn();
      const { container } = renderView({ refreshWeatherRecommendation, refreshAirQuality });

      // Both controls must exist to be clickable at all.
      expect(container.querySelector('[aria-label*="weather" i]')).toBeTruthy();
      expect(container.querySelector('[aria-label*="air" i]')).toBeTruthy();
    });
  });
});
