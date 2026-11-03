-- One-time password reset links that the operator creates on /admin/age for a
-- person who wrote in from their account's e-mail address (there is no mail
-- service, so nothing is sent automatically). Only a SHA-256 hash of the token
-- is stored; links expire after 24 hours and work once.
create table if not exists vela_password_resets (
  token_hash text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists vela_password_resets_user_idx on vela_password_resets (user_id);
