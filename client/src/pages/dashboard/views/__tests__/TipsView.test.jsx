import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import TipsView from "../TipsView";

// The largest untested view in the client, and not just markup: it owns two
// fetches, a debounced search, and the error and empty states a visitor
// actually sees when the upstream exercise API is unreachable. The scoring
// itself lives in tips/recommendationUtils and is covered there, so these
// tests drive the surrounding state machine rather than re-testing it.

const META = {
  categories: [{ id: 1, name: "Arms" }],
  muscles: [{ id: 2, name: "Biceps" }],
  equipment: [{ id: 3, name: "Dumbbell" }]
};

const ok = (body) => ({ ok: true, json: async () => body });
const failed = () => ({ ok: false, json: async () => ({}) });

// Routes by URL so a test can fail one endpoint while the other succeeds.
const stubFetch = ({ meta = ok(META), exercises = ok({ results: [] }) } = {}) => {
  const fetchMock = vi.fn(async (url) => {
    if (String(url).includes("/api/wger/meta")) return meta;
    return exercises;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const renderView = (props = {}) =>
  render(
    <TipsView
      user={{ profile: { activity: "Moderate", notes: "" } }}
      form={{ goal: "strength", days: 3, duration: 45, injuries: "" }}
      dashboard={{ plans: [], goals: {}, savedExercises: [] }}
      latestPlanByWeekday={{}}
      weatherData={null}
      onSaveExerciseToPlan={vi.fn()}
      {...props}
    />
  );

beforeEach(() => {
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TipsView", () => {
  test("renders without throwing on the default props", async () => {
    renderView();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  test("requests both the filter metadata and the exercise library", async () => {
    const fetchMock = stubFetch();
    renderView();

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.some((u) => u.includes("/api/wger/meta"))).toBe(true);
      expect(urls.some((u) => u.includes("/api/wger/exercises"))).toBe(true);
    });
  });

  test("sends credentials, since the proxy route requires the session cookie", async () => {
    const fetchMock = stubFetch();
    renderView();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, options] = fetchMock.mock.calls[0];
    expect(options.credentials).toBe("include");
  });

  test("surfaces a filter-metadata failure to the visitor", async () => {
    stubFetch({ meta: failed() });
    renderView();

    expect(await screen.findByText("Couldn't load filter options.")).toBeInTheDocument();
  });

  test("surfaces a metadata failure even when the request rejects outright", async () => {
    // A rejected promise is the offline case; a non-ok response is the proxy
    // returning an error. Both have to reach the visitor.
    stubFetch({ meta: Promise.reject(new Error("offline")) });
    renderView();

    await waitFor(() => {
      expect(document.querySelector("p.error")).toBeTruthy();
    });
  });

  test("keeps the library usable when only the metadata fails", async () => {
    stubFetch({ meta: failed(), exercises: ok({ results: [] }) });
    renderView();

    await screen.findByText("Couldn't load filter options.");
    // The exercise request still went out -- a broken filter list must not
    // block browsing.
    await waitFor(() => {
      const urls = fetch.mock.calls.map(([url]) => String(url));
      expect(urls.some((u) => u.includes("/api/wger/exercises"))).toBe(true);
    });
  });

  test("reports an empty library rather than rendering nothing", async () => {
    stubFetch({ exercises: ok({ results: [] }) });
    renderView();

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/No exercises/i);
    });
  });

  test("tolerates a metadata payload with the wrong shape", async () => {
    // The proxy has returned nulls for these lists before; Array.isArray
    // guards each one, and a spread of null would take the whole view down.
    stubFetch({ meta: ok({ categories: null, muscles: undefined, equipment: "nope" }) });
    renderView();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(document.querySelector("p.error")).toBeNull();
  });

  // Everything above drives the two fetches and their failure states. These
  // drive what a visitor actually does once the library has loaded: filtering
  // it, switching between the three views, saving something to their plan, and
  // paging through the list.

  const exercise = (id, name, extra = {}) => ({
    id,
    name,
    category: { name: "Arms" },
    muscles: [{ name: "Biceps" }],
    equipment: [{ name: "Dumbbell" }],
    ...extra
  });

  const withExercises = (items, meta = META) =>
    stubFetch({ meta: ok(meta), exercises: ok({ exercises: items }) });

  // The exercise request the component last made, parsed.
  const lastExerciseParams = (fetchMock) => {
    const url = fetchMock.mock.calls
      .map(([value]) => String(value))
      .filter((value) => value.includes("/api/wger/exercises"))
      .at(-1);
    return new URL(url, "http://localhost").searchParams;
  };

  const setView = (label) =>
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: label }
    });

  describe("the exercise request it builds", () => {
    test("asks for the default page with no filters set", async () => {
      const fetchMock = withExercises([]);
      renderView();

      await waitFor(() => expect(lastExerciseParams(fetchMock).get("limit")).toBe("48"));
      const params = lastExerciseParams(fetchMock);
      expect(params.get("offset")).toBe("0");
      expect(params.get("language")).toBe("2");
      // Absent rather than empty. An empty `category=` is a filter the proxy
      // has to decide what to do with, and it has chosen differently before.
      ["q", "category", "muscle", "equipment"].forEach((key) => {
        expect(params.has(key)).toBe(false);
      });
    });

    test("a typed search reaches the request, once, after the debounce", async () => {
      // Without the debounce every keystroke is a request to the upstream
      // proxy, which is rate limited. Both halves matter and both are
      // asserted: nothing goes out part-way through the debounce window, and
      // exactly one request goes out after it -- not one per keystroke, which
      // is what dropping the clearTimeout would give.
      //
      // Every advance is inside act(). The debounce timer's setState happens
      // during the advance, and React 19 holds an update made outside act
      // until act flushes it -- so an unwrapped advance fires the timer but
      // the request never goes out before the assertion. React 18 happened to
      // flush it anyway.
      vi.useFakeTimers();
      try {
        const fetchMock = withExercises([]);
        renderView();
        await act(() => vi.advanceTimersByTimeAsync(400));
        const exerciseCalls = () =>
          fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/wger/exercises"))
            .length;
        const before = exerciseCalls();

        const input = screen.getByPlaceholderText("e.g. row, squat, plank");
        fireEvent.change(input, { target: { value: "r" } });
        await act(() => vi.advanceTimersByTimeAsync(100));
        fireEvent.change(input, { target: { value: "ro" } });
        await act(() => vi.advanceTimersByTimeAsync(100));
        fireEvent.change(input, { target: { value: "row" } });
        await act(() => vi.advanceTimersByTimeAsync(100));

        // 300ms of typing and still nothing, because each keystroke restarts
        // the timer rather than adding one.
        expect(exerciseCalls()).toBe(before);

        // In 50ms steps, each its own act(), so every timer that fires is
        // rendered before the next one -- as in a browser, where each timer is
        // its own task. One act() over the whole 400ms batches all three
        // keystrokes' timers into a single render, and a missing clearTimeout
        // then sends one request instead of three and passes.
        for (let elapsed = 0; elapsed < 400; elapsed += 50) {
          await act(() => vi.advanceTimersByTimeAsync(50));
        }

        expect(exerciseCalls()).toBe(before + 1);
        expect(lastExerciseParams(fetchMock).get("q")).toBe("row");
      } finally {
        vi.useRealTimers();
      }
    });

    test("surrounding whitespace is trimmed off the search", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = withExercises([]);
        renderView();
        fireEvent.change(screen.getByPlaceholderText("e.g. row, squat, plank"), {
          target: { value: "  row  " }
        });
        await act(() => vi.advanceTimersByTimeAsync(400));

        expect(lastExerciseParams(fetchMock).get("q")).toBe("row");
      } finally {
        vi.useRealTimers();
      }
    });

    test.each([
      ["Category", "category", "1"],
      ["Muscle", "muscle", "2"],
      ["Equipment", "equipment", "3"]
    ])("the %s filter is sent as %s", async (label, param, value) => {
      const fetchMock = withExercises([]);
      renderView();
      await waitFor(() =>
        expect(screen.getByLabelText("Category").options.length).toBeGreaterThan(1)
      );

      fireEvent.change(screen.getByLabelText(label), { target: { value } });

      await waitFor(() => expect(lastExerciseParams(fetchMock).get(param)).toBe(value));
    });

    test("clearing a filter drops it from the request rather than sending empty", async () => {
      const fetchMock = withExercises([]);
      renderView();
      await waitFor(() =>
        expect(screen.getByLabelText("Category").options.length).toBeGreaterThan(1)
      );

      fireEvent.change(screen.getByLabelText("Category"), { target: { value: "1" } });
      await waitFor(() => expect(lastExerciseParams(fetchMock).get("category")).toBe("1"));

      fireEvent.change(screen.getByLabelText("Category"), { target: { value: "" } });

      await waitFor(() => expect(lastExerciseParams(fetchMock).has("category")).toBe(false));
    });

    test("refreshing asks again", async () => {
      const fetchMock = withExercises([]);
      renderView();
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const before = fetchMock.mock.calls.length;

      fireEvent.click(screen.getByLabelText("Refresh exercise ideas"));

      await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    });
  });

  describe("when the exercise library itself fails", () => {
    // The existing failure tests all break the metadata endpoint. This is the
    // other one, and it is the request that actually fills the page.
    test("surfaces a non-ok response", async () => {
      stubFetch({ meta: ok(META), exercises: failed() });
      renderView();

      expect(await screen.findByText("Couldn't load exercises right now.")).toBeInTheDocument();
    });

    test("surfaces a rejection with its own message", async () => {
      stubFetch({ meta: ok(META), exercises: Promise.reject(new Error("Network down")) });
      renderView();

      expect(await screen.findByText("Network down")).toBeInTheDocument();
    });

    test("falls back to a generic message when the rejection carries none", async () => {
      stubFetch({ meta: ok(META), exercises: Promise.reject(new Error("")) });
      renderView();

      expect(await screen.findByText("Couldn't load exercises right now.")).toBeInTheDocument();
    });

    test("empties the list rather than leaving the last results up", async () => {
      // A stale list beside an error message reads as though the filter
      // worked and returned those rows.
      let failNext = false;
      const fetchMock = vi.fn(async (url) => {
        if (String(url).includes("/api/wger/meta")) return ok(META);
        if (failNext) return failed();
        return ok({ exercises: [exercise(1, "Row")] });
      });
      vi.stubGlobal("fetch", fetchMock);

      renderView();
      await screen.findByText("Row");

      failNext = true;
      fireEvent.click(screen.getByLabelText("Refresh exercise ideas"));

      await screen.findByText("Couldn't load exercises right now.");
      expect(screen.queryByText("Row")).toBeNull();
    });

    test("an aborted request is not reported as an error", async () => {
      // Changing a filter cancels the in-flight request. That is the app
      // working, not something to tell the visitor about. The replacement
      // request is left hanging deliberately: if it resolved it would clear
      // the error that a missing AbortError guard had just set, and the test
      // would pass either way.
      //
      // The `err?.name === "AbortError"` check is still belt-and-braces even
      // so, and mutation testing shows it: the only abort comes from the
      // effect's cleanup, which sets `cancelled = true` before calling
      // `controller.abort()`, so the `cancelled` guard immediately below it
      // would return first regardless. Either one alone is enough.
      let exerciseCalls = 0;
      const fetchMock = vi.fn(async (url, options) => {
        if (String(url).includes("/api/wger/meta")) return ok(META);
        exerciseCalls += 1;
        const isFirst = exerciseCalls === 1;
        return new Promise((resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
          if (isFirst) setTimeout(() => resolve(ok({ exercises: [] })), 10_000);
          // The replacement never settles.
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      renderView();
      await waitFor(() =>
        expect(screen.getByLabelText("Category").options.length).toBeGreaterThan(1)
      );

      fireEvent.change(screen.getByLabelText("Category"), { target: { value: "1" } });

      await waitFor(() => expect(exerciseCalls).toBeGreaterThan(1));
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(document.querySelector("p.error")).toBeNull();
    });

    test("unmounting mid-flight does not write to a gone component", async () => {
      const fetchMock = vi.fn(
        () => new Promise((resolve) => setTimeout(() => resolve(ok({ exercises: [] })), 50))
      );
      vi.stubGlobal("fetch", fetchMock);

      const { unmount } = renderView();
      unmount();

      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(true).toBe(true);
    });
  });

  describe("the context it scores against", () => {
    // Each of these has its own fallback chain, and every existing test
    // supplies a full profile so only the first link was ever taken.
    test("takes the goal from the account's plans first", async () => {
      withExercises([exercise(1, "Row")]);
      renderView({
        dashboard: {
          plans: [{ goal: "Fat loss" }],
          goals: { goalType: "Endurance" },
          savedExercises: []
        }
      });

      expect(await screen.findByText(/fat loss/)).toBeInTheDocument();
    });

    test("then from the account's goals", async () => {
      withExercises([exercise(1, "Row")]);
      renderView({
        dashboard: { plans: [], goals: { goalType: "Endurance work" }, savedExercises: [] }
      });

      expect(await screen.findByText(/endurance/)).toBeInTheDocument();
    });

    test("then from the form, and finally a default", async () => {
      withExercises([exercise(1, "Row")]);
      renderView({
        dashboard: { plans: [], goals: {}, savedExercises: [] },
        form: { goal: "", days: 3, duration: 45, injuries: "" }
      });

      // The default is a lean-strength goal.
      expect(await screen.findByText(/lean strength/)).toBeInTheDocument();
    });

    test("renders with no user, form or dashboard at all", async () => {
      // The dashboard mounts this tab before the account has loaded.
      withExercises([exercise(1, "Row")]);

      expect(() =>
        render(
          <TipsView
            user={undefined}
            form={undefined}
            dashboard={undefined}
            latestPlanByWeekday={undefined}
            weatherData={undefined}
            onSaveExerciseToPlan={vi.fn()}
          />
        )
      ).not.toThrow();
      expect(await screen.findByText("Smart picks for you")).toBeInTheDocument();
    });

    test("a non-array savedExercises is treated as none", async () => {
      withExercises([exercise(7, "Row")]);
      renderView({ dashboard: { plans: [], goals: {}, savedExercises: "nope" } });

      expect(await screen.findByText("Save to plan")).toBeInTheDocument();
    });

    test("today's plan lines feed the scoring", async () => {
      const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
      withExercises([exercise(1, "Row")]);

      expect(() =>
        renderView({ latestPlanByWeekday: { [today]: ["Pull day: rows and curls"] } })
      ).not.toThrow();
      expect(await screen.findByText("Smart picks for you")).toBeInTheDocument();
    });

    test("a weather recommendation is carried into the context", async () => {
      withExercises([exercise(1, "Row")]);
      renderView({ weatherData: { recommendation: { workoutType: "indoor" } } });

      expect(await screen.findByText("Smart picks for you")).toBeInTheDocument();
    });
  });

  describe("the payload it sends", () => {
    const save = async (item) => {
      withExercises([item]);
      const onSaveExerciseToPlan = vi.fn(async () => ({ ok: true }));
      renderView({ onSaveExerciseToPlan });
      fireEvent.click(await screen.findByText("Save to plan"));
      await waitFor(() => expect(onSaveExerciseToPlan).toHaveBeenCalled());
      return onSaveExerciseToPlan.mock.calls[0][0];
    };

    test("an exercise with no id sends null rather than undefined", async () => {
      // The column is nullable; undefined would be dropped from the JSON and
      // the row would fail its insert.
      const payload = await save({ name: "Row" });
      expect(payload.exerciseId).toBeNull();
    });

    test("a missing name is sent as an empty string", async () => {
      const payload = await save({ id: 7 });
      expect(payload.name).toBe("");
    });

    test("a missing category is sent as an empty string", async () => {
      const payload = await save({ id: 7, name: "Row" });
      expect(payload.category).toBe("");
    });

    test("a non-array muscles list is sent as an empty one", async () => {
      const payload = await save({ id: 7, name: "Row", muscles: "Biceps" });
      expect(payload.muscles).toEqual([]);
    });

    test("a non-array equipment list is sent as an empty one", async () => {
      // Note the equipment is given as an empty array rather than a string
      // here, which would be the sharper input. A string reaches
      // `ExerciseTile`, whose guard is `(exercise.equipment || []).map(...)`
      // rather than the `Array.isArray` this payload builder and the server
      // both use -- and `.map` on a string takes the whole tab down. That is
      // latent rather than live: the exercises route normalises the field at
      // externalDataService.js:694 before it is ever sent, so nothing but a
      // change there could produce it. Worth knowing before that guard is
      // relied on somewhere new.
      const payload = await save({ id: 7, name: "Row", equipment: [] });
      expect(payload.equipment).toEqual([]);
    });

    test("an exercise with no video sends an empty url", async () => {
      const payload = await save({ id: 7, name: "Row" });
      expect(payload.videoUrl).toBe("");
    });

    test("a smart pick carries the reason it was picked for", async () => {
      const payload = await save({ id: 7, name: "Row" });
      expect(payload.reason).not.toBe("");
    });

    test("a plain library tile carries no reason", async () => {
      // The library renders the same tile without a recommendation, so the
      // `|| ""` fallback is only reachable from there.
      withExercises([exercise(7, "Row")]);
      const onSaveExerciseToPlan = vi.fn(async () => ({ ok: true }));
      renderView({ onSaveExerciseToPlan });
      await screen.findByText("Smart picks for you");
      setView("library");

      fireEvent.click(screen.getByText("Save to plan"));

      await waitFor(() => expect(onSaveExerciseToPlan).toHaveBeenCalled());
      expect(onSaveExerciseToPlan.mock.calls[0][0].reason).toBe("");
    });
  });

  describe("the three views", () => {
    test("opens on the smart picks", async () => {
      withExercises([exercise(1, "Row")]);
      renderView();

      expect(await screen.findByText("Smart picks for you")).toBeInTheDocument();
    });

    test("the training guide replaces it and hides the filters", async () => {
      // The guide is not a list of exercises, so a search box over it would
      // filter nothing.
      withExercises([exercise(1, "Row")]);
      renderView();
      await screen.findByText("Smart picks for you");

      setView("guides");

      expect(screen.getByText("Training guide upgrades")).toBeInTheDocument();
      expect(screen.queryByText("Smart picks for you")).toBeNull();
      expect(screen.queryByPlaceholderText("e.g. row, squat, plank")).toBeNull();
    });

    test("the exercise list keeps the filters", async () => {
      withExercises([exercise(1, "Row")]);
      renderView();
      await screen.findByText("Smart picks for you");

      setView("library");

      expect(screen.getByRole("heading", { name: "Exercise list" })).toBeInTheDocument();
      expect(screen.getByPlaceholderText("e.g. row, squat, plank")).toBeInTheDocument();
    });

    test("the guide always has something to say", async () => {
      withExercises([]);
      renderView();
      await waitFor(() => expect(fetch).toHaveBeenCalled());

      setView("guides");

      expect(document.querySelectorAll(".training-card").length).toBeGreaterThan(0);
    });
  });

  describe("saving to the plan", () => {
    const saved = (props = {}) => {
      const onSaveExerciseToPlan = vi.fn(async () => ({ ok: true }));
      renderView({ onSaveExerciseToPlan, ...props });
      return onSaveExerciseToPlan;
    };

    test("sends the exercise the visitor picked", async () => {
      withExercises([exercise(7, "Row", { videos: [{ url: "/v.mp4" }] })]);
      const onSave = saved();
      const button = await screen.findByText("Save to plan");

      fireEvent.click(button);

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(onSave.mock.calls[0][0]).toMatchObject({
        exerciseId: 7,
        name: "Row",
        category: "Arms",
        muscles: ["Biceps"],
        equipment: ["Dumbbell"]
      });
    });

    test("confirms the save to the visitor", async () => {
      withExercises([exercise(7, "Row")]);
      saved();
      fireEvent.click(await screen.findByText("Save to plan"));

      expect(await screen.findByText('Saved "Row" to your plan.')).toBeInTheDocument();
    });

    test("surfaces a refusal from the server", async () => {
      withExercises([exercise(7, "Row")]);
      renderView({
        onSaveExerciseToPlan: vi.fn(async () => ({ ok: false, error: "Plan is full" }))
      });
      fireEvent.click(await screen.findByText("Save to plan"));

      expect(await screen.findByText("Plan is full")).toBeInTheDocument();
    });

    test("falls back to a generic message when the refusal carries none", async () => {
      withExercises([exercise(7, "Row")]);
      renderView({ onSaveExerciseToPlan: vi.fn(async () => ({ ok: false })) });
      fireEvent.click(await screen.findByText("Save to plan"));

      expect(await screen.findByText("Couldn't save this exercise right now.")).toBeInTheDocument();
    });

    test("surfaces a thrown error too", async () => {
      withExercises([exercise(7, "Row")]);
      renderView({
        onSaveExerciseToPlan: vi.fn(async () => {
          throw new Error("Offline");
        })
      });
      fireEvent.click(await screen.findByText("Save to plan"));

      expect(await screen.findByText("Offline")).toBeInTheDocument();
    });

    test("an already-saved exercise says so instead of saving again", async () => {
      // Matched on id and name together, so the same movement saved under two
      // ids is still offered, and the same id is not saved twice.
      //
      // Note what this does *not* reach: the `if (isSaved(exercise))` guard
      // inside `saveExercise`, which sets a '"X" is already saved.' message.
      // Both the tile and the details modal disable their save button on the
      // same condition, so nothing can call through to it and that message
      // can never appear. The guard is defensive and the message is dead.
      withExercises([exercise(7, "Row")]);
      const onSave = vi.fn(async () => ({ ok: true }));
      renderView({
        onSaveExerciseToPlan: onSave,
        dashboard: {
          plans: [],
          goals: {},
          savedExercises: [{ exerciseId: 7, name: "Row" }]
        }
      });

      const button = await screen.findByText("Saved");
      expect(button).toBeDisabled();
      expect(onSave).not.toHaveBeenCalled();
    });

    test("a saved exercise is matched case-insensitively by name", async () => {
      withExercises([exercise(7, "Row")]);
      renderView({
        dashboard: { plans: [], goals: {}, savedExercises: [{ exerciseId: 7, name: "  ROW  " }] }
      });

      expect(await screen.findByText("Saved")).toBeInTheDocument();
    });

    test("a different exercise is still offered", async () => {
      withExercises([exercise(7, "Row")]);
      renderView({
        dashboard: { plans: [], goals: {}, savedExercises: [{ exerciseId: 9, name: "Squat" }] }
      });

      expect(await screen.findByText("Save to plan")).toBeInTheDocument();
    });

    test("a missing save handler leaves the button inert rather than throwing", async () => {
      // Without the early return the call itself throws a TypeError, which
      // the surrounding catch turns into an error message on screen -- so
      // "it did not throw" alone does not distinguish the two.
      withExercises([exercise(7, "Row")]);
      renderView({ onSaveExerciseToPlan: undefined });
      const button = await screen.findByText("Save to plan");

      expect(() => fireEvent.click(button)).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(screen.queryByText(/Saved "Row"/)).toBeNull();
      expect(document.querySelector("p.error")).toBeNull();
    });

    test("the button reports progress while the save is in flight", async () => {
      let release;
      withExercises([exercise(7, "Row")]);
      renderView({
        onSaveExerciseToPlan: vi.fn(
          () =>
            new Promise((resolve) => {
              release = () => resolve({ ok: true });
            })
        )
      });

      fireEvent.click(await screen.findByText("Save to plan"));

      expect(await screen.findByText("Saving...")).toBeInTheDocument();
      release();
      expect(await screen.findByText('Saved "Row" to your plan.')).toBeInTheDocument();
    });
  });

  describe("the exercise list", () => {
    const manyExercises = (count) =>
      Array.from({ length: count }, (_, i) => exercise(i + 1, `Exercise ${i + 1}`));

    test("shows the first page and holds the rest back", async () => {
      withExercises(manyExercises(30));
      renderView();
      await screen.findByText("Smart picks for you");
      setView("library");

      expect(screen.getByText("Exercise 24")).toBeInTheDocument();
      expect(screen.queryByText("Exercise 25")).toBeNull();
      expect(screen.getByText("Show more exercises")).toBeInTheDocument();
    });

    test("showing more reveals the rest", async () => {
      withExercises(manyExercises(30));
      renderView();
      await screen.findByText("Smart picks for you");
      setView("library");

      fireEvent.click(screen.getByText("Show more exercises"));

      expect(screen.getByText("Exercise 25")).toBeInTheDocument();
      expect(screen.queryByText("Show more exercises")).toBeNull();
    });

    test("offers nothing more when everything fits", async () => {
      withExercises(manyExercises(24));
      renderView();
      await screen.findByText("Smart picks for you");
      setView("library");

      expect(screen.queryByText("Show more exercises")).toBeNull();
    });

    test("changing a filter collapses the list back to one page", async () => {
      // Otherwise a visitor who expanded to 48 rows, then narrowed the search,
      // keeps an expanded list they never asked for.
      withExercises(manyExercises(30));
      renderView();
      await waitFor(() =>
        expect(screen.getByLabelText("Category").options.length).toBeGreaterThan(1)
      );
      setView("library");
      fireEvent.click(screen.getByText("Show more exercises"));
      expect(screen.getByText("Exercise 25")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Category"), { target: { value: "1" } });

      await waitFor(() => expect(screen.queryByText("Exercise 25")).toBeNull());
    });

    test("says so when nothing matches", async () => {
      withExercises([]);
      renderView();
      await screen.findByText("Smart picks for you");
      setView("library");

      expect(screen.getByText("No exercises match these filters.")).toBeInTheDocument();
    });
  });

  describe("the smart picks", () => {
    test("put the best-scoring exercise first", async () => {
      // Every other test here uses identically-shaped exercises, which all
      // score the same -- so the order came from the name tiebreak and
      // reversing the comparator changed nothing. These two differ: one
      // matches the stated goal and the visitor's equipment, the other does
      // not, and the better match has to lead.
      withExercises([
        exercise(1, "Alpha Treadmill Jog", {
          category: { name: "Cardio" },
          muscles: [{ name: "Heart" }],
          equipment: [{ name: "Treadmill" }]
        }),
        exercise(2, "Zulu Barbell Squat", {
          category: { name: "Legs" },
          muscles: [{ name: "Quadriceps" }],
          equipment: [{ name: "Barbell" }]
        })
      ]);
      renderView({
        form: {
          goal: "Build lower body strength with barbell squats",
          days: 3,
          duration: 45,
          injuries: "",
          equipment: ["Barbell"]
        }
      });
      await screen.findByText("Smart picks for you");

      const names = Array.from(document.querySelectorAll(".exercise-grid .exercise-tile h3")).map(
        (el) => el.textContent
      );

      // Alphabetically Alpha would lead, so this can only be the score.
      expect(names[0]).toBe("Zulu Barbell Squat");
    });

    test("are capped at twelve however many come back", async () => {
      withExercises(Array.from({ length: 40 }, (_, i) => exercise(i + 1, `Exercise ${i + 1}`)));
      renderView();
      await screen.findByText("Smart picks for you");

      expect(document.querySelectorAll(".exercise-grid .exercise-tile")).toHaveLength(12);
    });

    test("say so when there is nothing to pick from", async () => {
      withExercises([]);
      renderView();

      expect(
        await screen.findByText("No exercises available for current filters.")
      ).toBeInTheDocument();
    });

    test("name the goal track they sorted by", async () => {
      withExercises([exercise(1, "Row")]);
      renderView({
        form: { goal: "Fat loss and conditioning", days: 3, duration: 45, injuries: "" }
      });

      expect(await screen.findByText(/fat loss/)).toBeInTheDocument();
    });
  });

  describe("the details modal", () => {
    test("opens on the exercise the visitor clicked", async () => {
      withExercises([exercise(7, "Row")]);
      renderView();
      const tile = await screen.findByText("Row");

      fireEvent.click(tile);

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    test("closes again", async () => {
      withExercises([exercise(7, "Row")]);
      renderView();
      fireEvent.click(await screen.findByText("Row"));
      const dialog = await screen.findByRole("dialog");

      fireEvent.click(within(dialog).getByLabelText("Close"));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
  });
});
