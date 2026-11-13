-- Strava import (roadmap C2, docs/specs/2026-11-12-strava-import-design.md).
-- An imported activity is a workout session with source 'strava'; a session
-- logged in the app keeps source NULL. A missing distance or heart rate stays
-- NULL: Strava's distance 0 means "no distance", so only a positive one is kept.
alter table workout_sessions
  add column source text check (source in ('strava')),
  add column external_id text check (char_length(external_id) <= 40),
  add column sport text check (char_length(sport) <= 60),
  add column distance_meters numeric(10, 1) check (distance_meters > 0),
  add column average_heartrate numeric(5, 1) check (average_heartrate > 0),
  add constraint workout_sessions_external_source_check
    check ((source is null) = (external_id is null));

-- Partial, so Prisma cannot name it: the repository reads, then writes.
create unique index workout_sessions_user_source_external_idx
  on workout_sessions (user_id, source, external_id)
  where external_id is not null;

-- One Strava connection per user, and one user per Strava athlete. The tokens
-- are sealed with AES-256-GCM (services/integrations/tokenCipher.js), never
-- stored in the clear. Removed with its user.
create table strava_connections (
  user_id uuid primary key references app_users (id) on delete cascade,
  athlete_id bigint not null unique,
  athlete_name text not null default '' check (char_length(athlete_name) <= 140),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_error text check (char_length(last_sync_error) <= 40),
  needs_reconnect boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger strava_connections_set_updated_at
before update on strava_connections
for each row execute function set_updated_at();

-- The Strava activities a user deleted here, so no import brings them back.
-- Removed with its user.
create table strava_deleted_activities (
  user_id uuid not null references app_users (id) on delete cascade,
  external_id text not null check (char_length(external_id) <= 40),
  deleted_at timestamptz not null default now(),
  primary key (user_id, external_id)
);
