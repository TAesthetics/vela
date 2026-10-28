import { createFileRoute } from "@tanstack/react-router";

/**
 * Stripe webhook for VELA+. Reads the raw body (the signature covers the exact
 * bytes), verifies it with STRIPE_WEBHOOK_SECRET and updates the subscription.
 * Unsigned or wrongly signed requests get 400.
 */
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { env } = await import("@/lib/env.server");
        const { verifySignature, handleEvent } = await import("@/lib/vela/stripe.server");
        const secret = env("STRIPE_WEBHOOK_SECRET");
        const payload = await request.text();
        if (!secret) {
          return new Response("Stripe webhook is not configured", { status: 400 });
        }
        if (!verifySignature(payload, request.headers.get("stripe-signature"), secret)) {
          return new Response("Invalid signature", { status: 400 });
        }
        let event: Parameters<typeof handleEvent>[1];
        try {
          event = JSON.parse(payload);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }
        try {
          const { getSql } = await import("@/lib/db");
          await handleEvent(await getSql(), event);
        } catch (err) {
          console.error("[stripe webhook]", event?.type, err instanceof Error ? err.message : err);
          // 500 makes Stripe retry later.
          return new Response("Webhook handler failed", { status: 500 });
        }
        return Response.json({ received: true });
      },
    },
  },
});
