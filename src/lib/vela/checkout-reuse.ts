/** A just-paid page counts as "activating" this long, until the webhook lands. */
export const COMPLETE_GRACE_SECONDS = 15 * 60;

export type CheckoutState = {
  status?: string | null;
  url?: string | null;
  created?: number;
  expires_at?: number;
};

/**
 * Reuse the last Stripe Checkout page while it is open (with a minute to
 * spare), report "activating" shortly after it was paid, otherwise null
 * (start a new page). Times are Unix seconds.
 */
export function checkoutDecision(
  session: CheckoutState,
  now: number,
): { url: string } | { completing: true } | null {
  if (session.status === "open" && session.url && (session.expires_at ?? 0) > now + 60) return { url: session.url };
  if (session.status === "complete" && (session.created ?? 0) > now - COMPLETE_GRACE_SECONDS) {
    return { completing: true };
  }
  return null;
}
