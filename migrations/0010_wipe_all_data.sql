-- One-off wipe requested by the owner (2026-10-28): empties every table in the
-- public schema — accounts, sessions, profiles, swipes/matches, messages,
-- blocks, reports, age flags, ID uploads, subscriptions, deleted-identity
-- hashes, everything — but keeps the schema and the _migrations bookkeeping,
-- so the app keeps running empty. Runs once like every migration.
do $$
declare
  tables text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
    into tables
    from pg_tables
   where schemaname = 'public'
     and tablename <> '_migrations';
  if tables is not null then
    execute 'truncate table ' || tables || ' restart identity cascade';
  end if;
end
$$;
