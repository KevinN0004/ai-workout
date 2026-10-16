import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import useOlderLogPages from "../useOlderLogPages";

// Pins how the Logs view pages past the dashboard's first page: which offset
// it asks for, what it keeps, and when it stops. fetch is stubbed at the
// network boundary; fetchWithTimeout around it is the real one.

const PATH = "/api/dashboard/meal-logs";

const row = (id, extra = {}) => ({ id, date: "2026-01-01", ...extra });

const respond = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

const stubFetch = (...responses) => {
  const fetchMock = vi.fn();
  responses.forEach((response) => fetchMock.mockResolvedValueOnce(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const render = ({ heldItems = [row("a"), row("b")], total } = {}) =>
  renderHook(() => useOlderLogPages({ path: PATH, collection: "mealLogs", heldItems, total }));

const requestedUrl = (fetchMock, call = 0) => String(fetchMock.mock.calls[call][0]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useOlderLogPages", () => {
  test("has nothing more to offer without a total", () => {
    // A cached dashboard carries no pagination, so the server's size is unknown.
    const { result } = render({ total: undefined });

    expect(result.current.hasMore).toBe(false);
  });

  test("has more while the dashboard holds fewer rows than the server", () => {
    expect(render({ total: 5 }).result.current.hasMore).toBe(true);
    expect(render({ total: 2 }).result.current.hasMore).toBe(false);
  });

  test("asks for the page that starts after the rows the dashboard holds", async () => {
    const fetchMock = stubFetch(respond({ mealLogs: [], pagination: { total: 5 } }));
    const { result } = render({ total: 5 });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(requestedUrl(fetchMock)).toBe(`${PATH}?limit=50&offset=2`);
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  test("does not count a pending entry towards the offset", async () => {
    const fetchMock = stubFetch(respond({ mealLogs: [], pagination: { total: 3 } }));
    const { result } = render({
      heldItems: [row("optimistic-1", { isOptimistic: true }), row("a")],
      total: 3
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(requestedUrl(fetchMock)).toBe(`${PATH}?limit=50&offset=1`);
  });

  test("keeps the dashboard's page beside the one it fetched", async () => {
    stubFetch(respond({ mealLogs: [row("c"), row("d")], pagination: { total: 4 } }));
    const { result } = render({ total: 4 });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.items.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(result.current.hasMore).toBe(false);
  });

  test("asks for the page after the last one it fetched", async () => {
    const fetchMock = stubFetch(
      respond({ mealLogs: [row("c"), row("d")], pagination: { total: 6 } }),
      respond({ mealLogs: [row("e"), row("f")], pagination: { total: 6 } })
    );
    const { result } = render({ total: 6 });

    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.hasMore).toBe(true);
    await act(async () => {
      await result.current.loadMore();
    });

    expect(requestedUrl(fetchMock, 1)).toBe(`${PATH}?limit=50&offset=4`);
    expect(result.current.items.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(result.current.hasMore).toBe(false);
  });

  test("a refused request says so and keeps what it had", async () => {
    stubFetch(respond({}, false));
    const { result } = render({ total: 5 });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.error).toBe("Unable to load older entries. Try again.");
    expect(result.current.items).toEqual([]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  test("a body without the collection is an empty page, and paging stops", async () => {
    stubFetch(respond({}));
    const { result } = render({ total: 5 });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.error).toBe("");
  });
});
