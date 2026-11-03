-- Removes the target weight sign-up stored in every account (roadmap Phase 6).
-- A target is the user's own choice, so the app reads it as absent until they
-- save one, but every account was created holding 160 lb, chosen or not.
--
-- Only goals still exactly at the sign-up defaults are cleared: any other goals
-- mean the user saved something, and a stored 160 among them may be theirs. A
-- user who deliberately saved exactly these three is asked for the target once
-- more. Equality on jsonb ignores key order, and containment (@>) would also
-- match goals holding other keys.
update app_users
   set goals = goals - 'targetWeight'
 where goals = '{"targetWeight": 160, "targetCalories": 2200, "weeklyWorkouts": 3}'::jsonb;
