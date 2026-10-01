/**
 * The generated-plan modal: the plan's days as tabs beside the coach notes, with
 * PDF download and a Login / Sign up button. App builds it and HomePage and
 * DashboardPage render it, but nothing in the app opens it (see below).
 */
import ModalPortal from "../../components/ModalPortal";
import { APP_BRAND_NAME } from "../constants";

/**
 * Renders while `planModalOpen` is set and there is a plan (`result`). Nothing
 * in the app sets `planModalOpen` true: onSubmit in events.js only ever clears
 * it, and shows a new plan on /plan or the dashboard instead, so only this
 * file's tests open the modal. `planSections` is that plan split by
 * parsePlanSections, and `activeDayIndex` picks the day tab shown; App resets
 * it to the first day for each new plan.
 */
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
  if (!planModalOpen) return null;
  // A generated plan is the modal's entire content, so there is nothing to show
  // before one arrives. This is the only guard on that: passing the same
  // condition to ModalPortal as well would make both untestable, because
  // either one alone produces an empty render.
  if (!result) return null;

  return (
    <ModalPortal open onClose={() => setPlanModalOpen(false)}>
      {/* Named by its own visible heading, so a screen reader announces what the
          dialog is rather than just "dialog", and the name cannot drift from
          what is on screen. */}
      <div
        className="modal-backdrop plan-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generated-plan-modal-title"
      >
        <div className="modal plan-modal">
          {/* ---- Header: title and close ---- */}
          <div className="modal-header">
            <h2 id="generated-plan-modal-title">Your {APP_BRAND_NAME} Plan</h2>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost icon-button"
                aria-label="Close"
                onClick={() => setPlanModalOpen(false)}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
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
          {/* ---- Body: day tabs beside the coach notes ---- */}
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
                          {planSections.days[activeDayIndex].lines.map((line, lineIndex) => (
                            <li key={`${activeDayIndex}-${lineIndex}-${line}`}>{line}</li>
                          ))}
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
          {/* ---- Footer: PDF download and sign-in ---- */}
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
