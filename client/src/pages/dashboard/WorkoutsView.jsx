import "./WorkoutsView.css";

export default function WorkoutsView({
  workouts,
  setWorkoutForm,
  setWorkoutModalOpen
}) {
  return (
    <section className="panel dashboard-card span-2">
      <div className="panel-header">
        <div>
          <h2>Workout log</h2>
          <p className="muted">Log each session with a quick add.</p>
        </div>
        <button
          type="button"
          className="cta"
          onClick={() => {
            setWorkoutForm((prev) => ({
              ...prev,
              date: new Date().toISOString().slice(0, 10)
            }));
            setWorkoutModalOpen(true);
          }}
        >
          Add workout
        </button>
      </div>
      <div className="list">
        {workouts.map((item) => (
          <div key={item.id} className="list-row">
            <div>
              <strong>{item.date}</strong>
              <span className="muted">{item.focus ? ` - ${item.focus}` : ""}</span>
            </div>
            <span>{item.duration} min</span>
          </div>
        ))}
        {!workouts.length && <p className="muted">No workouts logged yet.</p>}
      </div>
    </section>
  );
}
