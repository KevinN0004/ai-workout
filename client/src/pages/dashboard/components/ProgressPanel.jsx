/**
 * Logs' Progress panel (roadmap B2): this week's hard sets per muscle group
 * against the four weeks before, and each lift's records, from progress.js;
 * and the PR tag a workout row shows for a session that set a record.
 */
import { useId, useMemo, useState } from "react";
import { fromLoadKg } from "../../../app/exerciseSets";
import { liftRecords, weeklySets } from "../progress";

const RECORDS_SHOWN = 8;

const RECORD_WORDS = { e1rm: "best e1RM", heaviest: "heaviest set", reps: "most reps" };

/**
 * One lift's line: "Squat: e1RM 122.5 kg (up 5.8 kg), heaviest 105 kg × 5", or
 * "Pull-up: most reps 11 (up 3)", loads in the region's unit. A record never
 * falls, so a change is always up; one too small to show at one decimal is left
 * out rather than read "up 0 kg".
 */
const recordLine = ({ name, e1rm, heaviest, mostReps }, system) => {
  const unit = system === "imperial" ? "lb" : "kg";
  const load = (kg) => `${fromLoadKg(kg, system)} ${unit}`;
  const up = (change, show) => {
    if (change === null) return "";
    const shown = show(change);
    return shown.startsWith("0 ") ? "" : ` (up ${shown})`;
  };
  const parts = [];
  if (e1rm) parts.push(`e1RM ${load(e1rm.value)}${up(e1rm.change, load)}`);
  if (heaviest) {
    parts.push(`heaviest ${load(heaviest.loadKg)} × ${heaviest.reps}${up(heaviest.change, load)}`);
  }
  if (mostReps)
    parts.push(`most reps ${mostReps.reps}${up(mostReps.change, (count) => `${count}`)}`);
  return `${name}: ${parts.join(", ")}`;
};

/**
 * The records a session set, in words: "Squat, best e1RM and heaviest set;
 * Pull-up, most reps".
 */
const prLabel = (marks) => {
  const byLift = new Map();
  for (const { name, record } of marks) {
    byLift.set(name, [...(byLift.get(name) ?? []), RECORD_WORDS[record]]);
  }
  return [...byLift].map(([name, words]) => `${name}, ${words.join(" and ")}`).join("; ");
};

/**
 * A workout row's "PR" tag for a session that set a record. The visible "PR"
 * is hidden from screen readers, which read the records it stands for.
 */
export function PrTag({ marks }) {
  return (
    <span className="pr-tag">
      <span aria-hidden="true">PR</span>
      <span className="visually-hidden">personal record: {prLabel(marks)}</span>
    </span>
  );
}

/**
 * The Progress panel over `sessions`, the workouts Logs holds, as of `today`, a
 * "YYYY-MM-DD", with loads in `measurementSystem`'s unit. The sets table and
 * the records each show only when they have a row, and a panel with neither
 * says how to fill it. Eight records show at first; the toggle shows the rest.
 */
export default function ProgressPanel({ sessions, today, measurementSystem }) {
  const headingId = useId();
  const setsId = useId();
  const recordsId = useId();
  const listId = useId();
  const [showAll, setShowAll] = useState(false);
  const weekRows = useMemo(() => weeklySets(sessions, today), [sessions, today]);
  const records = useMemo(() => liftRecords(sessions, today), [sessions, today]);
  const shownRecords = showAll ? records : records.slice(0, RECORDS_SHOWN);

  return (
    <section className="log-section progress-panel" aria-labelledby={headingId}>
      <h3 id={headingId}>Progress</h3>
      {!weekRows.length && !records.length && (
        <p className="muted">Log a workout with sets to see your progress here.</p>
      )}

      {/* ---- This week's sets ---- */}
      {!!weekRows.length && (
        <div className="progress-block">
          <h4 id={setsId}>This week&apos;s sets</h4>
          <table className="progress-table" aria-labelledby={setsId}>
            <thead>
              <tr>
                <th scope="col">Muscle group</th>
                <th scope="col">This week</th>
                <th scope="col">4-week average</th>
              </tr>
            </thead>
            <tbody>
              {weekRows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td>{row.thisWeek}</td>
                  <td>{row.average.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Records ---- */}
      {!!records.length && (
        <div className="progress-block">
          <h4 id={recordsId}>Records</h4>
          <ul id={listId} className="progress-records" aria-labelledby={recordsId}>
            {shownRecords.map((record) => (
              <li key={record.name.toLowerCase()}>{recordLine(record, measurementSystem)}</li>
            ))}
          </ul>
          {records.length > RECORDS_SHOWN && (
            <button
              type="button"
              className="ghost"
              aria-expanded={showAll}
              aria-controls={listId}
              onClick={() => setShowAll((shown) => !shown)}
            >
              {showAll ? "Show fewer records" : `Show all ${records.length} records`}
            </button>
          )}
          <p className="muted progress-note">
            e1RM is estimated from sets of 1 to 10 reps (Epley).
          </p>
        </div>
      )}
    </section>
  );
}
