-- The sets of a workout session, one row per set (roadmap B1,
-- docs/specs/2026-11-05-per-set-logging-design.md). A set holds reps or seconds,
-- exactly one of the two, plus an optional load in kg and an optional RPE.
--
-- Zero is kept where it is a measurement: 0 reps is a failed set and 0 kg is
-- bodyweight work. A hold of 0 seconds is no hold, so seconds start at 1. A
-- blank is null, never 0.
--
-- user_id repeats what the session already knows, so B2's per-user queries over
-- every set need no join. The save writes it from the session row itself.
create table exercise_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions (id) on delete cascade,
  user_id uuid not null references app_users (id) on delete cascade,
  exercise_order smallint not null check (exercise_order between 0 and 17),
  exercise_name text not null check (char_length(exercise_name) between 1 and 140),
  set_number smallint not null check (set_number between 1 and 20),
  reps smallint check (reps between 0 and 200),
  seconds smallint check (seconds between 1 and 3600),
  load_kg numeric(6, 2) check (load_kg between 0 and 1000),
  rpe numeric(3, 1) check (rpe between 1 and 10),
  created_at timestamptz not null default now(),
  constraint exercise_sets_reps_or_seconds_check check (num_nonnulls(reps, seconds) = 1),
  constraint exercise_sets_session_order_set_key unique (session_id, exercise_order, set_number)
);

-- B2 looks up a lift's sets across a user's history by name, in any case.
create index exercise_sets_user_exercise_idx on exercise_sets (user_id, lower(exercise_name));
