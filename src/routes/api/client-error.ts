import { createFileRoute } from "@tanstack/react-router";

/**
 * Receives crash reports from the app (see src/lib/vela/error-reporter.ts).
 * Anonymous on purpose: no cookies read, no user id stored. Always 204, so a
 * broken report never causes a second error in the client. IP is only hashed
 * into the shared rateLimit table (never written into vela_client_errors).
 */
export const Route = createFileRoute("/api/client-error")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const done = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
        try {
          const text = await request.text();
          if (text.length > 8000) return done();
          const { getSql } = await import("@/lib/db");
          const { clientIp, consumeRateLimit, rateLimitKey } = await import("@/lib/vela/rate-limit.server");
          const sql = await getSql();
          // Soft cap against flood: 30 reports / 10 min per IP (hashed).
          const allowed = await consumeRateLimit(
            sql,
            rateLimitKey("vela:client-error", clientIp(request.headers)),
            { windowSec: 10 * 60, max: 30 },
          );
          if (!allowed) return done();
          const body = JSON.parse(text) as Record<string, unknown>;
          const { recordClientError } = await import("@/lib/vela/client-errors.server");
          await recordClientError(sql, body);
        } catch (err) {
          console.error("[client-error]", err instanceof Error ? err.message : err);
        }
        return done();
      },
    },
  },
});
