-- Full account deletion (DSGVO Art. 17) removes the login user, but an open age
-- suspension must not be dodged by deleting and signing in again. For that case
-- only, we keep a keyed hash of the login identity (provider + account id) for
-- at most 12 months; no name, e-mail or profile data.
create table if not exists vela_deleted_identities (
  identity_hash text primary key,
  reason text not null default 'age_suspension',
  created_at timestamptz not null default now()
);
