-- VELA+ bought in the iOS / Android app (App Store, Google Play), via
-- RevenueCat. One row per person with the current entitlement only, kept
-- fresh by /api/revenuecat/webhook. No receipts, no payment data: Apple and
-- Google keep those. Deleted together with the account.
create table if not exists vela_store_purchases (
  user_id text primary key,
  store text,
  product_id text,
  expires_at timestamptz,
  active boolean not null default false,
  updated_at timestamptz not null default now()
);
