import { useMemo, useState } from "react";
import "./TipsView.css";

const muscleGuides = [
  {
    group: "Chest",
    target: "Pecs, front delts, triceps",
    workouts: [
      {
        name: "Barbell bench press",
        sets: "4 x 5-8",
        focus: "Chest strength",
        what: "A horizontal press that builds pressing strength and overall chest mass.",
        equipment: ["Flat bench", "Barbell", "Weight plates", "Rack"],
        formSteps: [
          "Set eyes directly under the bar and plant feet firmly on the floor.",
          "Create a stable upper back arch and squeeze shoulder blades together.",
          "Lower the bar to the mid-chest with elbows around 45 degrees from your torso.",
          "Press up in a slight arc while keeping wrists stacked over elbows."
        ],
        videoUrl: "https://example.com/bench-press-placeholder"
      },
      {
        name: "Incline dumbbell press",
        sets: "3 x 8-12",
        focus: "Upper chest",
        what: "A chest press variation on an incline that emphasizes the upper chest fibers.",
        equipment: ["Adjustable bench", "Dumbbells"],
        formSteps: [
          "Set bench angle around 30 to 45 degrees and keep your core braced.",
          "Start with dumbbells at upper chest level and wrists neutral.",
          "Press up and slightly inward without slamming the dumbbells together.",
          "Lower with control until elbows are just below shoulder line."
        ],
        videoUrl: "https://example.com/incline-press-placeholder"
      },
      {
        name: "Push-ups",
        sets: "3 x 10-20",
        focus: "Chest endurance",
        what: "A bodyweight pressing move that develops chest, triceps, and shoulder control.",
        equipment: ["Bodyweight", "Exercise mat (optional)"],
        formSteps: [
          "Place hands slightly wider than shoulder width and stack shoulders over wrists.",
          "Lock in a straight line from head to heels by bracing abs and glutes.",
          "Lower chest toward the floor while keeping elbows at roughly 30 to 45 degrees.",
          "Press back up without letting hips sag or shoulders shrug."
        ],
        videoUrl: "https://example.com/push-up-placeholder"
      }
    ]
  },
  {
    group: "Back",
    target: "Lats, upper back, biceps",
    workouts: [
      {
        name: "Pull-ups",
        sets: "4 x 5-10",
        focus: "Lat and upper back strength",
        what: "A vertical pulling movement that builds upper-body pulling strength and back width.",
        equipment: ["Pull-up bar", "Assistance band or machine (optional)"],
        formSteps: [
          "Start from a dead hang with a tight grip and slight core brace.",
          "Drive elbows down toward your ribs as your chest lifts to the bar.",
          "Avoid swinging by keeping legs quiet and torso controlled.",
          "Lower slowly to full arm extension before the next rep."
        ],
        videoUrl: "https://example.com/pull-up-placeholder"
      },
      {
        name: "Barbell row",
        sets: "4 x 6-10",
        focus: "Mid-back thickness",
        what: "A hip-hinged row that targets lats, rhomboids, and spinal erectors.",
        equipment: ["Barbell", "Weight plates"],
        formSteps: [
          "Hinge at the hips until torso is about 30 to 45 degrees to the floor.",
          "Keep a neutral spine and brace your core before each pull.",
          "Row bar toward lower ribs by driving elbows behind you.",
          "Lower under control without rounding your lower back."
        ],
        videoUrl: "https://example.com/barbell-row-placeholder"
      },
      {
        name: "Lat pulldown",
        sets: "3 x 8-12",
        focus: "Lat width",
        what: "A machine-based vertical pull used to build lat strength and control.",
        equipment: ["Lat pulldown machine"],
        formSteps: [
          "Sit tall with thighs secured under pads and chest up.",
          "Begin by depressing shoulders, then pull bar to upper chest.",
          "Keep torso mostly upright and avoid excessive leaning.",
          "Return the bar slowly to full stretch without losing control."
        ],
        videoUrl: "https://example.com/lat-pulldown-placeholder"
      }
    ]
  },
  {
    group: "Shoulders",
    target: "Front, lateral, and rear delts",
    workouts: [
      {
        name: "Overhead press",
        sets: "4 x 5-8",
        focus: "Front delts and triceps",
        what: "A vertical pressing pattern that develops shoulder strength and pressing power.",
        equipment: ["Barbell or dumbbells", "Rack (for barbell)"],
        formSteps: [
          "Stand tall with glutes and abs tight to prevent lower-back overextension.",
          "Start weight at shoulder level with forearms vertical.",
          "Press overhead in a straight path while moving head slightly back then through.",
          "Lock out with biceps near ears and control the descent."
        ],
        videoUrl: "https://example.com/overhead-press-placeholder"
      },
      {
        name: "Lateral raise",
        sets: "3 x 12-15",
        focus: "Side delts",
        what: "An isolation move that builds shoulder width by targeting the lateral deltoid.",
        equipment: ["Light dumbbells or cable"],
        formSteps: [
          "Stand with soft knees and slight forward torso lean.",
          "Raise arms out to the sides until hands reach shoulder height.",
          "Lead with elbows and keep wrists neutral.",
          "Lower slowly and avoid using momentum."
        ],
        videoUrl: "https://example.com/lateral-raise-placeholder"
      },
      {
        name: "Rear-delt fly",
        sets: "3 x 12-15",
        focus: "Rear delts",
        what: "A posterior shoulder exercise that improves shoulder balance and posture.",
        equipment: ["Dumbbells or reverse fly machine"],
        formSteps: [
          "Hinge hips so torso is near parallel to the floor.",
          "Keep elbows slightly bent and lift arms wide.",
          "Focus on squeezing rear shoulders rather than shrugging traps.",
          "Pause briefly at the top and lower under control."
        ],
        videoUrl: "https://example.com/rear-delt-fly-placeholder"
      }
    ]
  },
  {
    group: "Arms",
    target: "Biceps, triceps, forearms",
    workouts: [
      {
        name: "EZ-bar curl",
        sets: "3 x 8-12",
        focus: "Biceps mass",
        what: "A controlled curling movement that emphasizes biceps through elbow flexion.",
        equipment: ["EZ curl bar", "Weight plates"],
        formSteps: [
          "Stand upright with elbows tucked close to your sides.",
          "Curl weight by flexing elbows, keeping upper arms still.",
          "Squeeze biceps at the top without leaning backward.",
          "Lower slowly to full extension for each rep."
        ],
        videoUrl: "https://example.com/ez-curl-placeholder"
      },
      {
        name: "Hammer curl",
        sets: "3 x 10-12",
        focus: "Brachialis and forearms",
        what: "A neutral-grip curl that builds arm thickness and grip-supporting musculature.",
        equipment: ["Dumbbells"],
        formSteps: [
          "Hold dumbbells with palms facing each other.",
          "Curl up while keeping elbows pinned to your torso.",
          "Stop just before shoulders roll forward.",
          "Lower with control and maintain neutral wrist position."
        ],
        videoUrl: "https://example.com/hammer-curl-placeholder"
      },
      {
        name: "Rope pushdown",
        sets: "3 x 10-15",
        focus: "Triceps isolation",
        what: "A cable movement that isolates the triceps using elbow extension.",
        equipment: ["Cable stack", "Rope attachment"],
        formSteps: [
          "Set cable at top position and hold rope with elbows at your sides.",
          "Extend elbows fully while spreading rope at the bottom.",
          "Keep shoulders down and avoid leaning into the rep.",
          "Return to start with control while keeping tension on triceps."
        ],
        videoUrl: "https://example.com/rope-pushdown-placeholder"
      }
    ]
  },
  {
    group: "Legs (Quads + Hamstrings)",
    target: "Quads, hamstrings, calves",
    workouts: [
      {
        name: "Back squat",
        sets: "4 x 5-8",
        focus: "Lower-body strength",
        what: "A foundational leg lift that builds strength through knee and hip flexion.",
        equipment: ["Barbell", "Squat rack", "Weight plates"],
        formSteps: [
          "Set bar on upper traps, brace core, and set feet shoulder-width apart.",
          "Sit down and back while keeping knees tracking over toes.",
          "Descend to comfortable depth with neutral spine.",
          "Drive through midfoot to stand while keeping chest and hips rising together."
        ],
        videoUrl: "https://example.com/back-squat-placeholder"
      },
      {
        name: "Romanian deadlift",
        sets: "4 x 6-10",
        focus: "Hamstrings and glutes",
        what: "A hip-hinge lift focused on posterior-chain strength and hamstring loading.",
        equipment: ["Barbell or dumbbells"],
        formSteps: [
          "Start standing tall with soft knees and lats engaged.",
          "Hinge hips back while keeping bar close to your legs.",
          "Lower until you feel a strong hamstring stretch without spinal rounding.",
          "Drive hips forward to stand and squeeze glutes at the top."
        ],
        videoUrl: "https://example.com/rdl-placeholder"
      },
      {
        name: "Walking lunges",
        sets: "3 x 10 per leg",
        focus: "Single-leg control",
        what: "A unilateral lower-body move that builds balance, stability, and leg strength.",
        equipment: ["Bodyweight or dumbbells"],
        formSteps: [
          "Step forward long enough to keep both knees near 90 degrees.",
          "Lower under control until back knee is just above the floor.",
          "Push through front heel to stand and bring rear leg through.",
          "Keep torso upright and hips square throughout."
        ],
        videoUrl: "https://example.com/walking-lunge-placeholder"
      }
    ]
  },
  {
    group: "Glutes",
    target: "Glute max, glute med, posterior chain",
    workouts: [
      {
        name: "Hip thrust",
        sets: "4 x 6-10",
        focus: "Glute max power",
        what: "A glute-dominant bridge pattern that emphasizes hip extension strength.",
        equipment: ["Bench", "Barbell", "Padding", "Weight plates"],
        formSteps: [
          "Set upper back on bench edge and bar across hips with padding.",
          "Plant feet so shins are near vertical at lockout.",
          "Drive hips up by squeezing glutes, keeping ribs down.",
          "Pause at the top and lower slowly without collapsing."
        ],
        videoUrl: "https://example.com/hip-thrust-placeholder"
      },
      {
        name: "Bulgarian split squat",
        sets: "3 x 8-12 per leg",
        focus: "Glute and quad hypertrophy",
        what: "A rear-foot-elevated squat that loads each leg independently.",
        equipment: ["Bench or step", "Dumbbells (optional)"],
        formSteps: [
          "Place rear foot on bench and front foot far enough for stable descent.",
          "Lower by bending front knee while maintaining upright torso.",
          "Keep front knee aligned over toes and back knee moving down.",
          "Drive through front foot to stand and repeat."
        ],
        videoUrl: "https://example.com/bulgarian-split-squat-placeholder"
      },
      {
        name: "Cable kickback",
        sets: "3 x 12-15",
        focus: "Glute isolation",
        what: "A low-load glute isolation move that targets hip extension without spinal load.",
        equipment: ["Cable machine", "Ankle strap"],
        formSteps: [
          "Attach ankle strap and hold machine for balance.",
          "Slightly hinge forward and keep core braced.",
          "Kick working leg back using glute contraction, not lower-back swing.",
          "Return slowly and keep constant tension on each rep."
        ],
        videoUrl: "https://example.com/cable-kickback-placeholder"
      }
    ]
  },
  {
    group: "Core",
    target: "Abs, obliques, deep trunk stabilizers",
    workouts: [
      {
        name: "Plank variations",
        sets: "3 x 30-60 sec",
        focus: "Anti-extension core strength",
        what: "An isometric core drill that trains trunk stiffness and posture control.",
        equipment: ["Bodyweight", "Mat (optional)"],
        formSteps: [
          "Stack shoulders over elbows and align head, hips, and heels.",
          "Brace abs and glutes as if preparing for a punch.",
          "Breathe slowly while keeping hips level.",
          "End set once spinal position starts to break."
        ],
        videoUrl: "https://example.com/plank-placeholder"
      },
      {
        name: "Hanging knee raise",
        sets: "3 x 8-15",
        focus: "Lower abs and hip flexors",
        what: "A hanging core move that trains trunk control and lower abdominal strength.",
        equipment: ["Pull-up bar or captain chair"],
        formSteps: [
          "Hang with active shoulders and controlled body position.",
          "Tilt pelvis slightly and raise knees toward chest.",
          "Avoid swinging by lifting and lowering with control.",
          "Lower legs slowly to reset before each rep."
        ],
        videoUrl: "https://example.com/hanging-knee-raise-placeholder"
      },
      {
        name: "Pallof press",
        sets: "3 x 10-12 per side",
        focus: "Anti-rotation stability",
        what: "A cable or band anti-rotation drill that strengthens obliques and trunk stability.",
        equipment: ["Cable machine or resistance band"],
        formSteps: [
          "Stand sideways to cable or band and hold handle at chest height.",
          "Brace core and press handle straight out without torso turning.",
          "Pause briefly at full extension while keeping hips square.",
          "Bring hands back in and repeat for controlled reps."
        ],
        videoUrl: "https://example.com/pallof-press-placeholder"
      }
    ]
  }
];

