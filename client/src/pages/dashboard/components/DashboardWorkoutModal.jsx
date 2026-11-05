/**
 * The Log workout modal: session details, the exercises with their sets, and notes.
 * Rendered by DashboardPage; opened by the Add workout buttons, which date the form
 * today and clear any plan-day link, and by PlansView's Log this workout.
 */
import { useMemo, useState } from "react";
import ModalPortal from "../../../components/ModalPortal";
import { getPreferredMeasurementSystem } from "../../../app/units";
import { MAX_CARDS, addCard, toExerciseSets } from "../../../app/exerciseSets";
import ExerciseCard from "./ExerciseCard";

/**
 * A controlled form over App's `workoutForm`, whose `exerciseSets` holds the
 * exercise cards. Saving checks the cards first and stops with a message
 * beside each set that cannot be logged; otherwise `onSubmit` is submitWorkout
 * in events.js, which queues the entry behind the undo window, then resets the
 * form and closes the modal without waiting for the save. A form filled from a
 * plan day (PlansView) carries `planId` and says which day it is logging.
 */
export default function DashboardWorkoutModal({
  open,
  workoutForm,
  setWorkoutForm,
  onClose,
  onSubmit
}) {
  const system = useMemo(() => getPreferredMeasurementSystem(), []);
  const [errors, setErrors] = useState({});
  if (!open) return null;

  const cards = Array.isArray(workoutForm.exerciseSets) ? workoutForm.exerciseSets : [];
  const setCards = (updater) =>
    setWorkoutForm((prev) => ({
      ...prev,
      exerciseSets: updater(Array.isArray(prev.exerciseSets) ? prev.exerciseSets : [])
    }));
  const close = () => {
    setErrors({});
    onClose();
  };
  const submit = (event) => {
    const found = toExerciseSets(cards, system).errors;
    if (Object.keys(found).length) {
      event.preventDefault();
      setErrors(found);
      return;
    }
    setErrors({});
    onSubmit(event);
  };

  return (
    <ModalPortal open={open} onClose={close}>
      <div
        className="modal-backdrop dashboard-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-modal-title"
        onClick={close}
      >
        <div
          className="modal dashboard-modal dashboard-workout-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ---- Title and close ---- */}
          <div className="modal-header dashboard-workout-modal-header">
            <div className="dashboard-workout-heading">
              <h2 id="workout-modal-title">Log workout</h2>
              <p className="muted">Save your session details and notes.</p>
              {workoutForm.planId ? (
                <p className="muted">Logging {workoutForm.planDayLabel} of your plan.</p>
              ) : null}
            </div>
            <button
              type="button"
              className="ghost icon-button"
              aria-label="Close workout modal"
              title="Close"
              onClick={close}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <form className="form dashboard-workout-form" onSubmit={submit}>
            {/* ---- Fields: session, exercise and notes ---- */}
            <div className="dashboard-workout-layout">
              <section className="dashboard-workout-section dashboard-workout-section-session">
                <h3>Session details</h3>
                <div className="dashboard-workout-grid dashboard-workout-grid-basics">
                  <label className="dashboard-workout-field dashboard-workout-field-half">
                    <span className="dashboard-workout-label">Date</span>
                    <input
                      type="date"
                      value={workoutForm.date}
                      onChange={(e) =>
                        setWorkoutForm((prev) => ({ ...prev, date: e.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="dashboard-workout-field dashboard-workout-field-half">
                    <span className="dashboard-workout-label">Duration (minutes)</span>
                    <input
                      type="number"
                      min="5"
                      max="360"
                      value={workoutForm.duration}
                      onChange={(e) =>
                        setWorkoutForm((prev) => ({
                          ...prev,
                          duration: e.target.value
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="dashboard-workout-field dashboard-workout-field-full">
                    <span className="dashboard-workout-label">Focus</span>
                    <input
                      value={workoutForm.focus}
                      onChange={(e) =>
                        setWorkoutForm((prev) => ({ ...prev, focus: e.target.value }))
                      }
                      placeholder="Strength, conditioning..."
                    />
                  </label>
                </div>
              </section>

              <section className="dashboard-workout-section dashboard-workout-section-exercise">
                <h3>Exercise details</h3>
                {cards.length ? (
                  <ol className="set-log-cards">
                    {cards.map((card, index) => (
                      <li key={card.key}>
                        <ExerciseCard
                          card={card}
                          position={index + 1}
                          unitLabel={system === "imperial" ? "lb" : "kg"}
                          errors={errors}
                          onChange={setCards}
                        />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted set-log-empty">No exercises yet.</p>
                )}
                <button
                  type="button"
                  className="ghost set-log-add-exercise"
                  disabled={cards.length >= MAX_CARDS}
                  onClick={() => setCards(addCard)}
                >
                  Add exercise
                </button>
              </section>

              <section className="dashboard-workout-section dashboard-workout-section-notes">
                <h3>Session notes</h3>
                <label className="dashboard-workout-field dashboard-workout-field-full">
                  <span className="dashboard-workout-label">Notes</span>
                  <textarea
                    value={workoutForm.notes}
                    onChange={(e) =>
                      setWorkoutForm((prev) => ({
                        ...prev,
                        notes: e.target.value
                      }))
                    }
                    rows={3}
                    placeholder="How did the session feel?"
                  />
                </label>
              </section>
            </div>

            {Object.keys(errors).length ? (
              <p className="set-log-error" role="alert">
                Check the exercises marked above before saving.
              </p>
            ) : null}

            {/* ---- Cancel and save ---- */}
            <div className="modal-submit dashboard-workout-actions">
              <button type="button" className="ghost" onClick={close}>
                Cancel
              </button>
              <button className="cta" type="submit">
                Save workout
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
