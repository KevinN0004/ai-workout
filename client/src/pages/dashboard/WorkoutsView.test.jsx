import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import WorkoutsView from "./WorkoutsView";

// Four log lists over one shared paging state. Prop-driven, but not markup:
// it sorts every list by date with its own guard against unparseable ones,
// pages each section separately, and renders every numeric field through `??`
// rather than `||` -- which is the difference between showing a logged zero
// and hiding it behind a dash. This repo has shipped three bugs from that
// distinction, so it is asserted directly.

const SECTIONS = {
  workouts: "Workout log",
  calories: "Calories log",
  meals: "Meal log",
  progress: "Progress metrics log"
};

// Each list is scoped by its heading, since "--" and a date appear in all four.
const section = (name) =>
  screen.getByRole("heading", { name: SECTIONS[name] }).closest(".log-section");

const rowsIn = (name) => section(name).querySelectorAll(".log-list-row");

const datesIn = (name) =>
  Array.from(rowsIn(name)).map((row) => row.querySelector("strong")?.textContent);

const renderView = (props = {}) => {
  const handlers = {
    setWorkoutForm: vi.fn(),
    setWorkoutModalOpen: vi.fn(),
    onOpenCalories: vi.fn(),
    onOpenMeal: vi.fn()
  };
  const utils = render(
    <WorkoutsView
      workouts={[]}
      calories={[]}
      mealLogs={[]}
      progressMetrics={[]}
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers };
};

const dated = (date, extra = {}) => ({ id: date, date, ...extra });

