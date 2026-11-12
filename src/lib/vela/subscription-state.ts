/** Pure VELA+ subscription rules (no server imports, unit-tested). */

/** Subscription states that grant Plus (past_due: Stripe is still retrying). */
const ACTIVE = new Set(["active", "trialing", "past_due"]);

export function isActiveStatus(status: string | null | undefined): boolean {
  return Boolean(status && ACTIVE.has(status));
}

/**
 * Whether a freshly fetched subscription should overwrite the stored row.
 * Pure, so it is unit-tested.
 */
export function subscriptionUpdate(
  current: { stripe_subscription_id: string | null; status: string } | undefined,
  sub: { id: string; status: string },
  fromCheckout: boolean,
): "save" | "skip" {
  // Account already deleted (row removed) and nothing to grant: don't re-create it.
  if (!current && !fromCheckout && !isActiveStatus(sub.status)) return "skip";
  // An older, ended subscription must not overwrite a newer active one.
  if (
    current?.stripe_subscription_id &&
    current.stripe_subscription_id !== sub.id &&
    isActiveStatus(current.status) &&
    !isActiveStatus(sub.status)
  ) {
    return "skip";
  }
  return "save";
}