const trainingSections = [
  {
    title: "Rest Days",
    summary: "Recovery days are where adaptation happens, not a break from progress.",
    points: [
      "Take at least 1 to 2 full recovery days each week.",
      "Use light walking or mobility instead of hard training on rest days.",
      "If soreness or fatigue stays high for days, add recovery before adding volume."
    ]
  },
  {
    title: "Progressive Overload",
    summary: "To improve, training demand should gradually increase over time.",
    points: [
      "Increase one variable at a time: weight, reps, sets, or tempo quality.",
      "Use small weekly jumps and keep form strict before adding load.",
      "If technique breaks, hold load steady and progress with cleaner reps first."
    ]
  },
  {
    title: "Push vs Pull Days",
    summary: "Splitting movement patterns helps balance training stress and recovery.",
    points: [
      "Push day: chest, shoulders, triceps pressing patterns.",
      "Pull day: back, rear delts, biceps pulling patterns.",
      "Match pulling volume to pushing volume to support shoulder health."
    ]
  },
  {
    title: "Volume and Intensity",
    summary: "Effective plans manage both how much work you do and how hard it is.",
    points: [
      "Main lifts: lower reps and heavier load with longer rest periods.",
      "Accessory lifts: moderate reps and controlled tempo for hypertrophy.",
      "Keep 1 to 3 reps in reserve most sets to manage fatigue."
    ]
  },
  {
    title: "Deload Strategy",
    summary: "Planned easier weeks help you recover and continue progressing.",
    points: [
      "Every 4 to 8 weeks, reduce load or set count by roughly 30 to 50 percent.",
      "Maintain movement patterns, but lower overall stress.",
      "Return to normal training when joints, sleep, and performance improve."
    ]
  },
  {
    title: "Warm-Up and Prep",
    summary: "A focused warm-up improves movement quality and reduces injury risk.",
    points: [
      "Start with 5 to 10 minutes of low-intensity cardio or dynamic movement.",
      "Add mobility drills specific to the session (hips, shoulders, thoracic spine).",
      "Perform ramp-up sets before your first heavy working set."
    ]
  }
];

