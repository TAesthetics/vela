-- Block & report. A block hides both people from each other everywhere
-- (deck, likes, matches, chats) and rejects swipes/messages between them.
create table if not exists vela_blocks (
  from_user text not null,
  to_user text not null,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user)
);

create index if not exists vela_blocks_to_idx on vela_blocks (to_user);

create table if not exists vela_reports (
  id text primary key,
  from_user text not null,
  to_user text not null,
  reason text not null check (
    reason in ('fake', 'harassment', 'photos', 'minor', 'spam', 'other')
  ),
  details text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists vela_reports_to_idx on vela_reports (to_user, created_at);
