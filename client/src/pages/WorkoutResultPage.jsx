import { useMemo, useState } from "react";
import "./WorkoutResultPage.css";
import { APP_BRAND_NAME } from "../app/constants";

export default function WorkoutResultPage({
  gradient,
  user,
  go,
  planSections,
  hasResult,
  onDownloadPlanPdf,
  onSignupWithPrefilledProfile
}) {
  const days = Array.isArray(planSections?.days) ? planSections.days : [];
  const notes = Array.isArray(planSections?.notes) ? planSections.notes : [];
  const hasDays = days.length > 0;
  const hasNotes = notes.length > 0;
  const [tableLayout, setTableLayout] = useState("vertical");
  const dayCount = Math.max(1, days.length);
  const maxLineCount = useMemo(
    () => Math.max(1, ...days.map((day) => (Array.isArray(day.lines) ? day.lines.length : 0))),
    [days]
  );
  const verticalLineColumnCount = maxLineCount >= 10 ? 3 : maxLineCount >= 6 ? 2 : 1;
  const tableDensityStyle = {
    "--plan-day-count": String(dayCount),
    "--plan-vertical-line-cols": String(verticalLineColumnCount)
  };
  const horizontalRows = useMemo(
    () => {
      const getTaskLabelFromRow = (values, rowIndex) => {
        const firstLine = values.find((value) => String(value || "").trim());
        const normalizedLine = String(firstLine || "").trim();
        if (!normalizedLine) return `Task ${rowIndex + 1}`;

        const colonIndex = normalizedLine.indexOf(":");
        if (colonIndex > 0) {
          const prefix = normalizedLine.slice(0, colonIndex).trim();
          if (prefix) return prefix;
        }

        const firstWords = normalizedLine
          .split(/\s+/)
          .slice(0, 3)
          .join(" ")
          .trim();
        return firstWords || `Task ${rowIndex + 1}`;
      };
      return Array.from({ length: maxLineCount }, (_, rowIndex) => {
        const values = days.map((day) =>
          Array.isArray(day.lines) && day.lines[rowIndex] ? day.lines[rowIndex] : ""
        );
        return {
          key: `line-${rowIndex + 1}`,
          label: getTaskLabelFromRow(values, rowIndex),
          values
        };
      });
    },
    [days, maxLineCount]
  );

  return (
    <div className="page home-page plan-result-page" style={gradient}>
      <header className="title">
        <h1>Your {APP_BRAND_NAME} Plan</h1>
        <p className="muted">
          {hasResult
            ? "Review your plan below. Sign up to save your profile and keep tracking."
            : "Generate a workout from the homepage to view it here."}
        </p>
      </header>

      <main
        className={`content plan-result-content ${tableLayout === "horizontal" ? "is-horizontal-layout" : ""}`}
      >
        <section className="panel plan-result-panel">
          {!hasResult && (
            <div className="plan-result-empty">
              <p className="muted">No generated workout is available yet.</p>
              <button type="button" className="cta" onClick={() => go("/")}>
                Back to Home
              </button>
            </div>
          )}

          {hasResult && (
            <>
              <div
                className="plan-result-table-controls"
                role="group"
                aria-label="Workout table layout"
              >
                <button
                  type="button"
                  className={`ghost ${tableLayout === "vertical" ? "active" : ""}`}
                  onClick={() => setTableLayout("vertical")}
                >
                  Vertical
                </button>
                <button
                  type="button"
                  className={`ghost ${tableLayout === "horizontal" ? "active" : ""}`}
                  onClick={() => setTableLayout("horizontal")}
                >
                  Horizontal
                </button>
              </div>

              <div
                className={`plan-result-table-wrap ${tableLayout === "horizontal" ? "is-horizontal" : ""}`}
                style={tableDensityStyle}
              >
                {tableLayout === "horizontal" ? (
                  <table
                    className="plan-result-table plan-result-table-horizontal"
                    aria-label="Generated workout table horizontal layout"
                  >
                    <thead>
                      <tr>
                        <th scope="col">Task</th>
                        {hasDays ? (
                          days.map((day, index) => (
                            <th key={`${day.title}-${index}`} scope="col">
                              {day.title}
                            </th>
                          ))
                        ) : (
                          <th scope="col">Plan</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {hasDays ? (
                        horizontalRows.map((row) => (
                          <tr key={row.key}>
                            <th scope="row">{row.label}</th>
                            {row.values.map((value, index) => (
                              <td key={`${row.key}-${index}`}>
                                {value || <span className="muted">-</span>}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <th scope="row">Task 1</th>
                          <td>
                            <p className="muted">No structured day-by-day sections were found.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="plan-result-table" aria-label="Generated workout table vertical layout">
                    <thead>
                      <tr>
                        <th scope="col">Day</th>
                        <th scope="col">Workout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hasDays ? (
                        days.map((day, index) => (
                          <tr key={`${day.title}-${index}`}>
                            <th scope="row">{day.title}</th>
                            <td>
                              {Array.isArray(day.lines) && day.lines.length ? (
                                <ul>
                                  {day.lines.map((line, lineIndex) => (
                                    <li key={`${day.title}-${lineIndex}-${line}`}>{line}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="muted">No details provided.</p>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <th scope="row">Plan</th>
                          <td>
                            <p className="muted">No structured day-by-day sections were found.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {hasNotes && (
                <section className="plan-result-notes" aria-label="Coach notes">
                  <h3>Coach Notes</h3>
                  <ul>
                    {notes.map((line, index) => (
                      <li key={`${index}-${line}`}>{line}</li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="plan-result-actions">
                <button type="button" className="cta" onClick={onDownloadPlanPdf}>
                  Download PDF
                </button>
                {!user && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={onSignupWithPrefilledProfile}
                  >
                    Signup
                  </button>
                )}
                <button
                  type="button"
                  className="ghost"
                  onClick={() => go(user ? "/dashboard" : "/")}
                >
                  {user ? "Open Dashboard" : "Back to Home"}
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
