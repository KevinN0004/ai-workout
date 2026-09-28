import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import PhysiqueSilhouette2D, { SILHOUETTE_GEOMETRY_REV } from "../PhysiqueSilhouette2D";

// This component was untestable for the same reason geometry.js was: it imports
// that module, and merely importing it threw under vitest. Covered now that the
// HMR guard is fixed.

const renderSvg = (shape) => {
  const { container } = render(<PhysiqueSilhouette2D shape={shape} />);
  return container.querySelector("svg");
};

describe("PhysiqueSilhouette2D", () => {
  test("renders an SVG carrying the geometry revision", () => {
    const svg = renderSvg({});

    expect(svg).toBeTruthy();
    expect(svg.getAttribute("data-geometry-rev")).toBe(SILHOUETTE_GEOMETRY_REV);
    expect(svg.getAttribute("viewBox")).toMatch(/^0 0 \d+ \d+$/);
  });

  // It is decorative: the body shape is conveyed by the numbers elsewhere on the
  // page, so a screen reader should skip it rather than announce a bare graphic.
  test("is hidden from assistive technology", () => {
    const svg = renderSvg({});

    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBe("presentation");
  });

  test("draws an outline path with no NaN in it", () => {
    const path = renderSvg({}).querySelector("path.physique-outline-line");

    expect(path).toBeTruthy();
    const d = path.getAttribute("d");
    expect(d.startsWith("M ")).toBe(true);
    expect(d).not.toMatch(/NaN|Infinity|undefined/);
  });

  test("renders without the debug point layers by default", () => {
    const svg = renderSvg({});

    // Gated behind VITE_SHOW_PHYSIQUE_POINTS, so they must not ship by default.
    expect(svg.querySelectorAll("circle.physique-point")).toHaveLength(0);
  });

  test("redraws when the shape changes", () => {
    const narrow = renderSvg({ shoulderHalf: 32 })
      .querySelector("path.physique-outline-line")
      .getAttribute("d");
    const wide = renderSvg({ shoulderHalf: 70 })
      .querySelector("path.physique-outline-line")
      .getAttribute("d");

    expect(narrow).not.toBe(wide);
  });

  test("survives a missing shape prop", () => {
    const { container } = render(<PhysiqueSilhouette2D />);
    const path = container.querySelector("path.physique-outline-line");

    expect(path.getAttribute("d")).not.toMatch(/NaN|undefined/);
  });

  test("exposes the palette to CSS as custom properties", () => {
    const svg = renderSvg({ fillHue: 200 });

    expect(svg.style.getPropertyValue("--outline-stroke")).toMatch(/hsla\(200,/);
    expect(svg.style.getPropertyValue("--anchor-major")).toMatch(/hsla\(200,/);
  });
});
