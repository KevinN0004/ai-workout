import { beforeEach, describe, expect, test, vi } from "vitest";

// Hoisted so vi.mock (which is itself hoisted) can close over these.
const pdf = vi.hoisted(() => ({
  save: vi.fn(),
  text: vi.fn(),
  addPage: vi.fn(),
  splitTextToSize: vi.fn(),
  construct: vi.fn()
}));

vi.mock("jspdf", () => ({
  jsPDF: function jsPDF(options) {
    pdf.construct(options);
    return {
      internal: { pageSize: { getWidth: () => 612, getHeight: () => 792 } },
      splitTextToSize: pdf.splitTextToSize,
      text: pdf.text,
      addPage: pdf.addPage,
      save: pdf.save
    };
  }
}));

const { createAppEventHandlers } = await import("./events.js");

// The factory destructures a large dependency bag but only reads it inside the
// individual handlers, so the PDF path needs nothing but `result` and the error
// setter its failure branch calls.
const buildHandlers = (result) => {
  const setError = vi.fn();
  return { ...createAppEventHandlers({ result, setError }), setError };
};

describe("downloadPlanPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdf.splitTextToSize.mockReturnValue(["line one", "line two"]);
  });

  test("renders the plan text and saves it under the expected filename", async () => {
    const { downloadPlanPdf } = buildHandlers("Monday\nSquats 3x5");
    await downloadPlanPdf();

    expect(pdf.construct).toHaveBeenCalledWith({ unit: "pt", format: "letter" });
    expect(pdf.splitTextToSize).toHaveBeenCalledWith("Monday\nSquats 3x5", 612 - 48 * 2);
    expect(pdf.text.mock.calls.map((call) => call[0])).toEqual(["line one", "line two"]);
    expect(pdf.save).toHaveBeenCalledWith("ai-workout-plan.pdf");
  });

  test("does nothing when there is no plan text", async () => {
    const { downloadPlanPdf } = buildHandlers("");
    await downloadPlanPdf();

    expect(pdf.construct).not.toHaveBeenCalled();
    expect(pdf.save).not.toHaveBeenCalled();
  });

  // Loading jspdf on demand can fail in ways the static import could not, so the
  // handler must not leave an unhandled rejection behind.
  test("reports a failure instead of rejecting", async () => {
    pdf.splitTextToSize.mockImplementation(() => {
      throw new Error("chunk load failed");
    });
    const { downloadPlanPdf, setError } = buildHandlers("Monday\nSquats 3x5");

    await expect(downloadPlanPdf()).resolves.toBeUndefined();
    expect(setError).toHaveBeenCalledWith("chunk load failed");
    expect(pdf.save).not.toHaveBeenCalled();
  });
});
