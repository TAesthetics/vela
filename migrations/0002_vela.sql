create table if not exists vela_profiles (
  user_id text primary key,
  name text not null,
  age integer not null,
  city text not null,
  orbit text not null,
  values jsonb not null,
  prompts jsonb not null,
  photo text,
  plus boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists vela_swipes (
  from_user text not null,
  to_user text not null,
  direction text not null,
  prompt_id text,
  note text not null default '',
  day text not null,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user)
);

create index if not exists vela_swipes_to_idx on vela_swipes (to_user);

create table if not exists vela_messages (
  id text primary key,
  pair_a text not null,
  pair_b text not null,
  from_user text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists vela_messages_pair_idx on vela_messages (pair_a, pair_b, created_at);
