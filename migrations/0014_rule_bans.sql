-- Operator bans for rule violations (harassment, hate, spam, scams), separate
-- from the age suspension: profile status 'banned', no ID upload path.
-- The audit log gets 'banned' / 'unbanned' entries.
alter table vela_age_flags drop constraint if exists vela_age_flags_action_check;
alter table vela_age_flags add constraint vela_age_flags_action_check
  check (action in ('none', 'review', 'suspended', 'banned', 'unbanned'));
