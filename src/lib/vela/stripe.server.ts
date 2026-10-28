/**
 * VELA+ billing with Stripe (server only). Plain fetch against the Stripe REST
 * API, no SDK, so it stays small and serverless-friendly.
 *
 * Env:
 *   STRIPE_SECRET_KEY      sk_live_... / sk_test_... (required for payments)
 *   STRIPE_WEBHOOK_SECRET  whsec_... of the /api/stripe/webhook endpoint
 *   STRIPE_PRICE_ID        optional price_...; otherwise 10 EUR / month inline
 *
 * Checkout runs on Stripe's hosted page without `payment_method_types`, so the
 * payment methods enabled in the Stripe dashboard show up there (card, Apple
 * Pay, Google Pay, ...).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Sql } from "@/lib/db";
import { env } from "@/lib/env.server";

export const PLUS_PRICE_CENTS = 1000;
export const PLUS_CURRENCY = "eur";

/** Subscription states that grant Plus (past_due: Stripe is still retrying). */
const ACTIVE = new Set(["active", "trialing", "past_due"]);

export function stripeConfigured(): boolean {
  return Boolean(env("STRIPE_SECRET_KEY"));
}

export function isActiveStatus(status: string | null | undefined): boolean {
  return Boolean(status && ACTIVE.has(status));
}

type Params = Record<string, string | number | boolean | undefined | null>;

function form(params: Params): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.append(key, String(value));
  }
  return body.toString();
}

export class StripeError extends Error {}

