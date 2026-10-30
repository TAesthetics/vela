import { createFileRoute } from "@tanstack/react-router";

/**
 * Receives crash reports from the app (see src/lib/vela/error-reporter.ts).
 * Anonymous on purpose: no cookies read, no user id or IP stored. Always 204,
 * so a broken report never causes a second error in the client.
 */
export const Route = createFileRoute("/api/client-error")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const done = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
        try {
          const text = await request.text();
          if (text.length > 8000) return done();
          const body = JSON.parse(text) as Record<string, unknown>;
          const { getSql } = await import("@/lib/db");
          const { recordClientError } = await import("@/lib/vela/client-errors.server");
          await recordClientError(await getSql(), body);
        } catch (err) {
          console.error("[client-error]", err instanceof Error ? err.message : err);
        }
        return done();
      },
    },
  },
});
