import ModalPortal from "../../components/ModalPortal";

export default function DashboardWorkoutModal({
  open,
  workoutForm,
  setWorkoutForm,
  onClose,
  onSubmit
}) {
  if (!open) return null;

  return (
    <ModalPortal open={open}>
      <div
        className="modal-backdrop dashboard-modal-backdrop"
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <div
          className="modal dashboard-modal dashboard-workout-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header dashboard-workout-modal-header">
            <div className="dashboard-workout-heading">
              <h2>Log workout</h2>
              <p className="muted">Save your session details and notes.</p>
            </div>
            <button
              type="button"
              className="ghost icon-button"
              aria-label="Close workout modal"
              title="Close"
              onClick={onClose}
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
          <form className="form dashboard-workout-form" onSubmit={onSubmit}>
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
                      min="10"
                      max="180"
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
                <div className="dashboard-workout-grid dashboard-workout-grid-exercise">
                  <label className="dashboard-workout-field dashboard-workout-field-full">
                    <span className="dashboard-workout-label">Exercises (comma-separated)</span>
                    <input
                      value={workoutForm.exercises}
                      onChange={(e) =>
                        setWorkoutForm((prev) => ({
                          ...prev,
                          exercises: e.target.value
                        }))
                      }
                      placeholder="Squat, bench press, row"
                    />
                  </label>
                  <div className="dashboard-workout-grid dashboard-workout-grid-metrics">
                    <label className="dashboard-workout-field dashboard-workout-field-half">
                      <span className="dashboard-workout-label">Sets</span>
                      <input
                        type="number"
                        min="1"
                        max="80"
                        value={workoutForm.sets}
                        onChange={(e) =>
                          setWorkoutForm((prev) => ({
                            ...prev,
                            sets: e.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="dashboard-workout-field dashboard-workout-field-half">
                      <span className="dashboard-workout-label">Reps</span>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={workoutForm.reps}
                        onChange={(e) =>
                          setWorkoutForm((prev) => ({
                            ...prev,
                            reps: e.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="dashboard-workout-field dashboard-workout-field-full">
                      <span className="dashboard-workout-label">Intensity (RPE 1-10)</span>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        step="0.5"
                        value={workoutForm.intensityRpe}
                        onChange={(e) =>
                          setWorkoutForm((prev) => ({
                            ...prev,
                            intensityRpe: e.target.value
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
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

            <div className="modal-submit dashboard-workout-actions">
              <button type="button" className="ghost" onClick={onClose}>
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
