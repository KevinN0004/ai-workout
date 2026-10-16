/**
 * "Show more" past the dashboard's first page of one log collection. The Logs
 * view (WorkoutsView) calls it for meal logs and for progress metrics, and it
 * fetches each older page from that collection's paged GET route.
 */
import { useState } from "react";
import { fetchWithTimeout } from "../../../app/network";

// Rows per request, inside the limit dashboardPaginationQuerySchema accepts
// (server/src/routes/dashboard/validation.js).
const LOG_PAGE_SIZE = 50;

/**
 * Pages through `collection` ("mealLogs" or "progressMetrics") from `path`,
 * its paged route. `heldItems` is the list the dashboard already holds, pending
 * entries included, and `total` the collection's size from the dashboard
 * response, or undefined when that is unknown, as it is for a cached
 * dashboard. Returns `items`, the rows fetched so far; `hasMore`, whether the
 * server holds rows past them; `loading`; `error`; and `loadMore`, which asks
 * for the next page. What it has fetched lasts until the view unmounts.
 */
export default function useOlderLogPages({ path, collection, heldItems, total }) {
  const [fetched, setFetched] = useState({ items: [], nextOffset: null, total: undefined });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // A pending entry is not on the server yet, so it does not count towards the
  // offset of the next page.
  const heldServerItems = heldItems.filter((item) => !item?.isOptimistic);
  const started = fetched.nextOffset !== null;
  const nextOffset = started ? fetched.nextOffset : heldServerItems.length;
  const knownTotal = started ? fetched.total : total;
  const hasMore = typeof knownTotal === "number" && nextOffset < knownTotal;

  const loadMore = async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        limit: String(LOG_PAGE_SIZE),
        offset: String(nextOffset)
      });
      const res = await fetchWithTimeout(`${path}?${query}`, { credentials: "include" }, 12000);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      const page = Array.isArray(data?.[collection]) ? data[collection] : [];
      // The first fetch copies in the dashboard's page as it stands. A log
      // saved while the view is open pushes that page's oldest row onto the
      // next one, and without the copy it would fall between the two.
      setFetched({
        items: [...(started ? fetched.items : heldServerItems), ...page],
        nextOffset: nextOffset + page.length,
        total: data?.pagination?.total
      });
    } catch {
      setError("Unable to load older entries. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return { items: fetched.items, hasMore, loading, error, loadMore };
}
