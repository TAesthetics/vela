-- Binds each address from ADMIN_EMAILS to the first account that used admin
-- access with it. E-mails are not verified, so if that account were ever
-- deleted, someone else could register the same address; the pin keeps them
-- out. No foreign key on purpose: the pin must outlive a deleted account.
-- Recovery (operator re-registered): set ADMIN_USER_IDS to the new account ID.
create table if not exists vela_admin_pins (
  email text primary key,
  user_id text not null,
  pinned_at timestamptz not null default now()
);
