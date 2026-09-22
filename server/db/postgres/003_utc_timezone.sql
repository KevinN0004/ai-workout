-- Makes UTC a property of the database rather than of each client's connection.
--
-- The app previously pinned it per connection, with `options=-c timezone=UTC`
-- on both the Prisma adapter and the migration pool. That works against a
-- direct Postgres connection and **fails against a pooled one**: PgBouncer
-- tracks only client_encoding, datestyle, timezone and
-- standard_conforming_strings in startup packets and raises an error on any
-- other, and `options` is not on that list. Neon's pooled endpoint is
-- PgBouncer in transaction mode, so the parameter would have broken the
-- connection outright -- for the app and for the migration runner that applies
-- this file.
--
-- Setting it here instead survives pooling, because a pooled server connection
-- inherits the database default when it is established rather than negotiating
-- it per client. It also means anything else that ever connects -- psql, an
-- admin query, a future service -- gets UTC without having to know to ask.
--
-- Why it matters at all: the driver sends a JS Date as UTC wall-clock digits
-- with no offset, and Postgres labels them with the session zone. Measured on a
-- UTC-7 host, an instant of 05:06:49Z stored as `05:06:49-07`, seven hours out.
-- It hid because the driver drops the offset again on read, so a JS write
-- followed by a JS read round-trips exactly -- while anything Postgres itself
-- wrote (the set_updated_at trigger) came back seven hours early.
--
-- Takes effect for sessions established after it runs; existing ones keep the
-- zone they started with.
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'UTC');
end
$$;
