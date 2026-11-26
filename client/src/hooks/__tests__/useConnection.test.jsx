/**
 * Pins useConnection: it reads the connection store and re-renders when the
 * store changes.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import useConnection from "../useConnection";
import { markAnswered, markUnanswered } from "../../app/connection";

afterEach(() => {
  markAnswered();
});

describe("useConnection", () => {
  test("reads online, then offline when a request goes unanswered, then online again", () => {
    const { result } = renderHook(() => useConnection());
    expect(result.current).toBe("online");

    act(() => markUnanswered());
    expect(result.current).toBe("offline");

    act(() => markAnswered());
    expect(result.current).toBe("online");
  });
});
