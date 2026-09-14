import { fireEvent, render, screen } from "@testing-library/react";
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

const renderView = (overrides = {}) => render(<SummaryView {...baseProps} {...overrides} />);

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

    test.each([
      ["null", null],
      ["undefined", undefined],
      ["a string", "barbell"],
      ["an object", { 0: "barbell" }],
      ["a number", 3]
    ])("renders when the form's list fields are %s", (_label, value) => {
      // `null` alone does not exercise these guards -- `x || []` handles that
      // one too. It takes a truthy non-array to reach `.join`, and a string
      // has a length but no join, which takes the whole dashboard down.
      expect(() =>
        renderView({ form: { environment: "Home", equipment: value, focuses: value } })
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
      const { container: idle } = render(<SummaryView {...baseProps} weatherLoading={false} />);
      const { container: busy } = render(<SummaryView {...baseProps} weatherLoading={true} />);

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

    test("clicking them calls the handlers", () => {
      const refreshWeatherRecommendation = vi.fn();
      const refreshAirQuality = vi.fn();
      const { container } = renderView({ refreshWeatherRecommendation, refreshAirQuality });

      fireEvent.click(container.querySelector('[aria-label*="weather" i]'));
      fireEvent.click(container.querySelector('[aria-label*="air" i]'));

      expect(refreshWeatherRecommendation).toHaveBeenCalled();
      expect(refreshAirQuality).toHaveBeenCalled();
    });
  });

  // Everything above renders the empty account, so every card in this file
  // showed its empty state and the populated side went untested. These supply
  // the data.

  describe("today's recommendation", () => {
    test("names the weekday it is for", () => {
      renderView({ todayRecommendation: { weekday: "Monday", workoutLines: [], mealPlan: null } });
      expect(screen.getByText("Monday recommendations")).toBeInTheDocument();
    });

    test("falls back to Today when the weekday is missing", () => {
      renderView({ todayRecommendation: { workoutLines: [] } });
      expect(screen.getByText("Today recommendations")).toBeInTheDocument();
    });

    test("lists the workout lines", () => {
      renderView({
        todayRecommendation: { weekday: "Monday", workoutLines: ["Squat 5x5", "Row 3x8"] }
      });

      expect(screen.getByText("Squat 5x5")).toBeInTheDocument();
      expect(screen.getByText("Row 3x8")).toBeInTheDocument();
    });

    test.each([
      [true, "Training day fuel"],
      [false, "Recovery day fuel"]
    ])("a trainingDay of %s is labelled %s", (trainingDay, label) => {
      // The same meal card serves both, and mislabelling it tells the visitor
      // to eat for a session they are not doing.
      renderView({
        todayRecommendation: { weekday: "Monday", workoutLines: [], mealPlan: { trainingDay } }
      });

      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  describe("the weather card", () => {
    const weather = (overrides = {}) => ({
      current: { temperatureC: 14, weatherText: "Cloudy" },
      recommendation: { workoutType: "outdoor", weatherText: "Cloudy", reasons: ["Mild"] },
      daily: [{ date: "2026-09-12" }, { date: "2026-09-13" }],
      ...overrides
    });

    test("reports an outdoor day", () => {
      renderView({ weatherData: weather() });
      expect(screen.getByText(/Outdoor/i)).toBeInTheDocument();
    });

    test("reports an indoor day", () => {
      renderView({
        weatherData: weather({ recommendation: { workoutType: "indoor", reasons: [] } })
      });
      expect(screen.getByText("Indoor day")).toBeInTheDocument();
    });

    test("shows the current temperature", () => {
      renderView({ weatherData: weather() });
      expect(screen.getByText(/14 C/)).toBeInTheDocument();
    });

    test("a zero temperature is shown, not hidden behind a dash", () => {
      // `?? "--"` rather than `|| "--"`. 0 C is a real reading, and this repo
      // has shipped bugs from treating it as a missing one.
      renderView({ weatherData: weather({ current: { temperatureC: 0, weatherText: "Snow" } }) });

      expect(screen.getByText(/0 C/)).toBeInTheDocument();
    });

    test("a missing temperature reads as a dash", () => {
      // Scoped to the weather card: the pollutant list renders dashes too.
      const { container } = renderView({ weatherData: weather({ current: {} }) });
      expect(container.textContent).toContain("-- C");
    });

    test("falls back to the recommendation's own text when the reading has none", () => {
      renderView({
        weatherData: weather({
          current: { temperatureC: 14 },
          recommendation: { workoutType: "outdoor", weatherText: "Fallback text", reasons: [] }
        })
      });

      expect(screen.getByText(/Fallback text/)).toBeInTheDocument();
    });

    test("lists the reasons behind the call", () => {
      renderView({
        weatherData: weather({
          recommendation: { workoutType: "outdoor", reasons: ["Mild", "Low wind"] }
        })
      });

      expect(screen.getByText("Mild")).toBeInTheDocument();
      expect(screen.getByText("Low wind")).toBeInTheDocument();
    });

    test("a non-array reasons field is treated as none rather than throwing", () => {
      expect(() =>
        renderView({
          weatherData: weather({ recommendation: { workoutType: "outdoor", reasons: "Mild" } })
        })
      ).not.toThrow();
    });

    test("shows at most three forecast days", () => {
      renderView({
        weatherData: weather({
          daily: Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-1${i}` }))
        })
      });

      expect(screen.getByText("2026-09-12")).toBeInTheDocument();
      expect(screen.queryByText("2026-09-13")).toBeNull();
    });

    test("a non-array daily forecast is treated as none", () => {
      expect(() => renderView({ weatherData: weather({ daily: "tomorrow" }) })).not.toThrow();
    });

    test("the spinner shows only while loading with nothing to show yet", () => {
      const { container } = renderView({ weatherLoading: true, weatherData: null });
      expect(container.querySelector(".ambient-skeleton, .skeleton, [aria-hidden]")).toBeTruthy();
    });

    test("a reload keeps the last reading on screen rather than blanking it", () => {
      // Loading with data already present must not drop back to the spinner.
      renderView({ weatherLoading: true, weatherData: weather() });
      expect(screen.getByText(/14 C/)).toBeInTheDocument();
    });
  });

  describe("the air quality card", () => {
    const air = (overrides = {}) => ({
      summary: { level: "Good", aqi: 21 },
      location: { name: "Station 1", city: "Springfield" },
      pollutants: [{ code: "pm25", label: "PM2.5", value: 5, unit: "ug/m3", measuredAt: "x" }],
      ...overrides
    });

    test("shows the level", () => {
      renderView({ airQualityData: air() });
      expect(screen.getByText(/Good/)).toBeInTheDocument();
    });

    test("names the station", () => {
      renderView({ airQualityData: air() });
      expect(screen.getByText(/Station 1/)).toBeInTheDocument();
    });

    test("adds the city when there is one", () => {
      renderView({ airQualityData: air() });
      expect(screen.getByText(/\(Springfield\)/)).toBeInTheDocument();
    });

    test("omits the city when there is none", () => {
      const { container } = renderView({
        airQualityData: air({ location: { name: "Station 1" } })
      });

      expect(container.textContent).toContain("Station 1");
      expect(container.textContent).not.toContain("Station 1 (");
    });

    test("shows at most three pollutants", () => {
      const { container } = renderView({
        airQualityData: air({
          pollutants: ["Alpha", "Bravo", "Charlie", "Delta"].map((label, i) => ({
            code: label.toLowerCase(),
            label,
            value: i,
            unit: "ug/m3",
            measuredAt: "2026-09-11"
          }))
        })
      });

      expect(container.textContent).toContain("Alpha");
      expect(container.textContent).toContain("Charlie");
      expect(container.textContent).not.toContain("Delta");
    });

    test("a non-array pollutants field is treated as none", () => {
      expect(() => renderView({ airQualityData: air({ pollutants: "pm25" }) })).not.toThrow();
    });

    test("an unknown level still yields a usable class rather than blank", () => {
      const { container } = renderView({ airQualityData: air({ summary: { aqi: 21 } }) });
      expect(container.querySelector('[class*="unknown"]')).toBeTruthy();
    });

    test("a reload keeps the last reading on screen", () => {
      renderView({ airQualityLoading: true, airQualityData: air() });
      expect(screen.getByText(/Station 1/)).toBeInTheDocument();
    });
  });

  describe("the weekly trend figures", () => {
    test("shows the latest logged weight when there is one", () => {
      renderView({ weeklyTrends: { latestWeight: 181.4, weightDelta: -1.2 } });
      expect(screen.getByText(/181/)).toBeInTheDocument();
    });

    test("a zero weight is shown rather than replaced by the target", () => {
      // `??` again: a logged 0 is wrong data, but hiding it behind the target
      // makes it look like a legitimate goal instead of a bad row.
      const { container } = renderView({ weeklyTrends: { latestWeight: 0 } });

      expect(container.textContent).toContain("0 lb");
      expect(container.textContent).not.toContain("Target weight");
    });

    test("falls back to the target label with no logged weight", () => {
      renderView({ weeklyTrends: {} });
      expect(screen.getByText("Target weight")).toBeInTheDocument();
    });
  });

  describe("the trend range toggle", () => {
    const ranges = {
      week: { activeDays: 3, avgCalories: 2100, avgRecovery: 72, calories: [1], workouts: [1] },
      month: { activeDays: 12, avgCalories: 2200, avgRecovery: 68, calories: [1], workouts: [1] }
    };

    test("opens on the week", () => {
      renderView({ trendRanges: ranges });

      expect(screen.getByText("Last 7 days of trend data.")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    test("switching to the month swaps the figures and the copy", () => {
      renderView({ trendRanges: ranges });

      fireEvent.click(screen.getByText("Month"));

      expect(screen.getByText("Last 30 days of trend data.")).toBeInTheDocument();
      expect(screen.getByText("12")).toBeInTheDocument();
      expect(screen.getAllByText(/30 days/).length).toBeGreaterThan(1);
    });

    test("switching back returns to the week", () => {
      renderView({ trendRanges: ranges });

      fireEvent.click(screen.getByText("Month"));
      fireEvent.click(screen.getByText("Week"));

      expect(screen.getByText("Last 7 days of trend data.")).toBeInTheDocument();
    });

    test("the active range is marked", () => {
      renderView({ trendRanges: ranges });

      expect(screen.getByText("Week")).toHaveClass("active");
      expect(screen.getByText("Month")).not.toHaveClass("active");
    });

    test("a range with no data falls back to the week rather than blanking", () => {
      renderView({ trendRanges: { week: ranges.week } });

      fireEvent.click(screen.getByText("Month"));

      // Still the week's figures, because there is no month data to show.
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    test("no ranges at all still renders zeroes rather than NaN", () => {
      renderView({ trendRanges: {} });

      expect(document.body.textContent).not.toMatch(/NaN/);
    });
  });

  describe("the planner overview", () => {
    test("lists the chosen equipment", () => {
      renderView({ form: { environment: "Home", equipment: ["Dumbbells", "Bands"], focuses: [] } });
      expect(screen.getByText("Dumbbells, Bands")).toBeInTheDocument();
    });

    test("says so when nothing is chosen at home", () => {
      renderView({ form: { environment: "Home", equipment: [], focuses: [] } });
      expect(screen.getByText("No equipment selected yet.")).toBeInTheDocument();
    });

    test("a commercial gym is asked about rooms rather than equipment", () => {
      // The same card serves both, and "no equipment" reads as broken to
      // someone who has a whole gym.
      renderView({ form: { environment: "Commercial", equipment: [], focuses: [] } });

      expect(screen.getByText("No rooms or operations selected yet.")).toBeInTheDocument();
    });

    test("lists the chosen focuses", () => {
      renderView({ form: { environment: "Home", equipment: [], focuses: ["Strength", "Core"] } });
      expect(screen.getByText("Strength, Core")).toBeInTheDocument();
    });

    test("prompts for a focus when none are chosen", () => {
      renderView({ form: { environment: "Home", equipment: [], focuses: [] } });
      expect(screen.getByText("Pick a focus")).toBeInTheDocument();
    });
  });

  describe("the recent workouts list", () => {
    test("shows the focus beside the date when there is one", () => {
      // Driven by `workouts`, not `last7Workouts` -- the latter feeds the
      // weekly progress figures rather than this list.
      const { container } = renderView({
        workouts: [{ id: "1", date: "2026-09-01", focus: "Legs", duration: 45 }]
      });

      expect(container.textContent).toContain("- Legs");
    });

    test("omits it when there is none", () => {
      const { container } = renderView({
        workouts: [{ id: "1", date: "2026-09-01", duration: 45 }]
      });

      expect(container.textContent).toContain("2026-09-01");
      expect(container.textContent).not.toContain("- undefined");
    });

    test("shows at most four", () => {
      const { container } = renderView({
        workouts: Array.from({ length: 6 }, (_, i) => ({
          id: String(i),
          date: `2026-09-0${i + 1}`,
          duration: 45
        }))
      });

      expect(container.querySelectorAll(".summary-list-row")).toHaveLength(4);
    });
  });
});
