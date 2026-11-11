import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily DSGVO retention purge (ID images, crash reports, old reports, …).
 * Also still runs on app/admin load as a fallback. Vercel Cron hits GET.
 *
 * Auth: when CRON_SECRET is set, require Authorization: Bearer <secret>
 * (Vercel sends this automatically). When unset (Hobby default), accept
 * the x-vercel-cron: 1 header so the schedule works out of the box.
 *
 * The x-vercel-cron header can be sent by anyone, so without a secret the
 * purge is throttled (at most once per 10 minutes) instead of running on
 * every request.
 */
function cronAuth(request: Request): "secret" | "header" | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    return auth === `Bearer ${secret}` ? "secret" : null;
  }
  return request.headers.get("x-vercel-cron") === "1" ? "header" : null;
}

export const Route = createFileRoute("/api/cron/retention")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = cronAuth(request);
        if (!auth) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        try {
          const { getSql } = await import("@/lib/db");
          const { purgeExpired, purgeExpiredThrottled } = await import("@/lib/vela/age-review.server");
          const sql = await getSql();
          let ran = true;
          if (auth === "secret") await purgeExpired(sql);
          else ran = await purgeExpiredThrottled(sql);
          return Response.json({ ok: true, ran }, { headers: { "cache-control": "no-store" } });
        } catch (err) {
          console.error("[cron/retention]", err instanceof Error ? err.message : err);
          return Response.json({ ok: false }, { status: 500, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
