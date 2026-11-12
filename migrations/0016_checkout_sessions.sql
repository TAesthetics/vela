-- VELA+: the latest Stripe Checkout session per person, so a double tap or a
-- second "VELA+ holen" reuses the still-open payment page instead of opening a
-- second one (two completed pages would mean two subscriptions and paying
-- twice). Only Stripe's session id is kept; deleted with the account.
create table if not exists vela_checkout_sessions (
  user_id text primary key,
  session_id text not null,
  created_at timestamptz not null default now()
);
