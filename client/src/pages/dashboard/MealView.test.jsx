import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import MealView from "./MealView";
import { MEALDB_RECOMMENDATION_QUERIES } from "./meal/data";

// MealView is the coordinator for the meal tab: it picks the recommendation
// track from the account's goal text, derives the calorie band and the portion
// note attached to every meal, builds the course filter, and owns the details
// modal. Its five child panels have no tests of their own, so this drives them
// through it.
//
// Only the boundary is stubbed. `useMealDbSearch` is the real hook, so the
// fetches, the abort handling and the normalisation under test are the ones
// that ship -- what is faked is `fetch` alone.

const mealPayload = (id, extra = {}) => ({
  id,
  title: `Meal ${id}`,
  image: "https://example.com/a.jpg",
  ...extra
});

// Routes by the `query=` parameter so one query can fail while the others
// succeed. A handler may be a function returning the JSON body, or a literal
// response object when the point of the test is a non-ok status.
const stubFetch = ({ byQuery = {}, fallback } = {}) => {
  const fetchMock = vi.fn(async (url) => {
    const query = new URL(String(url), "http://localhost").searchParams.get("query");
    const handler = byQuery[query] ?? fallback ?? (() => ({ meals: [] }));
    if (typeof handler !== "function") return handler;
    const body = await handler();
    return { ok: true, json: async () => body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const renderView = (props = {}) => {
  const handlers = { setMealLogForm: vi.fn(), submitMealLog: vi.fn((e) => e.preventDefault()) };
  const utils = render(
    <MealView
      dashboard={{ plans: [], goals: {} }}
      fallbackPlan={null}
      mealLogForm={null}
      mealLogs={[]}
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers };
};

const tablist = () => screen.getByRole("tablist", { name: "Meal course options" });

// A course pill renders its title as a bare text node followed by a count
// span, so the button's own text is `${title}${count}` and an exact text match
// never hits it. Matched on the prefix instead.
const coursePill = (title) => {
  const found = within(tablist())
    .getAllByRole("button")
    .find((button) => button.textContent.startsWith(title));
  if (!found) throw new Error(`no course pill titled ${title}`);
  return found;
};

const courseCount = (title) => coursePill(title).querySelector(".meal-course-count").textContent;

// Which sections are actually on screen. Read from the section headers rather
// than by text: a course pill carries the same title, and so does every meal
// card's own heading.
const displayedSectionTitles = () =>
  Array.from(document.querySelectorAll(".meal-section-header h3")).map((h) => h.textContent);

const openCourse = (title) => fireEvent.click(coursePill(title));

// The recommendation effect fires on mount. Its sections are filtered out of
// the "All courses" view when they came back empty, but their course pills are
// always rendered -- so that is what says the effect has landed.
const settled = async (track = "lean_strength") => {
  const first = MEALDB_RECOMMENDATION_QUERIES[track][0].title;
  await waitFor(() => expect(coursePill(first)).toBeTruthy());
};

// `<p><strong>Goal:</strong> {value}</p>` -- the value is a sibling text node,
// so it has to be read off the paragraph rather than matched on its own.
const contextValue = (label) =>
  screen.getByText(label).parentElement.textContent.replace(label, "").trim();

const searchForm = () => screen.getByPlaceholderText("chicken, pasta, salmon").closest("form");

const searchFor = (query) => {
  fireEvent.change(screen.getByPlaceholderText("chicken, pasta, salmon"), {
    target: { value: query }
  });
  fireEvent.submit(searchForm());
};

// Every field of the meal-log form, with the value a number input reports
// (a number, or null when empty) where that differs from what was typed.
const FIELDS = [
  { label: "Date", value: "2026-09-03", empty: "" },
  { label: "Meal type", value: "snack", empty: "breakfast" },
  { label: "Meal name", value: "Oats", empty: "" },
  { label: "Calories", value: "700", typed: 700, empty: null },
  { label: "Protein (g)", value: "40", typed: 40, empty: null },
  { label: "Carbs (g)", value: "80", typed: 80, empty: null },
  { label: "Fat (g)", value: "15", typed: 15, empty: null },
  { label: "Notes", value: "Felt strong", empty: "" }
];

const EMPTY_FORM = {
  date: "",
  mealType: "breakfast",
  name: "",
  calories: "",
  proteinG: "",
  carbsG: "",
  fatG: "",
  notes: ""
};

// MealView takes the log form as a prop, so a test that types into it needs
// something to hold the state the dashboard normally holds.
function ControlledMealView({ initialForm, ...rest }) {
  const [form, setForm] = useState(initialForm);
  return <MealView mealLogForm={form} setMealLogForm={setForm} {...rest} />;
}

const renderControlled = (initialForm = EMPTY_FORM) =>
  render(
    <ControlledMealView
      initialForm={initialForm}
      dashboard={{ plans: [], goals: {} }}
      fallbackPlan={null}
      mealLogs={[]}
      submitMealLog={vi.fn((event) => event.preventDefault())}
    />
  );

const queriesSent = (fetchMock) =>
  fetchMock.mock.calls.map(([url]) =>
    new URL(String(url), "http://localhost").searchParams.get("query")
  );

beforeEach(() => {
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MealView", () => {
  describe("the recommendation track it picks", () => {
    test.each([
      ["Build lean strength", "lean_strength"],
      ["Fat loss and conditioning", "fat_loss"],
      ["Endurance and performance", "endurance"],
      ["Mobility and recovery", "recovery"]
    ])("%s selects the %s queries", async (goal, track) => {
      const fetchMock = stubFetch();
      renderView({ dashboard: { plans: [{ goal }], goals: {} } });
      await settled(track);

      const expected = MEALDB_RECOMMENDATION_QUERIES[track].map((entry) => entry.query);
      expect(
        queriesSent(fetchMock)
          .filter((q) => expected.includes(q))
          .sort()
      ).toEqual([...expected].sort());
    });

    test("takes the goal from the account's goals when no plan carries one", async () => {
      // Each source only applies when the ones above it are absent.
      renderView({
        dashboard: { plans: [], goals: { goalType: "Fat loss" } },
        fallbackPlan: { goal: "Endurance" }
      });
      await settled("fat_loss");
      expect(contextValue("Goal:")).toBe("Fat loss");
    });

    test("uses the fallback plan when the account has no goal at all", async () => {
      renderView({ dashboard: { plans: [], goals: {} }, fallbackPlan: { goal: "Endurance work" } });
      await settled("endurance");
      expect(contextValue("Goal:")).toBe("Endurance work");
    });

    test("defaults the goal text when nothing supplies one", async () => {
      renderView();
      await settled();
      expect(contextValue("Goal:")).toBe("Build lean strength and energy");
    });
  });

  describe("the context strip", () => {
    test("reports the saved target and training days", async () => {
      renderView({
        dashboard: { plans: [{ goal: "Strength", days: 5 }], goals: { targetCalories: 2600 } }
      });
      await settled();
      expect(contextValue("Target calories:")).toBe("2600 / day");
      expect(contextValue("Weekly plan:")).toBe("5 training days");
    });

    test("defaults to 2200 calories and 3 days", async () => {
      renderView();
      await settled();
      expect(contextValue("Target calories:")).toBe("2200 / day");
      expect(contextValue("Weekly plan:")).toBe("3 training days");
    });

    test("takes the weekly day count from goals when the plan has none", async () => {
      renderView({ dashboard: { plans: [{ goal: "Strength" }], goals: { weeklyWorkouts: 6 } } });
      await settled();
      expect(contextValue("Weekly plan:")).toBe("6 training days");
    });

    test("takes it from the fallback plan when neither has one", async () => {
      renderView({ fallbackPlan: { days: 4 } });
      await settled();
      expect(contextValue("Weekly plan:")).toBe("4 training days");
    });
  });

  describe("the portion note, which depends on the calorie band", () => {
    const openFirstMeal = async () => {
      const cards = await screen.findAllByText("Meal 1");
      fireEvent.click(cards[0]);
      return screen.getByRole("dialog");
    };

    test.each([
      [1800, "One cup"],
      [2200, "Two cups"],
      [2600, "Three cups"]
    ])("%i calories shows the %s portion", async (targetCalories, expected) => {
      stubFetch({
        fallback: () => ({
          meals: [
            mealPayload("1", {
              portionByCalorie: { light: "One cup", balanced: "Two cups", high: "Three cups" }
            })
          ]
        })
      });
      renderView({ dashboard: { plans: [], goals: { targetCalories } } });
      await settled();

      expect(within(await openFirstMeal()).getByText(expected)).toBeInTheDocument();
    });

    test("falls back to the balanced portion when the band has none", async () => {
      // The upstream data is uneven -- not every recipe carries all three.
      stubFetch({
        fallback: () => ({
          meals: [mealPayload("1", { portionByCalorie: { balanced: "A bowl" } })]
        })
      });
      renderView({ dashboard: { plans: [], goals: { targetCalories: 3000 } } });
      await settled();

      expect(within(await openFirstMeal()).getByText("A bowl")).toBeInTheDocument();
    });

    test("omits the note entirely when the recipe carries no portions", async () => {
      stubFetch({ fallback: () => ({ meals: [mealPayload("1")] }) });
      renderView();
      await settled();

      expect(within(await openFirstMeal()).queryAllByText(/cup|bowl/i)).toHaveLength(0);
    });
  });

  describe("the recipe search", () => {
    test("its section tells the visitor to search before one is run", async () => {
      // Empty sections are hidden from the All-courses view, so the prompt is
      // reached through the course filter.
      stubFetch();
      renderView();
      await settled();

      openCourse("Recipe results");
      expect(screen.getByText("Search above to see recipe ideas.")).toBeInTheDocument();
    });

    test("a submitted search names the query in the results subtitle", async () => {
      stubFetch({ byQuery: { tofu: () => ({ meals: [mealPayload("t1")] }) } });
      renderView();
      await settled();

      searchFor("tofu");

      expect(await screen.findByText('Results for "tofu".')).toBeInTheDocument();
    });

    test("a failing search surfaces the error rather than an empty grid", async () => {
      stubFetch({ byQuery: { tofu: { ok: false, json: async () => ({}) } } });
      renderView();
      await settled();

      searchFor("tofu");

      expect(await screen.findByText("Couldn't load recipes right now.")).toBeInTheDocument();
    });

    test("a search with no hits offers the default query", async () => {
      const fetchMock = stubFetch();
      renderView();
      await settled();

      searchFor("tofu");

      fireEvent.click(await screen.findByText('Try "chicken"'));
      await waitFor(() => expect(queriesSent(fetchMock)).toContain("chicken"));
    });
  });

  describe("failed recommendations", () => {
    test("surface the error the proxy produced", async () => {
      stubFetch({ fallback: { ok: false, json: async () => ({}) } });
      renderView();
      expect(
        await screen.findByText("Couldn't load meal suggestions right now.")
      ).toBeInTheDocument();
    });

    test("surface an outright rejection too", async () => {
      // A rejected promise is the offline case; a non-ok response is the proxy
      // returning an error. Both have to reach the visitor.
      stubFetch({ fallback: () => Promise.reject(new Error("offline")) });
      renderView();
      expect(await screen.findByText("offline")).toBeInTheDocument();
    });

    test("leave the recipe search usable", async () => {
      // The suggestions and the search are separate requests; one failing must
      // not take the other down.
      stubFetch({
        byQuery: { tofu: () => ({ meals: [mealPayload("t1")] }) },
        fallback: { ok: false, json: async () => ({}) }
      });
      renderView();
      await screen.findByText("Couldn't load meal suggestions right now.");

      searchFor("tofu");

      expect(await screen.findByText('Results for "tofu".')).toBeInTheDocument();
    });
  });

  describe("the course filter", () => {
    test("counts the meals in each course", async () => {
      stubFetch({
        byQuery: { chicken: () => ({ meals: [mealPayload("c1"), mealPayload("c2")] }) }
      });
      renderView();
      await settled();

      await waitFor(() => expect(courseCount("Protein-forward meals")).toBe("2"));
      expect(courseCount("All courses")).toBe("2");
    });

    test("counts an empty course as zero rather than omitting it from the filter", async () => {
      stubFetch();
      renderView();
      await settled();
      expect(courseCount("Seafood meals")).toBe("0");
    });

    test("opens on All courses", async () => {
      stubFetch();
      renderView();
      await settled();
      expect(coursePill("All courses")).toHaveClass("active");
    });

    test("All courses hides the sections that came back empty", async () => {
      // Every recipe query can legitimately return nothing, and a heading over
      // an empty grid reads as a failure rather than as no results.
      stubFetch({ byQuery: { chicken: () => ({ meals: [mealPayload("c1")] }) } });
      renderView();
      await settled();

      await screen.findByText("Meal c1");
      expect(displayedSectionTitles()).toEqual(["Protein-forward meals"]);
    });

    test.each([
      [500, "Approx. 500 calories"],
      [null, "Calories not provided"],
      [undefined, "Calories not provided"],
      ["", "Calories not provided"]
    ])("a card with %s calories reads %s", async (calories, expected) => {
      // Absent is spelled three ways upstream, and `Approx. 0 calories` on a
      // recipe that simply has no figure would be a made-up measurement.
      stubFetch({ fallback: () => ({ meals: [mealPayload("c1", { calories })] }) });
      renderView();
      await settled();
      await screen.findByText("Meal c1");

      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    test("says so when every course is empty", async () => {
      stubFetch();
      renderView();
      await settled();
      expect(screen.getByText("No course options are available right now.")).toBeInTheDocument();
    });

    test("picking a course shows only that one, empty or not", async () => {
      stubFetch({ byQuery: { chicken: () => ({ meals: [mealPayload("c1")] }) } });
      renderView();
      await settled();
      await screen.findByText("Meal c1");

      openCourse("Seafood meals");

      expect(displayedSectionTitles()).toEqual(["Seafood meals"]);
      expect(screen.getByText("No options available in this course yet.")).toBeInTheDocument();
      expect(screen.queryByText("Meal c1")).toBeNull();
    });

    test("a course that disappears resets the filter to All courses", async () => {
      // Changing the goal swaps the whole recommendation set, and the selected
      // course usually is not in the new one. Without the reset the visitor is
      // left on a filter that matches nothing.
      stubFetch({ fallback: () => ({ meals: [mealPayload("m1")] }) });
      const { rerender } = renderView({ dashboard: { plans: [{ goal: "Strength" }], goals: {} } });
      await settled("lean_strength");

      openCourse("Seafood meals");
      expect(coursePill("Seafood meals")).toHaveClass("active");

      rerender(
        <MealView
          dashboard={{ plans: [{ goal: "Fat loss" }], goals: {} }}
          fallbackPlan={null}
          mealLogForm={null}
          mealLogs={[]}
          setMealLogForm={vi.fn()}
          submitMealLog={vi.fn()}
        />
      );

      await waitFor(() => expect(coursePill("All courses")).toHaveClass("active"));
    });
  });

  describe("the details modal", () => {
    const richMeal = () =>
      stubFetch({
        fallback: () => ({
          meals: [
            mealPayload("m1", {
              ingredients: ["Rice", "Chicken"],
              recipes: [{ label: "Full recipe", url: "https://example.com/r" }]
            })
          ]
        })
      });

    const openMeal = async () => {
      await settled();
      const cards = await screen.findAllByText("Meal m1");
      fireEvent.click(cards[0]);
      return screen.getByRole("dialog");
    };

    test("is closed until a meal is picked", async () => {
      stubFetch({ fallback: () => ({ meals: [mealPayload("m1")] }) });
      renderView();
      await settled();
      await screen.findByText("Meal m1");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("shows the meal's ingredients and recipe links", async () => {
      richMeal();
      renderView();
      const dialog = await openMeal();

      expect(within(dialog).getByText("Rice")).toBeInTheDocument();
      expect(within(dialog).getByText("Full recipe")).toHaveAttribute(
        "href",
        "https://example.com/r"
      );
    });

    test("says so when a recipe carries neither", async () => {
      stubFetch({ fallback: () => ({ meals: [mealPayload("m1")] }) });
      renderView();
      const dialog = await openMeal();

      expect(within(dialog).getByText("No ingredient details available.")).toBeInTheDocument();
      expect(within(dialog).getByText("No recipe links available.")).toBeInTheDocument();
    });

    test("Escape closes it", async () => {
      richMeal();
      renderView();
      await openMeal();

      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    test("another key does not", async () => {
      richMeal();
      renderView();
      await openMeal();

      fireEvent.keyDown(window, { key: "Enter" });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("the close button closes it", async () => {
      richMeal();
      renderView();
      const dialog = await openMeal();

      fireEvent.click(within(dialog).getByLabelText("Close"));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    test("removes the very listener it added, rather than a fresh reference", async () => {
      // Nothing observable in the DOM distinguishes a leaked keydown listener
      // here -- every copy sets the same id to null -- so this is asserted on
      // the teardown directly. Removing a different function reference is the
      // usual way this breaks, and it fails silently.
      const added = vi.spyOn(window, "addEventListener");
      const removed = vi.spyOn(window, "removeEventListener");
      const keydownFns = (spy) =>
        spy.mock.calls.filter(([type]) => type === "keydown").map(([, fn]) => fn);

      richMeal();
      renderView();
      const dialog = await openMeal();
      const listener = keydownFns(added).at(-1);
      expect(listener).toBeTypeOf("function");

      fireEvent.click(within(dialog).getByLabelText("Close"));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      expect(keydownFns(removed)).toContain(listener);
    });

    test("Escape after closing does not reopen or throw", async () => {
      // The keydown listener is torn down with the modal; a stale one would
      // keep firing against every later render.
      richMeal();
      renderView();
      const dialog = await openMeal();
      fireEvent.click(within(dialog).getByLabelText("Close"));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      expect(() => fireEvent.keyDown(window, { key: "Escape" })).not.toThrow();
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("the meal log", () => {
    test("lists saved logs", async () => {
      renderView({
        mealLogs: [{ id: "1", date: "2026-09-01", mealType: "lunch", name: "Rice bowl" }]
      });
      await settled();
      expect(screen.getByText("2026-09-01")).toBeInTheDocument();
      expect(screen.getByText(/Lunch - Rice bowl/)).toBeInTheDocument();
    });

    test("a log saved without a type or a name still reads as a row", async () => {
      // Early rows predate the meal-type field, and a blank there would render
      // a dash with nothing after it.
      renderView({ mealLogs: [{ id: "1", date: "2026-09-01" }] });
      await settled();

      const row = screen.getByText("2026-09-01").parentElement;
      expect(row.textContent).toContain("Other");
      expect(row.textContent).not.toContain("Other -");
    });

    test("macros absent from a row read as dashes rather than zeroes", async () => {
      // `0 kcal` on a row that simply never recorded one is a made-up figure.
      renderView({ mealLogs: [{ id: "1", date: "2026-09-01", mealType: "lunch" }] });
      await settled();

      expect(screen.getByText(/-- kcal \| P -- \/ C -- \/\s*F --/)).toBeInTheDocument();
    });

    test("says so when there are none", async () => {
      renderView();
      await settled();
      expect(screen.getByText("No meal logs yet.")).toBeInTheDocument();
    });

    test.each([
      ["null", null],
      ["undefined", undefined],
      ["an object", {}],
      ["a string", "none"]
    ])("treats %s mealLogs as none rather than throwing", async (_label, mealLogs) => {
      // The server has returned null for collection fields before, and `null`
      // alone does not exercise the guard -- `mealLogs || []` handles that one
      // too. It is the truthy non-array that reaches `.slice` and throws.
      renderView({ mealLogs });
      await settled();
      expect(screen.getByText("No meal logs yet.")).toBeInTheDocument();
    });

    test("submitting calls the handler the dashboard passed in", async () => {
      const { submitMealLog } = renderView();
      await settled();

      fireEvent.submit(screen.getByText("Save meal log").closest("form"));
      expect(submitMealLog).toHaveBeenCalled();
    });

    test("editing a field reports the change", async () => {
      const { setMealLogForm } = renderView();
      await settled();

      fireEvent.change(screen.getByPlaceholderText("Chicken rice bowl"), {
        target: { value: "Oats" }
      });
      expect(setMealLogForm).toHaveBeenCalled();
    });

    describe("each field writes to its own key", () => {
      // Eight near-identical handlers, and what this guards is the copy-paste
      // that lands carbs in the protein field. Driven through real state
      // rather than by inspecting the updater: each handler closes over
      // `event.target` rather than over the value, so calling the recorded
      // updater afterwards reads whatever the DOM node holds by then -- which
      // for a controlled input React has already reset.
      test.each(FIELDS.map((field) => [field.label]))(
        "%s takes the value and leaves every other field alone",
        async (label) => {
          const field = FIELDS.find((entry) => entry.label === label);
          renderControlled();
          await settled();

          fireEvent.change(screen.getByLabelText(label), { target: { value: field.value } });

          expect(screen.getByLabelText(label)).toHaveValue(field.typed ?? field.value);
          for (const other of FIELDS) {
            if (other.label === label) continue;
            expect(screen.getByLabelText(other.label)).toHaveValue(other.empty);
          }
        }
      );
    });

    describe("the empty state's Log first meal button", () => {
      test("seeds today's date and focuses the name field", async () => {
        // Without the seed the visitor lands on a required date field with no
        // value and has to fill it before anything saves.
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
        try {
          const { setMealLogForm } = renderView();
          await vi.waitFor(() => expect(coursePill("All courses")).toBeTruthy());

          fireEvent.click(screen.getByText("Log first meal"));

          expect(setMealLogForm.mock.calls.at(-1)[0]({})).toEqual({
            date: "2026-09-10",
            mealType: "breakfast"
          });
          expect(document.activeElement).toBe(screen.getByPlaceholderText("Chicken rice bowl"));
        } finally {
          vi.useRealTimers();
        }
      });

      test("keeps a date and meal type the visitor already chose", async () => {
        const { setMealLogForm } = renderView();
        await settled();

        fireEvent.click(screen.getByText("Log first meal"));

        expect(
          setMealLogForm.mock.calls.at(-1)[0]({ date: "2026-01-01", mealType: "dinner" })
        ).toEqual({ date: "2026-01-01", mealType: "dinner" });
      });
    });

    test("a null mealLogForm renders the empty defaults rather than uncontrolled inputs", async () => {
      renderView({ mealLogForm: null });
      await settled();

      expect(screen.getByPlaceholderText("Chicken rice bowl")).toHaveValue("");
      expect(screen.getByDisplayValue("Breakfast")).toBeInTheDocument();
    });

    test("a supplied form is rendered as given", async () => {
      renderView({
        mealLogForm: {
          date: "2026-09-02",
          mealType: "dinner",
          name: "Steak",
          calories: "700",
          proteinG: "",
          carbsG: "",
          fatG: "",
          notes: ""
        }
      });
      await settled();

      expect(screen.getByPlaceholderText("Chicken rice bowl")).toHaveValue("Steak");
      expect(screen.getByDisplayValue("Dinner")).toBeInTheDocument();
    });

    test("a missing setMealLogForm does not break editing", async () => {
      // The dashboard has rendered this tab before its handlers were wired.
      renderView({ setMealLogForm: undefined });
      await settled();

      expect(() =>
        fireEvent.change(screen.getByPlaceholderText("Chicken rice bowl"), {
          target: { value: "Oats" }
        })
      ).not.toThrow();
    });

    test("a missing submitMealLog still prevents the page reloading", async () => {
      renderView({ submitMealLog: undefined });
      await settled();

      // fireEvent returns false when a handler called preventDefault.
      expect(fireEvent.submit(screen.getByText("Save meal log").closest("form"))).toBe(false);
    });
  });
});
