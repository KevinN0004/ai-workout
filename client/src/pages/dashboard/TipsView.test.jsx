import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import TipsView from "./TipsView";

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
});
