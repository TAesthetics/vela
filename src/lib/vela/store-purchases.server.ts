/**
 * VELA+ via in-app purchase (App Store / Google Play) through RevenueCat,
 * server only. Inactive until configured; Stripe on the web is unaffected.
 *
 * Env:
 *   REVENUECAT_WEBHOOK_AUTH    value of the webhook's Authorization header
 *                              (set the same in the RevenueCat dashboard)
 *   REVENUECAT_SECRET_KEY      secret REST API key (sk_...), to re-read the
 *                              customer after every event (order-safe)
 *   REVENUECAT_WEBHOOK_SECRET  optional HMAC signing secret of the webhook
 *   REVENUECAT_ENTITLEMENT     entitlement identifier, default "plus"
 *
 * The app must identify buyers with their VELA account id
 * (Purchases.logIn(userId)), so app_user_id is the VELA user id.
 */
import type { Sql } from "@/lib/db";
import { env } from "@/lib/env.server";
import { syncPlus } from "./stripe.server";
import { entitlementFromSubscriber, eventUserIds, type StoreEntitlement } from "./store-entitlement";

export class RevenueCatError extends Error {}

export function revenueCatConfigured(): boolean {
  return Boolean(env("REVENUECAT_WEBHOOK_AUTH") && env("REVENUECAT_SECRET_KEY"));
}

function entitlementId(): string {
  return env("REVENUECAT_ENTITLEMENT") ?? "plus";
}

/** Fresh entitlement of one customer from RevenueCat (never trusts the event body). */
async function fetchEntitlement(userId: string): Promise<StoreEntitlement> {
  const key = env("REVENUECAT_SECRET_KEY");
  if (!key) throw new RevenueCatError("RevenueCat ist nicht eingerichtet.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      // Never log the key or the response body (it can contain purchase details).
      throw new RevenueCatError(`RevenueCat ${res.status}`);
    }
    return entitlementFromSubscriber(json, entitlementId());
  } finally {
    clearTimeout(timer);
  }
}

/** Store the entitlement and mirror it onto the Plus flag (with Stripe). */
async function saveEntitlement(sql: Sql, userId: string, state: StoreEntitlement): Promise<void> {
  const existing = await sql`select 1 from vela_store_purchases where user_id = ${userId}`;
  // Nothing bought and nothing stored: no row for people who never used the store.
  if (existing.length === 0 && !state.active) return;
  const expires = state.expiresAt === null ? null : new Date(state.expiresAt).toISOString();
  await sql`
    insert into vela_store_purchases (user_id, store, product_id, expires_at, active, updated_at)
    values (${userId}, ${state.store}, ${state.productId}, ${expires}, ${state.active}, now())
    on conflict (user_id) do update set
      store = excluded.store,
      product_id = excluded.product_id,
      expires_at = excluded.expires_at,
      active = excluded.active,
      updated_at = now()
  `;
  await syncPlus(sql, userId);
}

/**
 * Handle one webhook event: re-read every VELA account it touches from
 * RevenueCat and store the result. Unknown ids (deleted accounts, anonymous
 * buyers) are skipped, so a late event never re-creates a deleted account's data.
 */
export async function handleRevenueCatEvent(sql: Sql, event: unknown): Promise<number> {
  const type = (event as { type?: unknown } | null)?.type;
  if (type === "TEST") return 0;
  const ids = eventUserIds(event);
  if (ids.length === 0) return 0;
  let updated = 0;
  for (const id of ids) {
    const known = await sql`select 1 from "user" where id = ${id}`;
    if (known.length === 0) continue;
    await saveEntitlement(sql, id, await fetchEntitlement(id));
    updated += 1;
  }
  return updated;
}
