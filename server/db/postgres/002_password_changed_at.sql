-- Set only when a user deliberately changes their password. Deliberately NOT
-- set by the pbkdf2 -> argon2id upgrade that runs on login: that upgrade is
-- invisible to the user, and stamping it here would sign them out of every
-- other device every time a legacy-hash account logs in.
alter table app_users add column if not exists password_changed_at timestamptz;