const many = (count, prefix = "2026-01") =>
  Array.from({ length: count }, (_, i) => dated(`${prefix}-${String(i + 1).padStart(2, "0")}`));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("WorkoutsView", () => {
  describe("ordering", () => {
    test("shows the newest entry first", () => {
      renderView({
        workouts: [dated("2026-01-01"), dated("2026-03-05"), dated("2026-02-02")]
      });

      expect(datesIn("workouts")).toEqual(["2026-03-05", "2026-02-02", "2026-01-01"]);
    });

    test.each([
      ["absent", undefined],
      ["null", null],
      ["empty", ""],
      ["zero", 0],
      ["false", false],
      // The one input that distinguishes the `!value` early return in
      // `parseDateValue` from the NaN check below it: `new Date(0n)` throws a
      // TypeError, where every other falsy value already yields 0 through the
      // NaN branch. A BigInt cannot arrive from JSON, so that guard is
      // defence against a programming error rather than against data -- but it
      // is the only thing standing between one and a blank page.
      ["a BigInt zero", 0n]
    ])("a %s date sinks to the bottom rather than throwing", (_label, date) => {
      renderView({ workouts: [{ id: "a", date }, dated("2026-01-01")] });

      expect(datesIn("workouts")).toEqual(["2026-01-01", "--"]);
    });

    test("an unparseable date sinks too", () => {
      // A hand-edited row has reached this list before.
      renderView({ workouts: [dated("not a date"), dated("2026-01-01")] });

      expect(datesIn("workouts")).toEqual(["2026-01-01", "not a date"]);
    });

    test("does not reorder the array it was given", () => {
      // The same array is held by the dashboard; sorting it in place would
      // reorder every other view reading from it.
      const workouts = [dated("2026-01-01"), dated("2026-03-05")];
      renderView({ workouts });

      expect(workouts.map((item) => item.date)).toEqual(["2026-01-01", "2026-03-05"]);
    });

    test.each(["calories", "meals", "progress"])("%s are sorted the same way", (name) => {
      const prop = { calories: "calories", meals: "mealLogs", progress: "progressMetrics" }[name];
      renderView({ [prop]: [dated("2026-01-01"), dated("2026-03-05")] });

      expect(datesIn(name)).toEqual(["2026-03-05", "2026-01-01"]);
    });
  });

  describe("empty states", () => {
    test.each([
      ["workouts", "No workouts logged yet."],
      ["calories", "No calories logged yet."],
      ["meals", "No meal logs yet."],
      ["progress", "No progress metrics logged yet."]
    ])("%s says so", (name, message) => {
      renderView();
      expect(within(section(name)).getByText(message)).toBeInTheDocument();
    });

    // The server has returned null for collection fields before. `null` alone
    // does not exercise the guard though -- `x || []` handles that one too.
    // It takes a truthy non-array to reach the spread, and an object throws
    // there while a string silently becomes one row per character.
    const NOT_ARRAYS = [
      ["null", null],
      ["undefined", undefined],
      ["an object", { 0: { date: "2026-01-01" } }],
      ["a string", "2026-01-01"],
      ["a number", 7]
    ];

    test.each(
      ["workouts", "calories", "mealLogs", "progressMetrics"].flatMap((prop) =>
        NOT_ARRAYS.map(([label, value]) => [prop, label, value])
      )
    )("%s given %s is treated as empty rather than throwing", (prop, _label, value) => {
      const name = {
        workouts: "workouts",
        calories: "calories",
        mealLogs: "meals",
        progressMetrics: "progress"
      }[prop];

      expect(() => renderView({ [prop]: value })).not.toThrow();
      expect(within(section(name)).getByText(/No .* yet\./)).toBeInTheDocument();
    });

    test("the empty workout state offers to add one", () => {
      const { setWorkoutModalOpen } = renderView();

      fireEvent.click(screen.getByText("Add workout now"));

      expect(setWorkoutModalOpen).toHaveBeenCalledWith(true);
    });

    test("the empty calorie state opens the goal page", () => {
      const { onOpenCalories } = renderView();
      fireEvent.click(screen.getByText("Open goal page"));
      expect(onOpenCalories).toHaveBeenCalled();
    });

    test("the empty meal state opens meal prep", () => {
      const { onOpenMeal } = renderView();
      fireEvent.click(screen.getByText("Open meal prep"));
      expect(onOpenMeal).toHaveBeenCalled();
    });

    test("the empty progress state also routes to the goal page", () => {
      const { onOpenCalories } = renderView();
      fireEvent.click(screen.getByText("Log progress in goal page"));
      expect(onOpenCalories).toHaveBeenCalled();
    });
  });

  describe("adding a workout", () => {
    test("seeds today's date and opens the modal", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 11, 9, 0, 0));

      const { setWorkoutForm, setWorkoutModalOpen } = renderView();
      fireEvent.click(screen.getByText("Add workout"));

      expect(setWorkoutForm.mock.calls.at(-1)[0]({ focus: "Legs" })).toEqual({
        focus: "Legs",
        date: "2026-09-11"
      });
      expect(setWorkoutModalOpen).toHaveBeenCalledWith(true);
    });

    test("the empty state's button seeds the date too", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 11, 9, 0, 0));

      const { setWorkoutForm } = renderView();
      fireEvent.click(screen.getByText("Add workout now"));

      expect(setWorkoutForm.mock.calls.at(-1)[0]({})).toEqual({ date: "2026-09-11" });
    });

    test("the date is local, not UTC", () => {
      // Late evening local time is already tomorrow in UTC, and a log dated a
      // day ahead is a bug a visitor notices immediately.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 11, 23, 30, 0));

      const { setWorkoutForm } = renderView();
      fireEvent.click(screen.getByText("Add workout"));

      expect(setWorkoutForm.mock.calls.at(-1)[0]({}).date).toBe("2026-09-11");
    });
  });

  describe("a logged zero is a measurement, not a missing value", () => {
    // `?? "--"` rather than `|| "--"`. Three shipped bugs in this repo came
    // from coercing absent and zero to the same thing, and a rest day really
    // can be 0 minutes.
    test("a zero-minute workout reads as 0, not a dash", () => {
      renderView({ workouts: [dated("2026-01-01", { duration: 0 })] });
      expect(within(section("workouts")).getByText(/^0 min$/)).toBeInTheDocument();
    });

    test("a missing duration reads as a dash", () => {
      renderView({ workouts: [dated("2026-01-01")] });
      expect(within(section("workouts")).getByText(/^-- min$/)).toBeInTheDocument();
    });

    test("a zero-calorie entry reads as 0", () => {
      renderView({ calories: [dated("2026-01-01", { calories: 0 })] });
      expect(within(section("calories")).getByText("0 kcal")).toBeInTheDocument();
    });

    test("a missing calorie count reads as a dash", () => {
      renderView({ calories: [dated("2026-01-01")] });
      expect(within(section("calories")).getByText("-- kcal")).toBeInTheDocument();
    });

    test("zero macros on a meal read as zeroes", () => {
      renderView({
        mealLogs: [dated("2026-01-01", { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 })]
      });

      expect(rowsIn("meals")[0].textContent).toContain("0 kcal");
      expect(rowsIn("meals")[0].textContent).toMatch(/P 0 \/ C 0 \/\s*F 0/);
    });

    test("zero metrics read as zeroes", () => {
      renderView({
        progressMetrics: [
          dated("2026-01-01", { weightLb: 0, bodyFatPct: 0, waistCm: 0, restingHr: 0 })
        ]
      });

      expect(rowsIn("progress")[0].textContent).toMatch(/W 0 lb .* BF 0%/);
    });

    test("missing metrics read as dashes", () => {
      renderView({ progressMetrics: [dated("2026-01-01")] });
      expect(rowsIn("progress")[0].textContent).toMatch(/W -- lb .* BF --%/);
    });
  });

  describe("a workout row", () => {
    test("joins the session details it has", () => {
      renderView({ workouts: [dated("2026-01-01", { sets: 5, reps: 5, intensityRpe: 8 })] });

      expect(within(section("workouts")).getByText("5 sets | 5 reps | RPE 8")).toBeInTheDocument();
    });

    test("omits the parts it does not have rather than leaving separators", () => {
      renderView({ workouts: [dated("2026-01-01", { sets: 5 })] });

      expect(within(section("workouts")).getByText("5 sets")).toBeInTheDocument();
    });

    test("renders no session line at all when none are set", () => {
      renderView({ workouts: [dated("2026-01-01", { focus: "Legs" })] });

      expect(within(section("workouts")).queryByText(/sets|reps|RPE/)).toBeNull();
    });

    test("lists the exercises", () => {
      renderView({ workouts: [dated("2026-01-01", { exercises: ["Squat", "Row"] })] });

      expect(within(section("workouts")).getByText("Squat, Row")).toBeInTheDocument();
    });

    test("shows no exercise line for an empty list", () => {
      renderView({ workouts: [dated("2026-01-01", { exercises: [] })] });

      expect(rowsIn("workouts")[0].querySelectorAll(".workout-detail")).toHaveLength(0);
    });

    test("shows the focus when there is one", () => {
      renderView({ workouts: [dated("2026-01-01", { focus: "Legs" })] });
      expect(rowsIn("workouts")[0].textContent).toContain("- Legs");
    });

    test("shows notes when there are any", () => {
      renderView({ workouts: [dated("2026-01-01", { notes: "Felt strong" })] });
      expect(within(section("workouts")).getByText("Felt strong")).toBeInTheDocument();
    });
  });

  describe("a meal row", () => {
    test("capitalises the meal type", () => {
      renderView({ mealLogs: [dated("2026-01-01", { mealType: "lunch", name: "Rice bowl" })] });
      expect(rowsIn("meals")[0].textContent).toContain("Lunch - Rice bowl");
    });

    test("falls back to Other when the type is missing", () => {
      // Rows predating the meal-type field would otherwise render a bare dash.
      renderView({ mealLogs: [dated("2026-01-01")] });
      expect(rowsIn("meals")[0].textContent).toContain("Other");
    });

    test("omits the name when there is none", () => {
      renderView({ mealLogs: [dated("2026-01-01", { mealType: "lunch" })] });
      expect(rowsIn("meals")[0].textContent).not.toContain("Lunch - ");
    });

    test("shows notes when there are any", () => {
      renderView({ mealLogs: [dated("2026-01-01", { notes: "Post-workout" })] });
      expect(within(section("meals")).getByText("Post-workout")).toBeInTheDocument();
    });
  });

  describe("paging", () => {
    test("shows the first forty rows and holds the rest back", () => {
      renderView({ workouts: many(45) });

      expect(rowsIn("workouts")).toHaveLength(40);
      expect(within(section("workouts")).getByText("Show more workouts")).toBeInTheDocument();
    });

    test("offers nothing more when everything fits", () => {
      renderView({ workouts: many(40) });

      expect(rowsIn("workouts")).toHaveLength(40);
      expect(within(section("workouts")).queryByText("Show more workouts")).toBeNull();
    });

    test("showing more reveals the next batch", () => {
      renderView({ workouts: many(45) });

      fireEvent.click(screen.getByText("Show more workouts"));

      expect(rowsIn("workouts")).toHaveLength(45);
      expect(within(section("workouts")).queryByText("Show more workouts")).toBeNull();
    });

    test("a long list takes more than one expansion", () => {
      renderView({ workouts: many(100) });

      fireEvent.click(screen.getByText("Show more workouts"));
      expect(rowsIn("workouts")).toHaveLength(80);

      fireEvent.click(screen.getByText("Show more workouts"));
      expect(rowsIn("workouts")).toHaveLength(100);
    });

    test.each([
      ["calories", "calories", "Show more calories"],
      ["mealLogs", "meals", "Show more meals"],
      ["progressMetrics", "progress", "Show more metrics"]
    ])("%s pages the same way", (prop, name, label) => {
      renderView({ [prop]: many(45) });

      expect(rowsIn(name)).toHaveLength(40);
      fireEvent.click(screen.getByText(label));
      expect(rowsIn(name)).toHaveLength(45);
    });

    test("expanding one section leaves the others where they were", () => {
      // One piece of state holds all four counts, so writing the wrong key
      // would page a list the visitor is not looking at.
      renderView({ workouts: many(45), calories: many(45) });

      fireEvent.click(screen.getByText("Show more workouts"));

      expect(rowsIn("workouts")).toHaveLength(45);
      expect(rowsIn("calories")).toHaveLength(40);
    });
  });

  describe("rows without an id", () => {
    test("are still rendered, keyed on their position", () => {
      // Older rows predate the id column, and a duplicate React key would drop
      // all but one of them.
      renderView({
        workouts: [
          { date: "2026-01-01", duration: 30 },
          { date: "2026-01-01", duration: 45 }
        ]
      });

      expect(rowsIn("workouts")).toHaveLength(2);
    });

    test("rows with neither an id nor a date are still all rendered", () => {
      renderView({ workouts: [{ duration: 30 }, { duration: 45 }] });

      expect(rowsIn("workouts")).toHaveLength(2);
    });

    test.each([
      ["calories", "calories"],
      ["mealLogs", "meals"],
      ["progressMetrics", "progress"]
    ])("%s rows without ids are all rendered too", (prop, name) => {
      // Each list builds its own key, so the fallback has to hold in all four.
      renderView({ [prop]: [{ date: "2026-01-01" }, { date: "2026-01-01" }, {}] });

      expect(rowsIn(name)).toHaveLength(3);
      expect(datesIn(name)).toEqual(["2026-01-01", "2026-01-01", "--"]);
    });
  });
});
