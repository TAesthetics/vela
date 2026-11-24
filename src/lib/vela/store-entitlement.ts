/**
 * Pure VELA+ rules for in-app purchases (App Store / Google Play via
 * RevenueCat). No server imports, so it is unit-tested. The webhook and the
 * REST read live in store-purchases.server.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Stores whose purchases can grant VELA+ (RevenueCat's `store` values). */
export type StoreName = "app_store" | "play_store";

/** What VELA keeps about a store purchase: the entitlement, never a receipt. */
export type StoreEntitlement = {
  store: StoreName | null;
  productId: string | null;
  /** Epoch ms; null = no expiry (lifetime) when active. */
  expiresAt: number | null;
  active: boolean;
};

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * RevenueCat sends the Authorization value configured in its dashboard
 * verbatim. Accept exactly that value, or "Bearer <value>" when only the
 * secret part was put into REVENUECAT_WEBHOOK_AUTH. Constant time.
 */
export function webhookAuthorized(header: string | null, expected: string | undefined): boolean {
  const want = expected?.trim();
  if (!want || !header) return false;
  const given = header.trim();
  return safeEqual(given, want) || safeEqual(given, `Bearer ${want}`);
}

/**
 * Optional HMAC check (X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hex>),
 * computed over "<t>.<raw body>". Same scheme as Stripe's.
 */
export function webhookSignatureValid(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1" && value) signatures.push(value);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  return signatures.some((sig) => safeEqual(sig, expected));
}

/** At most this many accounts are re-read per webhook event. */
const MAX_IDS = 10;
/** VELA account ids are short opaque strings; anything else is ignored. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The VELA accounts a RevenueCat event may change: the purchaser, their
 * aliases and both sides of a transfer (restore on another account).
 * RevenueCat's anonymous ids ($RCAnonymousID:…) are not VELA accounts.
 */
export function eventUserIds(event: unknown): string[] {
  if (!event || typeof event !== "object") return [];
  const e = event as Record<string, unknown>;
  const candidates: unknown[] = [e.app_user_id, e.original_app_user_id];
  for (const key of ["aliases", "transferred_from", "transferred_to"]) {
    const list = e[key];
    if (Array.isArray(list)) candidates.push(...list);
  }
  const ids: string[] = [];
  for (const value of candidates) {
    if (typeof value !== "string" || !ID_PATTERN.test(value)) continue;
    if (!ids.includes(value)) ids.push(value);
    if (ids.length >= MAX_IDS) break;
  }
  return ids;
}

function epoch(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : null;
}

function storeName(value: unknown): StoreName | null {
  return value === "app_store" || value === "play_store" ? value : null;
}

/**
 * The VELA+ entitlement from RevenueCat's GET /v1/subscribers/{id} response.
 * Active while the entitlement (or its billing grace period) has not expired;
 * no expiry date means a non-expiring purchase. Purchases from other stores
 * (Stripe via RevenueCat, promotional) do not count here: Stripe is handled
 * by VELA itself.
 */
export function entitlementFromSubscriber(
  body: unknown,
  entitlementId: string,
  now = Date.now(),
): StoreEntitlement {
  const none: StoreEntitlement = { store: null, productId: null, expiresAt: null, active: false };
  const subscriber = (body as { subscriber?: Record<string, unknown> } | null)?.subscriber;
  if (!subscriber || typeof subscriber !== "object") return none;
  const entitlements = subscriber.entitlements as Record<string, Record<string, unknown>> | undefined;
  const entitlement = entitlements?.[entitlementId];
  if (!entitlement || typeof entitlement !== "object") return none;
  const productId = typeof entitlement.product_identifier === "string" ? entitlement.product_identifier : null;
  const subscriptions = subscriber.subscriptions as Record<string, Record<string, unknown>> | undefined;
  const nonSubscriptions = subscriber.non_subscriptions as Record<string, Array<Record<string, unknown>>> | undefined;
  const store = storeName(
    (productId && subscriptions?.[productId]?.store) ?? (productId && nonSubscriptions?.[productId]?.at(-1)?.store),
  );
  const expires = epoch(entitlement.expires_date);
  const grace = epoch(entitlement.grace_period_expires_date);
  const until = expires === null ? null : Math.max(expires, grace ?? 0);
  const active = store !== null && (until === null || until > now);
  return { store, productId, expiresAt: until, active };
}

/** Whether a stored store row grants VELA+ right now. */
export function storeRowActive(
  row: { active: boolean | string; expires_at: string | Date | null } | undefined,
  now = Date.now(),
): boolean {
  if (!row) return false;
  if (!(row.active === true || row.active === "t" || row.active === "true")) return false;
  if (row.expires_at === null) return true;
  const at = new Date(row.expires_at).getTime();
  return Number.isFinite(at) && at > now;
}
