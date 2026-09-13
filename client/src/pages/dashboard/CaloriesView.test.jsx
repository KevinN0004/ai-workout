import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import CaloriesView from "./CaloriesView";

// The goal view: three forms, two logs, and two charts. Nothing here computes
// much, but every field writes into a different slice of a different form, and
// every list has an empty state -- so the things worth pinning are which field
// reaches which key, which submit runs, and what each list says with nothing in
// it.

const METRIC = {
  id: "m1",
  date: "2026-09-10",
  weightLb: 180,
  bodyFatPct: 18,
  waistCm: 84,
  restingHr: 58
};

// Each onChange hands React an updater that closes over the event and reads
// `e.target.value` *when it runs*. These inputs are controlled by props that
// never change here, so React restores the DOM value as soon as the event
// settles -- and an updater invoked after that reads the restored value, not
// the typed one. So the updater is applied inside the setter, during the event.
const capturingSetter = (box) =>
  vi.fn((updater) => {
    box.result = typeof updater === "function" ? updater(box.previous) : updater;
  });

const setters = (boxes) => ({
  setGoalForm: capturingSetter(boxes.goal),
  setCalorieForm: capturingSetter(boxes.calorie),
  setProgressForm: capturingSetter(boxes.progress),
  submitCalories: vi.fn((e) => e.preventDefault()),
  submitGoals: vi.fn((e) => e.preventDefault()),
  submitProgressMetric: vi.fn((e) => e.preventDefault())
});

const newBox = () => ({ previous: { untouched: "kept" }, result: null });

const renderView = (props = {}) => {
  const boxes = { goal: newBox(), calorie: newBox(), progress: newBox() };
  const handlers = setters(boxes);
  const utils = render(
    <CaloriesView
      goalForm={{ targetWeight: "175", targetCalories: "2200", weeklyWorkouts: "4" }}
      avgCalories={2350.4}
      calorieGoal={2200}
      calorieDelta={150}
      buildLinePath={(series) => `M 0 0 L ${(series || []).length} 10`}
      calorieSeries={[2100, 2300, 2500]}
      workoutSeries={[1, 0, 1]}
      last7Keys={["2026-09-06", "2026-09-07", "2026-09-12"]}
      calorieForm={{ calories: "2100" }}
      calories={[{ id: "c1", date: "2026-09-10", calories: 2100 }]}
      goalPaceText="At this pace, 3 days to reach 4 workouts."
      progressMetrics={[METRIC]}
      progressForm={{
        date: "2026-09-11",
        weightLb: "179",
        bodyFatPct: "17.5",
        waistCm: "83",
        restingHr: "57",
        notes: "felt strong"
      }}
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers, boxes };
};

