import { createFileRoute } from "@tanstack/react-router";

/**
 * RevenueCat webhook for VELA+ bought in the iOS / Android app. Requires the
 * Authorization header set in the RevenueCat dashboard (REVENUECAT_WEBHOOK_AUTH)
 * and, if REVENUECAT_WEBHOOK_SECRET is set, a valid HMAC signature. The event
 * only says who changed; the current state is re-read from RevenueCat.
 * Without configuration it answers 400, so nothing can grant Plus.
 */
export const Route = createFileRoute("/api/revenuecat/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { env } = await import("@/lib/env.server");
        const { webhookAuthorized, webhookSignatureValid } = await import("@/lib/vela/store-entitlement");
        const expected = env("REVENUECAT_WEBHOOK_AUTH");
        if (!expected || !env("REVENUECAT_SECRET_KEY")) {
          return new Response("RevenueCat webhook is not configured", { status: 400 });
        }
        if (!webhookAuthorized(request.headers.get("authorization"), expected)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const payload = await request.text();
        if (payload.length > 100_000) return new Response("Payload too large", { status: 413 });
        const secret = env("REVENUECAT_WEBHOOK_SECRET");
        if (secret && !webhookSignatureValid(payload, request.headers.get("x-revenuecat-webhook-signature"), secret)) {
          return new Response("Invalid signature", { status: 400 });
        }
        let event: { type?: unknown } | undefined;
        try {
          event = (JSON.parse(payload) as { event?: { type?: unknown } }).event;
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }
        if (!event || typeof event !== "object") return new Response("Invalid payload", { status: 400 });
        try {
          const { getSql } = await import("@/lib/db");
          const { handleRevenueCatEvent } = await import("@/lib/vela/store-purchases.server");
          const updated = await handleRevenueCatEvent(await getSql(), event);
          return Response.json({ received: true, updated });
        } catch (err) {
          console.error("[revenuecat webhook]", event.type, err instanceof Error ? err.message : err);
          const { recordServerError } = await import("@/lib/vela/server-errors.server");
          await recordServerError(`webhook:revenuecat:${String(event.type ?? "unknown")}`, err);
          // 500 makes RevenueCat retry later (up to 5 times).
          return new Response("Webhook handler failed", { status: 500 });
        }
      },
    },
  },
});
