import { createFileRoute } from "@tanstack/react-router";

/** Healthcheck for self-hosting (Railway): 200 when the database answers. */
export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { getSql } = await import("@/lib/db");
          const sql = await getSql();
          await sql`select 1`;
          return new Response("ok", { headers: { "cache-control": "no-store" } });
        } catch (err) {
          console.error(
            "[healthz] database not reachable:",
            err instanceof Error ? err.message : err,
          );
          return new Response("database not reachable", {
            status: 503,
            headers: { "cache-control": "no-store" },
          });
        }
      },
    },
  },
});
