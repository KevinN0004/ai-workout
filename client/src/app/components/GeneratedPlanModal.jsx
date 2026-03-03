import ModalPortal from "../../components/ModalPortal";
import { APP_BRAND_NAME } from "../constants";

export default function GeneratedPlanModal({
  planModalOpen,
  result,
  setPlanModalOpen,
  planSections,
  activeDayIndex,
  setActiveDayIndex,
  downloadPlanPdf,
  go
}) {
  if (!planModalOpen || !result) return null;

  return (
    <ModalPortal open={Boolean(planModalOpen && result)}>
      <div
        className="modal-backdrop plan-modal-backdrop"
        role="dialog"
        aria-modal="true"
      >
        <div className="modal plan-modal">
          <div className="modal-header">
            <h2>Your {APP_BRAND_NAME} Plan</h2>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost icon-button"
                aria-label="Close"
                onClick={() => setPlanModalOpen(false)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  aria-hidden="true"
                >
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div className="modal-body">
            <div className="plan-modal-content">
              <section className="plan-modal-plan">
                {planSections.days.length ? (
                  <>
                    <div className="plan-tabs" role="tablist" aria-label="Plan days">
                      {planSections.days.map((day, index) => (
                        <button
                          key={`${day.title}-${index}`}
                          type="button"
                          role="tab"
                          className={index === activeDayIndex ? "active" : ""}
                          aria-selected={index === activeDayIndex}
                          onClick={() => setActiveDayIndex(index)}
                        >
                          {day.title}
                        </button>
                      ))}
                    </div>
                    <div className="plan-day" role="tabpanel">
                      <h3>{planSections.days[activeDayIndex]?.title}</h3>
                      {planSections.days[activeDayIndex]?.lines?.length ? (
                        <ul>
                          {planSections.days[activeDayIndex].lines.map(
                            (line, lineIndex) => (
                              <li key={`${activeDayIndex}-${lineIndex}-${line}`}>
                                {line}
                              </li>
                            )
                          )}
                        </ul>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="plan-day" />
                )}
              </section>
              <section className="plan-modal-notes">
                <h3>Coach notes</h3>
                {planSections.notes.length ? (
                  <ul>
                    {planSections.notes.map((line, index) => (
                      <li key={`${index}-${line}`}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </div>
          </div>
          <div className="modal-footer plan-modal-footer">
            <div className="modal-actions">
              <button type="button" className="cta" onClick={downloadPlanPdf}>
                Download PDF
              </button>
              <button type="button" className="ghost" onClick={() => go("/auth")}>
                Login / Sign up
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
