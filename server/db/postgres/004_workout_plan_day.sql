-- Links a workout session to the day of a generated plan it was logged against
-- (roadmap Phase 5). Both columns stay null for a workout logged off-plan.
--
-- Deleting a plan must never delete a session: the generate route prunes each
-- user's plans past the newest 200. So the reference is ON DELETE SET NULL, and
-- that clears only generated_plan_id, leaving plan_day_index behind. The link
-- check therefore allows an index without a plan (a plan always has an index),
-- and the read ignores an index whose plan is gone. A check requiring both or
-- neither would make every delete of a plan with a linked session fail.
--
-- The index also serves those deletes: each one has to find the sessions that
-- reference the plan, which without it is a scan.
alter table workout_sessions
  add column generated_plan_id uuid references generated_plans (id) on delete set null,
  add column plan_day_index smallint,
  add constraint workout_sessions_plan_day_index_check
    check (plan_day_index is null or plan_day_index >= 0),
  add constraint workout_sessions_plan_link_check
    check (generated_plan_id is null or plan_day_index is not null);

create index workout_sessions_plan_day_idx
  on workout_sessions (generated_plan_id, plan_day_index);