export default function TipsView() {
  const [activeGroup, setActiveGroup] = useState("All");
  const [selectedExercise, setSelectedExercise] = useState(null);
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
        target: guide.target,
        imageUrl: `https://placehold.co/640x420?text=${encodeURIComponent(workout.name)}`
      }))
    );
  }, [activeGroup]);

  return (
    <section className="panel dashboard-card span-2 tips-view">
      <div className="panel-header">
        <div>
          <h2>Workout guide</h2>
          <p className="muted">
            Click any workout tile to open detailed guidance with form steps, equipment, and
            a placeholder video link.
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
          <button
            key={`${exercise.group}-${exercise.name}`}
            type="button"
            className="exercise-tile"
            onClick={() => setSelectedExercise(exercise)}
          >
            <img src={exercise.imageUrl} alt={exercise.name} loading="lazy" />
            <div className="exercise-tile-meta">
              <p className="exercise-group">{exercise.group}</p>
              <h3>{exercise.name}</h3>
            </div>
          </button>
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

      <section className="training-guide">
        <h3>Guide to Effective Workout Structure</h3>
        <p className="muted">
          Use these principles to organize your week, recover well, and keep results moving.
        </p>
        <div className="training-guide-grid">
          {trainingSections.map((section) => (
            <article key={section.title} className="training-card">
              <h4>{section.title}</h4>
              <p>{section.summary}</p>
              <ul className="training-points">
                {section.points.map((point) => (
                  <li key={`${section.title}-${point}`}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {selectedExercise && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedExercise(null)}
        >
          <div className="modal exercise-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedExercise.name}</h3>
              <button type="button" className="ghost" onClick={() => setSelectedExercise(null)}>
                Close
              </button>
            </div>

            <img
              className="exercise-modal-image"
              src={selectedExercise.imageUrl}
              alt={selectedExercise.name}
            />

            <div className="exercise-modal-body">
              <p className="exercise-target">
                <strong>Hits:</strong> {selectedExercise.target}
              </p>
              <p className="exercise-sets">
                <strong>Sets/Reps:</strong> {selectedExercise.sets}
              </p>
              <p className="exercise-focus">
                <strong>Goal:</strong> {selectedExercise.focus}
              </p>
              <p className="exercise-what">{selectedExercise.what}</p>

              <div className="equipment-list">
                {selectedExercise.equipment.map((item) => (
                  <span key={`${selectedExercise.name}-${item}`} className="equipment-chip">
                    {item}
                  </span>
                ))}
              </div>

              <section className="exercise-details-open">
                <h4>How to perform</h4>
                <ol>
                  {selectedExercise.formSteps.map((step) => (
                    <li key={`${selectedExercise.name}-${step}`}>{step}</li>
                  ))}
                </ol>
              </section>

              <a
                href={selectedExercise.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="video-link"
              >
                Reference video (placeholder)
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
