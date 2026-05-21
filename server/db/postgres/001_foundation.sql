create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  legacy_user_id text unique,
  email text not null,
  password_hash text not null,
  password_salt text not null default '',
  password_algo text not null default 'argon2id',
  profile jsonb not null default '{}'::jsonb,
  goals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_password_algo_check check (password_algo in ('argon2id', 'pbkdf2'))
);

create unique index if not exists app_users_email_lower_idx on app_users (lower(email));

create table if not exists workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  legacy_id text,
  workout_date date,
  focus text not null default 'General',
  duration_minutes integer,
  exercises jsonb not null default '[]'::jsonb,
  sets integer,
  reps integer,
  intensity_rpe numeric(4, 1),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_sessions_duration_check check (
    duration_minutes is null or duration_minutes between 5 and 360
  ),
  constraint workout_sessions_intensity_check check (
    intensity_rpe is null or intensity_rpe between 1 and 10
  )
);

create unique index if not exists workout_sessions_user_legacy_idx
  on workout_sessions (user_id, legacy_id)
  where legacy_id is not null;
create index if not exists workout_sessions_user_created_idx
  on workout_sessions (user_id, created_at desc);
create index if not exists workout_sessions_user_date_idx
  on workout_sessions (user_id, workout_date desc);

create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  legacy_id text,
  meal_date date,
  meal_type text not null default 'other',
  name text not null,
  calories integer,
  protein_g numeric(8, 2),
  carbs_g numeric(8, 2),
  fat_g numeric(8, 2),
  notes text not null default '',
  logged_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_logs_meal_type_check check (
    meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'drink', 'other')
  ),
  constraint meal_logs_calories_check check (calories is null or calories between 0 and 5000)
);

create unique index if not exists meal_logs_user_legacy_idx
  on meal_logs (user_id, legacy_id)
  where legacy_id is not null;
create index if not exists meal_logs_user_logged_idx on meal_logs (user_id, logged_at desc);
create index if not exists meal_logs_user_date_idx on meal_logs (user_id, meal_date desc);

create table if not exists progress_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  legacy_id text,
  metric_date date,
  weight_lb numeric(8, 2),
  body_fat_pct numeric(5, 2),
  waist_cm numeric(8, 2),
  resting_hr integer,
  notes text not null default '',
  logged_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists progress_metrics_user_legacy_idx
  on progress_metrics (user_id, legacy_id)
  where legacy_id is not null;
create index if not exists progress_metrics_user_logged_idx
  on progress_metrics (user_id, logged_at desc);
create index if not exists progress_metrics_user_date_idx
  on progress_metrics (user_id, metric_date desc);

create table if not exists calorie_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  legacy_id text,
  calorie_date date not null,
  calories integer not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calorie_entries_calories_check check (calories between 0 and 10000),
  constraint calorie_entries_source_check check (source in ('manual', 'meal_logs'))
);

create unique index if not exists calorie_entries_user_legacy_idx
  on calorie_entries (user_id, legacy_id)
  where legacy_id is not null;
create index if not exists calorie_entries_user_date_idx
  on calorie_entries (user_id, calorie_date desc);

create table if not exists generated_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  legacy_id text,
  goal text not null default '',
  equipment jsonb not null default '[]'::jsonb,
  duration_minutes integer,
  level text not null default '',
  injuries text not null default '',
  days integer,
  environment text not null default '',
  focuses jsonb not null default '[]'::jsonb,
  plan_text text not null default '',
  plan_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists generated_plans_user_legacy_idx
  on generated_plans (user_id, legacy_id)
  where legacy_id is not null;
create index if not exists generated_plans_user_created_idx
  on generated_plans (user_id, created_at desc);

create table if not exists saved_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  legacy_id text,
  external_exercise_id integer,
  name text not null,
  category text not null default '',
  muscles jsonb not null default '[]'::jsonb,
  equipment jsonb not null default '[]'::jsonb,
  image_url text not null default '',
  video_url text not null default '',
  reason text not null default '',
  source text not null default 'wger',
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists saved_exercises_user_external_idx
  on saved_exercises (user_id, external_exercise_id)
  where external_exercise_id is not null;
create unique index if not exists saved_exercises_user_name_lower_idx
  on saved_exercises (user_id, lower(name));
create index if not exists saved_exercises_user_saved_idx
  on saved_exercises (user_id, saved_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists app_users_set_updated_at on app_users;
create trigger app_users_set_updated_at
before update on app_users
for each row execute function set_updated_at();

drop trigger if exists workout_sessions_set_updated_at on workout_sessions;
create trigger workout_sessions_set_updated_at
before update on workout_sessions
for each row execute function set_updated_at();

drop trigger if exists meal_logs_set_updated_at on meal_logs;
create trigger meal_logs_set_updated_at
before update on meal_logs
for each row execute function set_updated_at();

drop trigger if exists progress_metrics_set_updated_at on progress_metrics;
create trigger progress_metrics_set_updated_at
before update on progress_metrics
for each row execute function set_updated_at();

drop trigger if exists calorie_entries_set_updated_at on calorie_entries;
create trigger calorie_entries_set_updated_at
before update on calorie_entries
for each row execute function set_updated_at();

drop trigger if exists generated_plans_set_updated_at on generated_plans;
create trigger generated_plans_set_updated_at
before update on generated_plans
for each row execute function set_updated_at();

drop trigger if exists saved_exercises_set_updated_at on saved_exercises;
create trigger saved_exercises_set_updated_at
before update on saved_exercises
for each row execute function set_updated_at();
