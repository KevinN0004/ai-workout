/**
 * The preview walkthrough's table of contents: a chip per chapter, the current
 * one widened to show its title. Rendered by PreviewStage.
 */

/**
 * `previewTocExpandingIndex` and `previewTocContractingIndex` are the chips
 * PreviewStage is switching to and from, which keep their animation classes
 * for PREVIEW_TOC_SWITCH_MS. A click goes to `onSelectChapter` with the chip's
 * index.
 */
export default function PreviewToc({
  chapters,
  previewStepIndex,
  previewTocExpandingIndex,
  previewTocContractingIndex,
  previewTocStyle,
  onSelectChapter
}) {
  return (
    <div
      className="preview-side-tab"
      role="tablist"
      aria-label="Preview sections"
      style={previewTocStyle}
    >
      {/* ---- A chip per chapter ---- */}
      {chapters.map((chapter, index) => {
        const isActive = index === previewStepIndex;
        const isExpanding = index === previewTocExpandingIndex;
        const isContracting = index === previewTocContractingIndex && !isActive;
        return (
          <button
            key={chapter.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "step" : undefined}
            className={`preview-jump-chip ${isActive ? "active" : ""} ${isExpanding ? "is-expanding" : ""} ${
              isContracting ? "is-contracting" : ""
            }`}
            onClick={() => {
              onSelectChapter(index);
            }}
          >
            <span className="preview-jump-label">{chapter.title}</span>
          </button>
        );
      })}
    </div>
  );
}
