-- One answer per user, week and lift to the week's progression (roadmap B4,
-- docs/specs/2026-11-06-adaptive-progression-design.md). lift_key is the
-- lower-cased lift name, or '' for the week's own answer, which is "normal".
--
-- The unique constraint is full, not partial, so Prisma can name it and the
-- repository can upsert on it. An answer covers its week only, and the table is
-- not tied to a plan, so a regenerated plan keeps the week's answers for the
-- lifts it still has. Removed with its user.
create table progression_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  lift_key text not null check (char_length(lift_key) <= 140),
  decision text not null check (decision in ('undo', 'accept', 'decline', 'normal')),
  created_at timestamptz not null default now(),
  constraint progression_decisions_week_answer_check check ((lift_key = '') = (decision = 'normal')),
  constraint progression_decisions_user_week_lift_key unique (user_id, week_start, lift_key)
);
