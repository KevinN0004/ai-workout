/**
 * The SVG line path the dashboard's charts and the walkthrough's dashboard
 * chapter draw their series with. useDashboardMetrics hands it to the
 * dashboard's views; PreviewDashboardChapter imports it directly.
 */

/**
 * An SVG path ("M x,y L x,y ...") through `values`, one point per value, spread
 * evenly across a `width` by `height` box inset by `padding`; the defaults are
 * the size of the charts' viewBox. The vertical scale always spans 0 and at
 * least 1, so an empty or all-zero series runs along the bottom, and an empty
 * one draws a single point.
 */
export const buildLinePath = (values, width = 260, height = 110, padding = 10) => {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / Math.max(safeValues.length - 1, 1);

  return safeValues
    .map((value, index) => {
      const x = padding + stepX * index;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
};
