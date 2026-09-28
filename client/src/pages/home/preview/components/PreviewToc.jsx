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
