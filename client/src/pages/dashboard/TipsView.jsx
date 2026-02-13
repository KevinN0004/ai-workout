import "./TipsView.css";

export default function TipsView() {
  const workoutGuides = [
    {
      title: "Strength Training",
      focus: "Build muscle and increase force output.",
      bestFor: "Body composition goals and long-term progression.",
      example: "3 to 5 sets of compound lifts in the 4-10 rep range.",
      dose: "2-4 sessions per week"
    },
    {
      title: "Hypertrophy",
      focus: "Increase muscle size with moderate loads and volume.",
      bestFor: "Adding lean mass and improving muscle definition.",
      example: "3 to 4 sets per exercise in the 8-15 rep range.",
      dose: "2-5 sessions per week"
    },
    {
      title: "HIIT / Conditioning",
      focus: "Improve work capacity with short, hard intervals.",
      bestFor: "Time-efficient cardio and athletic conditioning.",
      example: "20-30 seconds hard effort, 60-90 seconds easy, repeat 8-12 rounds.",
      dose: "1-3 sessions per week"
    },
    {
      title: "Steady-State Cardio",
      focus: "Build aerobic base and support recovery.",
      bestFor: "Heart health, endurance, and lower-stress training days.",
      example: "30-60 minutes at conversational pace.",
      dose: "2-5 sessions per week"
    },
    {
      title: "Mobility + Core",
      focus: "Improve movement quality and trunk stability.",
      bestFor: "Warm-up days, desk-heavy weeks, and injury prevention.",
      example: "20-30 minute circuit of hips, thoracic spine, and anti-rotation core work.",
      dose: "3-6 short sessions per week"
    },
    {
      title: "Recovery Session",
      focus: "Reduce fatigue while staying active.",
      bestFor: "Deload weeks, soreness, or poor sleep days.",
      example: "Light walk, easy bike, breath work, and gentle stretching.",
      dose: "As needed between hard sessions"
    }
  ];

  return (
    <section className="panel dashboard-card span-2 tips-view">
      <div className="panel-header">
        <div>
          <h2>Workout guide</h2>
          <p className="muted">
            Use this as a quick guide to choose different workouts based on your goal and
            energy level.
          </p>
        </div>
      </div>

      <div className="tips-grid">
        {workoutGuides.map((guide) => (
          <article key={guide.title} className="guide-card">
            <h3>{guide.title}</h3>
            <p>{guide.focus}</p>
            <p>
              <strong>Best for:</strong> {guide.bestFor}
            </p>
            <p>
              <strong>Try this:</strong> {guide.example}
            </p>
            <p className="guide-dose">{guide.dose}</p>
          </article>
        ))}
      </div>

      <section className="guide-rules">
        <h3>How to pick today&rsquo;s workout</h3>
        <ul className="guide-list">
          <li>High energy: prioritize strength, hypertrophy, or HIIT.</li>
          <li>Medium energy: use steady-state cardio or mixed resistance work.</li>
          <li>Low energy or high soreness: switch to mobility or recovery training.</li>
          <li>Progress first: increase load, reps, or time gradually week to week.</li>
        </ul>
      </section>
    </section>
  );
}
