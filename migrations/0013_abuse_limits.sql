-- Per-person abuse limits (messages, sparks, reports) count recent rows by
-- sender, so these lookups need an index on (from_user, created_at).
create index if not exists vela_messages_from_idx on vela_messages (from_user, created_at);
create index if not exists vela_reports_from_idx on vela_reports (from_user, created_at);
