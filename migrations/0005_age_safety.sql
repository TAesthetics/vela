-- Age safety: AI minor detection, suspension and ID review.

-- Profile status: 'active' or 'suspended_age' (hidden everywhere, can't act).
alter table vela_profiles add column if not exists status text not null default 'active';
alter table vela_profiles add column if not exists suspended_at timestamptz;

-- Open reports can be marked reviewed by the operator.
alter table vela_reports add column if not exists reviewed_at timestamptz;

-- Audit trail of every age signal (AI result or "Minderjährig" report).
-- Never contains photos; `signals` holds short reasons from the model.
create table if not exists vela_age_flags (
  id text primary key,
  user_id text not null,
  source text not null check (source in ('profile', 'message', 'report', 'operator')),
  minor_likelihood real,
  signals jsonb not null default '[]',
  model text,
  action text not null check (action in ('none', 'review', 'suspended')),
  created_at timestamptz not null default now()
);

create index if not exists vela_age_flags_user_idx on vela_age_flags (user_id, created_at);

-- ID documents for unban requests. `image` is a base64 JPEG kept only in the
-- database (never a public URL) and nulled as soon as the operator decides, or
-- after 30 days at the latest.
create table if not exists vela_id_checks (
  id text primary key,
  user_id text not null,
  image text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

create index if not exists vela_id_checks_status_idx on vela_id_checks (status, created_at);