async function stripe<T = Record<string, unknown>>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Params = {},
): Promise<T> {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new StripeError("Stripe ist nicht eingerichtet.");
  const query = method === "GET" && Object.keys(params).length ? `?${form(params)}` : "";
  const res = await fetch(`https://api.stripe.com/v1${path}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" ? undefined : form(params),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) {
    // Never log the key; the Stripe message is safe to log.
    console.error("[stripe]", method, path, res.status, json.error?.message);
    throw new StripeError(json.error?.message ?? `Stripe ${res.status}`);
  }
  return json;
}

export type BillingRow = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  current_period_end: string | Date | null;
  cancel_at_period_end: boolean | string;
};

export async function billingOf(sql: Sql, userId: string): Promise<BillingRow | undefined> {
  const rows = await sql<BillingRow>`
    select user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, cancel_at_period_end
    from vela_subscriptions where user_id = ${userId}
  `;
  return rows[0];
}

/** Mirror the subscription state onto the profile flag every Plus check reads. */
export async function syncPlus(sql: Sql, userId: string): Promise<void> {
  const row = await billingOf(sql, userId);
  if (!row) return;
  const plus = isActiveStatus(row.status);
  await sql`update vela_profiles set plus = ${plus} where user_id = ${userId}`;
}

/** Hosted Checkout for VELA+ (subscription mode). Returns the URL to open. */
export async function createCheckout(
  sql: Sql,
  user: { id: string; email: string | null },
  origin: string,
): Promise<string> {
  const existing = await billingOf(sql, user.id);
  const priceId = env("STRIPE_PRICE_ID");
  const params: Params = {
    mode: "subscription",
    client_reference_id: user.id,
    "metadata[user_id]": user.id,
    "subscription_data[metadata][user_id]": user.id,
    "line_items[0][quantity]": 1,
    success_url: `${origin}/?plus=success`,
    cancel_url: `${origin}/?plus=cancel`,
    locale: "de",
    "custom_text[submit][message]":
      "Mit dem Abschluss verlangst du, dass VELA+ sofort startet. Du kannst innerhalb von 14 Tagen widerrufen und zahlst dann nur anteilig. Kündigen geht jederzeit zum Ende des Monats. Details: Abo-Bedingungen in der App (/agb).",
  };
  if (priceId) {
    params["line_items[0][price]"] = priceId;
  } else {
    params["line_items[0][price_data][currency]"] = PLUS_CURRENCY;
    params["line_items[0][price_data][unit_amount]"] = PLUS_PRICE_CENTS;
    params["line_items[0][price_data][recurring][interval]"] = "month";
    params["line_items[0][price_data][product_data][name]"] = "VELA+";
  }
  if (existing?.stripe_customer_id) params.customer = existing.stripe_customer_id;
  else if (user.email) params.customer_email = user.email;
  const session = await stripe<{ url?: string }>("POST", "/checkout/sessions", params);
  if (!session.url) throw new StripeError("Stripe hat keine Checkout-Seite geliefert.");
  return session.url;
}

/** Stripe billing portal ("Abo verwalten"): cancel, change card, invoices. */
export async function createPortal(customerId: string, origin: string): Promise<string> {
  const session = await stripe<{ url?: string }>("POST", "/billing_portal/sessions", {
    customer: customerId,
    return_url: `${origin}/?plus=portal`,
  });
  if (!session.url) throw new StripeError("Stripe hat keine Verwaltungsseite geliefert.");
  return session.url;
}

/** Ends a running subscription right away (used when the account is deleted). */
export async function cancelNow(subscriptionId: string): Promise<void> {
  await stripe("DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ current_period_end?: number }> };
};

function customerId(value: StripeSubscription["customer"] | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function periodEnd(sub: StripeSubscription): Date | null {
  // Newer API versions moved current_period_end onto the subscription items.
  const seconds = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

async function userForCustomer(sql: Sql, customer: string | null): Promise<string | null> {
  if (!customer) return null;
  const rows = await sql<{ user_id: string }>`
    select user_id from vela_subscriptions where stripe_customer_id = ${customer} limit 1
  `;
  return rows[0]?.user_id ?? null;
}

async function saveSubscription(sql: Sql, userId: string, sub: StripeSubscription): Promise<void> {
  const end = periodEnd(sub);
  await sql`
    insert into vela_subscriptions
      (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at)
    values
      (${userId}, ${customerId(sub.customer)}, ${sub.id}, ${sub.status}, ${end}, ${Boolean(sub.cancel_at_period_end)}, now())
    on conflict (user_id) do update set
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      updated_at = now()
  `;
  await syncPlus(sql, userId);
}

async function fetchSubscription(id: string): Promise<StripeSubscription> {
  return stripe<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);
}

/**
 * Verifies the `Stripe-Signature` header (HMAC-SHA256 over "t.payload").
 * Returns false for anything missing, malformed, stale or wrong.
 */
export function verifySignature(
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
    const [k, v] = part.split("=", 2).map((s) => s?.trim());
    if (k === "t") timestamp = v;
    else if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;
  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex"),
    "utf8",
  );
  return signatures.some((sig) => {
    const given = Buffer.from(sig, "utf8");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

/** Applies one verified webhook event. Unknown event types are ignored. */
export async function handleEvent(sql: Sql, event: StripeEvent): Promise<void> {
  const object = event.data?.object ?? {};
  switch (event.type) {
    case "checkout.session.completed": {
      if (object.mode !== "subscription") return;
      const userId =
        (object.client_reference_id as string | null) ??
        ((object.metadata as Record<string, string> | undefined)?.user_id ?? null);
      const subId = typeof object.subscription === "string" ? object.subscription : null;
      if (!userId || !subId) return;
      await saveSubscription(sql, userId, await fetchSubscription(subId));
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = object as unknown as StripeSubscription;
      const userId = sub.metadata?.user_id || (await userForCustomer(sql, customerId(sub.customer)));
      if (!userId) return;
      const current = await billingOf(sql, userId);
      // Account already deleted (row removed): don't re-create anything.
      if (!current && !isActiveStatus(sub.status)) return;
      // Ignore stale events for an older subscription of the same person.
      if (
        current?.stripe_subscription_id &&
        current.stripe_subscription_id !== sub.id &&
        isActiveStatus(current.status) &&
        !isActiveStatus(sub.status)
      ) {
        return;
      }
      await saveSubscription(sql, userId, sub);
      return;
    }
    case "invoice.payment_failed": {
      const parent = object.parent as { subscription_details?: { subscription?: string } } | undefined;
      const subId =
        (typeof object.subscription === "string" ? object.subscription : null) ??
        parent?.subscription_details?.subscription ??
        null;
      const userId = await userForCustomer(sql, customerId(object.customer as string | null));
      if (!userId || !subId) return;
      // Re-read the subscription: Stripe decides past_due / unpaid / canceled.
      await saveSubscription(sql, userId, await fetchSubscription(subId));
      return;
    }
    default:
      return;
  }
}
