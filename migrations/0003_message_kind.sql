-- Distinguish the like note (sent with a spark) from real chat messages.
-- Only real messages count toward lifting the veil.
alter table vela_messages add column if not exists kind text not null default 'message';

-- Backfill: messages that are the spark note of the sender's swipe on the
-- other person in the same pair are notes, not chat messages.
update vela_messages m
set kind = 'note'
from vela_swipes s
where s.direction = 'spark'
  and s.note <> ''
  and s.note = m.body
  and s.from_user = m.from_user
  and (
    (m.pair_a = s.from_user and m.pair_b = s.to_user)
    or (m.pair_b = s.from_user and m.pair_a = s.to_user)
  );
