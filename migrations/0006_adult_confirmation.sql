-- When the person ticked "Ich bin mindestens 18 Jahre alt" at onboarding.
-- Kept as proof of the self-declaration; profiles created before this stay null.
alter table vela_profiles add column if not exists adult_confirmed_at timestamptz;
