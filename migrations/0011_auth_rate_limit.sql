-- Better Auth rate limiting stored in Postgres (rateLimit.storage = "database").
-- On Vercel every request can land on a fresh serverless instance, so the
-- default in-memory counter would reset constantly. This table makes the
-- sign-in / sign-up limits hold across instances. Columns are camelCase and
-- double-quoted because that is what Better Auth queries.
create table if not exists "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);

create index if not exists "rateLimit_lastRequest_idx" on "rateLimit" ("lastRequest");
