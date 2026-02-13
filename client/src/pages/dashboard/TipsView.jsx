import { useMemo, useState } from "react";
import "./TipsView.css";

export default function TipsView() {
  const muscleGuides = [
    {
      group: "Chest",
      target: "Pecs, front delts, triceps",
      workouts: [
        { name: "Barbell bench press", sets: "4 x 5-8", focus: "Chest + triceps" },
        { name: "Incline dumbbell press", sets: "3 x 8-12", focus: "Upper chest" },
        { name: "Push-ups", sets: "3 x 10-20", focus: "Chest endurance" },
        { name: "Cable fly", sets: "3 x 12-15", focus: "Chest isolation" }
      ]
    },
    {
      group: "Back",
      target: "Lats, upper back, biceps",
      workouts: [
        { name: "Pull-ups", sets: "4 x 5-10", focus: "Lats + biceps" },
        { name: "Lat pulldown", sets: "3 x 8-12", focus: "Lat width" },
        { name: "Barbell row", sets: "4 x 6-10", focus: "Mid-back thickness" },
        { name: "Seated cable row", sets: "3 x 10-12", focus: "Upper back control" }
      ]
    },
    {
      group: "Shoulders",
      target: "Front, lateral, and rear delts",
      workouts: [
        { name: "Overhead press", sets: "4 x 5-8", focus: "Front delts + triceps" },
        { name: "Lateral raise", sets: "3 x 12-15", focus: "Side delts" },
        { name: "Rear-delt fly", sets: "3 x 12-15", focus: "Rear delts" },
        { name: "Arnold press", sets: "3 x 8-12", focus: "Full shoulder development" }
      ]
    },
    {
      group: "Arms",
      target: "Biceps, triceps, forearms",
      workouts: [
        { name: "EZ-bar curl", sets: "3 x 8-12", focus: "Biceps mass" },
        { name: "Hammer curl", sets: "3 x 10-12", focus: "Brachialis + forearms" },
        { name: "Rope pushdown", sets: "3 x 10-15", focus: "Triceps isolation" },
        { name: "Skull crushers", sets: "3 x 8-12", focus: "Long-head triceps" }
      ]
    },
    {
      group: "Legs (Quads + Hamstrings)",
      target: "Quads, hamstrings, calves",
      workouts: [
        { name: "Back squat", sets: "4 x 5-8", focus: "Quads + glutes" },
        { name: "Romanian deadlift", sets: "4 x 6-10", focus: "Hamstrings + glutes" },
        { name: "Walking lunges", sets: "3 x 10/leg", focus: "Single-leg strength" },
        { name: "Leg press", sets: "3 x 10-15", focus: "Quad volume" }
      ]
    },
    {
      group: "Glutes",
      target: "Glute max, glute med, posterior chain",
      workouts: [
        { name: "Hip thrust", sets: "4 x 6-10", focus: "Glute max" },
        { name: "Bulgarian split squat", sets: "3 x 8-12/leg", focus: "Glute + quad" },
        { name: "Cable kickback", sets: "3 x 12-15", focus: "Glute isolation" },
        { name: "Step-ups", sets: "3 x 10/leg", focus: "Glute drive + balance" }
      ]
    },
    {
      group: "Core",
      target: "Abs, obliques, deep trunk stabilizers",
      workouts: [
        { name: "Plank variations", sets: "3 x 30-60 sec", focus: "Anti-extension" },
        { name: "Hanging knee raise", sets: "3 x 8-15", focus: "Lower abs" },
        { name: "Dead bug", sets: "3 x 10/side", focus: "Core bracing" },
        { name: "Pallof press", sets: "3 x 10-12/side", focus: "Anti-rotation" }
      ]
    }
  ];
  const [activeGroup, setActiveGroup] = useState("All");
  const toggleGroups = ["All", ...muscleGuides.map((guide) => guide.group)];

  const visibleExercises = useMemo(() => {
    const selectedGuides =
      activeGroup === "All"
        ? muscleGuides
        : muscleGuides.filter((guide) => guide.group === activeGroup);

    return selectedGuides.flatMap((guide) =>
      guide.workouts.map((workout) => ({
        ...workout,
        group: guide.group,
        target: guide.target
      }))
    );
  }, [activeGroup]);

  return (
    <section className="panel dashboard-card span-2 tips-view">
      <div className="panel-header">
        <div>
          <h2>Workout guide</h2>
          <p className="muted">
            Workouts are sorted by the main muscle group they hit so you can plan sessions
            faster.
          </p>
        </div>
      </div>

      <div className="group-toggles" role="tablist" aria-label="Filter exercises by muscle group">
        {toggleGroups.map((group) => (
          <button
            key={group}
            type="button"
            className={group === activeGroup ? "active" : ""}
            onClick={() => setActiveGroup(group)}
            aria-pressed={group === activeGroup}
          >
            {group}
          </button>
        ))}
      </div>

      <div className="exercise-grid">
        {visibleExercises.map((exercise) => (
          <article key={`${exercise.group}-${exercise.name}`} className="exercise-card">
            <p className="exercise-group">{exercise.group}</p>
            <h3>{exercise.name}</h3>
            <p className="exercise-target">
              <strong>Hits:</strong> {exercise.target}
            </p>
            <p className="exercise-sets">
              <strong>Sets/Reps:</strong> {exercise.sets}
            </p>
            <p className="exercise-focus">{exercise.focus}</p>
          </article>
        ))}
      </div>

      <section className="guide-rules">
        <h3>Simple split ideas</h3>
        <ul className="guide-list">
          <li>Push day: chest, shoulders, triceps.</li>
          <li>Pull day: back, biceps, rear delts.</li>
          <li>Leg day: quads, hamstrings, glutes, calves.</li>
          <li>Add core work 2-4 times per week at the end of sessions.</li>
        </ul>
      </section>
    </section>
  );
}
