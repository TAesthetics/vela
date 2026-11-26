-- When someone accepted the AGB with the community rules (no tolerance for
-- abusive content or people, Apple 1.2) while creating their profile. Set once
-- on the first save, kept afterwards; profiles from before stay null.
alter table vela_profiles add column if not exists terms_accepted_at timestamptz;
