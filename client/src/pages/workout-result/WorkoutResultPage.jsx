/**
 * The /plan page: the workout plan the home flow generated, as a table the
 * visitor can turn between a vertical and a horizontal layout, with its coach
 * notes and a PDF download. Rendered by App.
 */
import { useMemo, useState } from "react";
import { APP_BRAND_NAME } from "../../app/constants";
import "./WorkoutResultPage.css";

/**
 * `planSections` is App's parse of the generated plan, and `hasResult` says
 * whether there is one; without one the page offers only a way home. The
 * vertical layout is a row per day, its lines as a list. The horizontal one is
 * a column per day and a row per line position, each row labelled from the
 * first day with a non-blank line there: the text before a colon, else its
 * first three words, else "Task" and the row's number. The stylesheet sizes the
 * table by `--plan-day-count`, and lays a day's lines in one to three columns
 * by `--plan-vertical-line-cols`, from the longest day. A signed-out visitor
 * also gets Signup, which opens sign-up with the home flow's profile filled in,
 * and the last button goes to the dashboard when signed in and home otherwise.
 */
export default function WorkoutResultPage({
  gradient,
  user,
  go,
  planSections,
  hasResult,
  onDownloadPlanPdf,
  onSignupWithPrefilledProfile
}) {
  // ---- The plan's shape -----------------------------------------------------
  // Memoized so that the `: []` fallback, for planSections without a days
  // array, is not a fresh array each render, which would make the two useMemo
  // hooks below recompute every time. App's parsePlanSections always supplies
  // the array, so the fallback is defensive.
  const days = useMemo(
    () => (Array.isArray(planSections?.days) ? planSections.days : []),
    [planSections]
  );
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
  // ---- The horizontal layout's rows: a line position across every day ------
  const horizontalRows = useMemo(() => {
    const getTaskLabelFromRow = (values, rowIndex) => {
      const firstLine = values.find((value) => String(value || "").trim());
      const normalizedLine = String(firstLine || "").trim();
      if (!normalizedLine) return `Task ${rowIndex + 1}`;

      const colonIndex = normalizedLine.indexOf(":");
      if (colonIndex > 0) {
        const prefix = normalizedLine.slice(0, colonIndex).trim();
        if (prefix) return prefix;
      }

      const firstWords = normalizedLine.split(/\s+/).slice(0, 3).join(" ").trim();
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
  }, [days, maxLineCount]);

  // ---- Render ---------------------------------------------------------------
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
          {/* ---- No plan yet ---- */}
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
              {/* ---- The layout toggle ---- */}
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

              {/* ---- The plan table, in the chosen layout ---- */}
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
                  <table
                    className="plan-result-table"
                    aria-label="Generated workout table vertical layout"
                  >
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

              {/* ---- Coach notes and the actions ---- */}
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
                  <button type="button" className="ghost" onClick={onSignupWithPrefilledProfile}>
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
