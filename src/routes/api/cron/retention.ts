import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily DSGVO retention purge (ID images, crash reports, old reports, …).
 * Also still runs on app/admin load as a fallback. Vercel Cron hits GET.
 *
 * Auth: when CRON_SECRET is set, require Authorization: Bearer <secret>
 * (Vercel sends this automatically). When unset (Hobby default), accept
 * the x-vercel-cron: 1 header so the schedule works out of the box.
 */
function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    return auth === `Bearer ${secret}`;
  }
  return request.headers.get("x-vercel-cron") === "1";
}

export const Route = createFileRoute("/api/cron/retention")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!cronAuthorized(request)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        try {
          const { getSql } = await import("@/lib/db");
          const { purgeExpired } = await import("@/lib/vela/age-review.server");
          await purgeExpired(await getSql());
          return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
        } catch (err) {
          console.error("[cron/retention]", err instanceof Error ? err.message : err);
          return Response.json({ ok: false }, { status: 500, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
