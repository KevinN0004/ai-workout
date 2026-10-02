/**
 * The preview walkthrough's Result chapter: usePreviewDerivedData's sample week
 * as a table that draws its outline, types in its headers and then its cells,
 * and breaks apart into particles. Rendered by PreviewStage.
 */
import { PREVIEW_WEEK_LINE_STAGGER_MS, PREVIEW_WEEK_TEXT_ROW_CONFIG } from "../constants";

/**
 * Each `previewWeekStage` from 1 adds classes: 1 draws the outline, 2 shows the
 * headers, 3 the rows and 5 runs the scan, all animated by the stylesheet; 4,
 * the typing finished, adds none. 6 adds the break classes, which switch the
 * stylesheet's own break animations off so that the timeline in
 * usePreviewWeekParticleAnimation plays the break instead. The text typed so
 * far comes from `getPreviewWeekHeaderTypedText` and `getPreviewWeekTypedText`,
 * and a cell with none yet holds a non-breaking space so it keeps a line's
 * height. The outline's lines sit at `previewWeekLineOffsets`, which
 * usePreviewWeekOutline measures from this table, and start one after another,
 * horizontals first. The two refs are the table's wrap, which the outline and
 * the particle animation measure, and the layer the particles are drawn into.
 */
export default function PreviewWorkoutWeekChapter({
  previewWeekLineOffsets,
  previewWeekStage,
  previewWeekTypingProgress,
  previewWeekPlan,
  previewWeekTableWrapRef,
  previewWeekParticleLayerRef,
  getPreviewWeekHeaderTypedText,
  getPreviewWeekTypedText
}) {
  const horizontalLineOffsets = previewWeekLineOffsets.horizontal;
  const verticalLineOffsets = previewWeekLineOffsets.vertical;

  return (
    <div
      className={`preview-week-plan ${previewWeekStage >= 1 ? "is-outline-active" : ""} ${
        previewWeekStage >= 2 ? "is-headers-visible" : ""
      } ${previewWeekStage >= 3 ? "is-rows-visible" : ""} ${
        previewWeekStage >= 3 && previewWeekTypingProgress < 1 ? "is-typing" : ""
      } ${previewWeekStage >= 5 ? "is-scan-once" : ""} ${
        previewWeekStage >= 6 ? "is-breaking-apart is-anime-particle-break" : ""
      }`}
      aria-label="Generated weekly workout preview"
    >
      <div ref={previewWeekTableWrapRef} className="preview-week-table-wrap">
        {/* ---- The outline: its lines, then its corners ---- */}
        <div className="preview-week-outline" aria-hidden="true">
          {horizontalLineOffsets.map((offset, index) => (
            <span
              key={`preview-week-outline-h-${index}`}
              className={`preview-week-outline-line horizontal ${
                index === 0 ? "is-top-edge" : ""
              } ${index === horizontalLineOffsets.length - 1 ? "is-bottom-edge" : ""}`}
              style={{
                "--preview-line-offset": offset,
                "--preview-line-delay": `${index * PREVIEW_WEEK_LINE_STAGGER_MS}ms`
              }}
            />
          ))}
          {verticalLineOffsets.map((offset, index) => (
            <span
              key={`preview-week-outline-v-${index}`}
              className={`preview-week-outline-line vertical ${index === 0 ? "is-left-edge" : ""} ${
                index === verticalLineOffsets.length - 1 ? "is-right-edge" : ""
              }`}
              style={{
                "--preview-line-offset": offset,
                "--preview-line-delay": `${
                  (horizontalLineOffsets.length + index) * PREVIEW_WEEK_LINE_STAGGER_MS
                }ms`
              }}
            />
          ))}
          <span
            className="preview-week-outline-corner top-left"
            style={{ "--preview-line-delay": "0ms" }}
          />
          <span
            className="preview-week-outline-corner top-right"
            style={{ "--preview-line-delay": `${PREVIEW_WEEK_LINE_STAGGER_MS}ms` }}
          />
          <span
            className="preview-week-outline-corner bottom-right"
            style={{
              "--preview-line-delay": `${
                (horizontalLineOffsets.length + verticalLineOffsets.length - 2) *
                PREVIEW_WEEK_LINE_STAGGER_MS
              }ms`
            }}
          />
          <span
            className="preview-week-outline-corner bottom-left"
            style={{
              "--preview-line-delay": `${
                (horizontalLineOffsets.length + verticalLineOffsets.length - 1) *
                PREVIEW_WEEK_LINE_STAGGER_MS
              }ms`
            }}
          />
        </div>
        {/* ---- The table: the header row, then the body ---- */}
        <table className="preview-week-table">
          <thead>
            <tr>
              <th
                className={`preview-week-row-label preview-week-corner-cell ${
                  previewWeekStage >= 2 ? "is-visible" : ""
                }`}
              >
                {getPreviewWeekHeaderTypedText("Plan") || "\u00A0"}
              </th>
              {previewWeekPlan.map((dayPlan) => (
                <th
                  key={`preview-week-head-${dayPlan.day}`}
                  scope="col"
                  className={`preview-week-day-cell preview-week-day-head ${
                    dayPlan.isTraining ? "is-training" : "is-recovery"
                  } ${previewWeekStage >= 2 ? "is-visible" : ""}`}
                >
                  <h3 className="preview-week-day-name">
                    {getPreviewWeekHeaderTypedText(dayPlan.day) || "\u00A0"}
                  </h3>
                </th>
              ))}
            </tr>
          </thead>
          {/* ---- A row per PREVIEW_WEEK_TEXT_ROW_CONFIG entry, then the highlights ---- */}
          <tbody>
            {PREVIEW_WEEK_TEXT_ROW_CONFIG.map((rowConfig) => (
              <tr key={`preview-week-row-${rowConfig.id}`}>
                <th
                  scope="row"
                  className={`preview-week-row-label ${previewWeekStage >= 2 ? "is-visible" : ""}`}
                >
                  {getPreviewWeekHeaderTypedText(rowConfig.label) || "\u00A0"}
                </th>
                {previewWeekPlan.map((dayPlan) => {
                  const rowValue = String(dayPlan[rowConfig.valueKey] ?? "");
                  const typedRowValue = getPreviewWeekTypedText(rowValue);
                  return (
                    <td
                      key={`preview-week-${rowConfig.id}-${dayPlan.day}`}
                      className={`preview-week-day-cell ${
                        dayPlan.isTraining ? "is-training" : "is-recovery"
                      } ${previewWeekStage >= 3 ? "is-visible" : ""}`}
                    >
                      <p className={rowConfig.textClass}>{typedRowValue || "\u00A0"}</p>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th
                scope="row"
                className={`preview-week-row-label ${previewWeekStage >= 2 ? "is-visible" : ""}`}
              >
                {getPreviewWeekHeaderTypedText("Highlights") || "\u00A0"}
              </th>
              {previewWeekPlan.map((dayPlan) => (
                <td
                  key={`preview-week-highlights-${dayPlan.day}`}
                  className={`preview-week-day-cell preview-week-highlights-cell ${
                    dayPlan.isTraining ? "is-training" : "is-recovery"
                  } ${previewWeekStage >= 3 ? "is-visible" : ""}`}
                >
                  <ul className="preview-week-highlights">
                    {dayPlan.highlights.map((item, itemIndex) => {
                      const typedHighlight = getPreviewWeekTypedText(item);
                      return (
                        <li
                          key={`preview-week-${dayPlan.day}-item-${itemIndex}`}
                          className={typedHighlight ? "is-typed" : "is-empty"}
                        >
                          {typedHighlight || "\u00A0"}
                        </li>
                      );
                    })}
                  </ul>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        {/* ---- Where usePreviewWeekParticleAnimation draws the break ---- */}
        <div
          ref={previewWeekParticleLayerRef}
          className="preview-week-particle-layer"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