const typeInto = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("CaloriesView", () => {
  describe("the calorie summary", () => {
    test("rounds the seven-day average", () => {
      renderView({ avgCalories: 2350.4 });

      expect(screen.getByText("2350")).toBeInTheDocument();
    });

    test.each([
      ["over the target", 150, "+150"],
      ["on the target", 0, "On track"],
      ["under the target", -150, "On track"]
    ])("reads %s", (_label, calorieDelta, expected) => {
      // Being under target is not a problem to report, so only an overshoot
      // gets a number -- and it needs its own plus sign.
      renderView({ calorieDelta });

      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    test("shows the target as given", () => {
      renderView({ calorieGoal: 2200 });

      expect(screen.getByText("2200")).toBeInTheDocument();
    });
  });

  describe("the charts", () => {
    test("each is drawn from its own series", () => {
      const buildLinePath = vi.fn((series) => `M 0 0 L ${series.length} 10`);
      renderView({ buildLinePath, calorieSeries: [1, 2, 3], workoutSeries: [4, 5] });

      expect(buildLinePath).toHaveBeenCalledWith([1, 2, 3]);
      expect(buildLinePath).toHaveBeenCalledWith([4, 5]);
    });

    test("both charts label the first and last day of the window", () => {
      // Asserted per chart rather than across the page: there are two, and a
      // document-wide check passes while only one of them is right.
      renderView({ last7Keys: ["2026-09-06", "2026-09-09", "2026-09-12"] });
      const labelPairs = [...document.querySelectorAll(".chart-labels")].map((node) =>
        [...node.querySelectorAll("span")].map((span) => span.textContent)
      );

      expect(labelPairs).toHaveLength(2);
      labelPairs.forEach((pair) => expect(pair).toEqual(["2026-09-06", "2026-09-12"]));
      // The middle key is a data point, not a label.
      expect(screen.queryByText("2026-09-09")).toBeNull();
    });
  });

  describe("logging calories", () => {
    test("writes what was typed into the calorie field", () => {
      const { boxes } = renderView();

      typeInto("Calories", "2450");

      expect(boxes.calorie.result).toEqual({ untouched: "kept", calories: "2450" });
    });

    test("submitting runs the calorie handler and no other", () => {
      const { submitCalories, submitGoals, submitProgressMetric } = renderView();

      fireEvent.click(screen.getByRole("button", { name: "Log calories" }));

      expect(submitCalories).toHaveBeenCalledTimes(1);
      expect(submitGoals).not.toHaveBeenCalled();
      expect(submitProgressMetric).not.toHaveBeenCalled();
    });

    test("lists what has been logged", () => {
      renderView({
        calories: [
          { id: "c1", date: "2026-09-10", calories: 2100 },
          { id: "c2", date: "2026-09-09", calories: 2250 }
        ]
      });
      const rows = document.querySelectorAll(".goal-list-row");

      expect(rows[0].textContent).toContain("2026-09-10");
      expect(rows[0].textContent).toContain("2100 kcal");
      expect(screen.queryByText("No calories logged yet.")).toBeNull();
    });

    test("says so when nothing has been logged", () => {
      renderView({ calories: [] });

      expect(screen.getByText("No calories logged yet.")).toBeInTheDocument();
    });
  });

  describe("the goals form", () => {
    test.each([
      ["Target weight (lb)", "190", "targetWeight"],
      ["Target calories", "2600", "targetCalories"],
      ["Weekly workouts", "5", "weeklyWorkouts"]
    ])("%s writes to its own key", (label, value, key) => {
      const { boxes } = renderView();

      typeInto(label, value);

      expect(boxes.goal.result).toEqual({ untouched: "kept", [key]: value });
    });

    test("the header's save button submits the goals form from outside it", () => {
      // The button sits in the panel header and reaches the form by id, which
      // is the part that breaks quietly if the id is renamed.
      const { submitGoals } = renderView();

      fireEvent.click(screen.getByRole("button", { name: "Save goals" }));

      expect(submitGoals).toHaveBeenCalledTimes(1);
    });

    test("shows the target weight it was given", () => {
      renderView({
        goalForm: { targetWeight: "165", targetCalories: "2000", weeklyWorkouts: "3" }
      });

      expect(screen.getByText("Target weight: 165 lb")).toBeInTheDocument();
    });

    test("shows the pace line it was given", () => {
      renderView({ goalPaceText: "Log a workout to start your pace estimate." });

      expect(screen.getByText("Log a workout to start your pace estimate.")).toBeInTheDocument();
    });
  });

  describe("the progress form", () => {
    test.each([
      ["Date", "2026-09-12", "date"],
      ["Weight lb", "178", "weightLb"],
      ["Body fat (%)", "17", "bodyFatPct"],
      ["Waist (cm)", "82", "waistCm"],
      ["Resting HR", "56", "restingHr"],
      ["Notes", "easy session", "notes"]
    ])("%s writes to its own key", (label, value, key) => {
      const { boxes } = renderView();

      typeInto(label, value);

      expect(boxes.progress.result).toEqual({ untouched: "kept", [key]: value });
    });

    test("submitting runs the metric handler", () => {
      const { submitProgressMetric, submitGoals } = renderView();

      fireEvent.click(screen.getByRole("button", { name: "Save metric" }));

      expect(submitProgressMetric).toHaveBeenCalledTimes(1);
      expect(submitGoals).not.toHaveBeenCalled();
    });
  });

  describe("the progress log", () => {
    test("reports every measurement it has", () => {
      renderView({ progressMetrics: [METRIC] });
      const row = [...document.querySelectorAll(".goal-list-row")].at(-1);

      expect(row.textContent).toContain("W 180 lb");
      expect(row.textContent).toContain("BF 18%");
      expect(row.textContent).toContain("Waist 84 cm");
      expect(row.textContent).toContain("RHR 58");
    });

    test("stands in for each measurement it does not have", () => {
      renderView({
        progressMetrics: [{ id: "m2", date: "2026-09-10" }]
      });
      const row = [...document.querySelectorAll(".goal-list-row")].at(-1);

      expect(row.textContent).toContain("W -- lb");
      expect(row.textContent).toContain("BF --%");
      expect(row.textContent).toContain("Waist -- cm");
      expect(row.textContent).toContain("RHR --");
    });

    test("a measured zero is reported rather than stood in for", () => {
      // `?? "--"` rather than `|| "--"`, so a genuine zero survives. A resting
      // heart rate of 0 is nonsense, but a waist or body fat of 0 reaching the
      // list as "--" would hide a bad reading instead of showing it.
      renderView({
        progressMetrics: [
          { id: "m3", date: "2026-09-10", weightLb: 0, bodyFatPct: 0, waistCm: 0, restingHr: 0 }
        ]
      });
      const row = [...document.querySelectorAll(".goal-list-row")].at(-1);

      expect(row.textContent).toContain("W 0 lb");
      expect(row.textContent).toContain("BF 0%");
      expect(row.textContent).toContain("Waist 0 cm");
      expect(row.textContent).toContain("RHR 0");
    });

    test("shows at most six entries", () => {
      const many = Array.from({ length: 9 }, (_, index) => ({
        ...METRIC,
        id: `m-${index}`,
        weightLb: 100 + index
      }));
      renderView({ progressMetrics: many, calories: [] });

      const rows = [...document.querySelectorAll(".goal-list-row")];
      expect(rows).toHaveLength(6);
      expect(rows[0].textContent).toContain("W 100 lb");
      expect(rows[5].textContent).toContain("W 105 lb");
    });

    test.each([
      ["an empty list", []],
      ["nothing at all", undefined],
      ["null", null]
    ])("says so for %s", (_label, progressMetrics) => {
      renderView({ progressMetrics, calories: [] });

      expect(screen.getByText("No progress metrics logged yet.")).toBeInTheDocument();
      expect(document.querySelectorAll(".goal-list-row")).toHaveLength(0);
    });

    test("a value that is not a list says so, like an empty one", () => {
      // The rows and the empty state used to be guarded separately and
      // disagreed: Array.isArray for the rows, `?.length` for the message --
      // which a string satisfies, so a non-array produced neither rows nor an
      // explanation. Both now read the same narrowed list.
      renderView({ progressMetrics: "not a list", calories: [] });

      expect(document.querySelectorAll(".goal-list-row")).toHaveLength(0);
      expect(screen.getByText("No progress metrics logged yet.")).toBeInTheDocument();
    });

    test("a calorie log that is not a list says so rather than throwing", () => {
      // This list had no guard at all and would have thrown on .map. The
      // producer never sends one, but the two lists in this view now behave
      // the same way rather than three different ways.
      expect(() => renderView({ calories: "not a list", progressMetrics: [] })).not.toThrow();
      expect(screen.getByText("No calories logged yet.")).toBeInTheDocument();
    });
  });
});
