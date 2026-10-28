-- VELA+ via Stripe: one row per person with their Stripe customer and the
-- latest subscription state (kept current by /api/stripe/webhook). Payment
-- data (card numbers, wallets) never reaches us; Stripe keeps it.
create table if not exists vela_subscriptions (
  user_id text primary key,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists vela_subscriptions_customer_idx on vela_subscriptions (stripe_customer_id);
create index if not exists vela_subscriptions_subscription_idx on vela_subscriptions (stripe_subscription_id);
