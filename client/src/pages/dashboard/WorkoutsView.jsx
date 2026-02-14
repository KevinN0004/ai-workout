import "./WorkoutsView.css";

const getLocalDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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
              date: getLocalDateKey()
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
