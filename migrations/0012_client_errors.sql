-- Own, minimal error monitoring (no third-party service). Crashes in the
-- web/native app are grouped by fingerprint; we store no user id, no IP and
-- no query strings. Rows are deleted 30 days after they were last seen
-- (purgeExpired in src/lib/vela/age-review.server.ts).
create table if not exists vela_client_errors (
  fingerprint text primary key,
  message text not null,
  stack text not null default '',
  path text not null default '',
  platform text not null default 'web',
  release text not null default '',
  count integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index if not exists vela_client_errors_last_seen_idx on vela_client_errors (last_seen);
