import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";

/**
 * Client IP for abuse limits. Mirrors Better Auth's headers in
 * src/lib/auth/server.ts so Vercel and self-hosting agree.
 */
export function clientIp(headers: Headers | null | undefined): string {
  if (!headers) return "unknown";
  const names = process.env.VERCEL
    ? ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"]
    : ["x-forwarded-for", "x-real-ip"];
  for (const name of names) {
    const raw = headers.get(name);
    if (!raw) continue;
    const first = raw.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/** Stable opaque key so the rateLimit table never stores a raw IP. */
export function rateLimitKey(scope: string, ip: string): string {
  return `${scope}:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
}

export type RateRule = { windowSec: number; max: number };

/**
 * DB-backed window on the Better Auth `rateLimit` table (migrations/0011).
 * Same store as sign-in/sign-up, so counters survive serverless cold starts.
 * Returns true when the caller may proceed.
 *
 * One atomic upsert (insert … on conflict … where … returning), so parallel
 * requests cannot all read the same count and slip past the limit — the race
 * behind GHSA-44jh-23m7-hpcf in Better Auth's own database limiter. When the
 * limit is hit, the conditional update matches nothing and no row comes back.
 */
export async function consumeRateLimit(sql: Sql, key: string, rule: RateRule): Promise<boolean> {
  const now = Date.now();
  const windowMs = rule.windowSec * 1000;
  const rows = await sql<{ count: number | string }>`
    insert into "rateLimit" (id, key, count, "lastRequest")
    values (${randomUUID()}, ${key}, 1, ${now})
    on conflict (key) do update set
      count = case
        when ${now} - "rateLimit"."lastRequest" > ${windowMs} then 1
        else "rateLimit".count + 1
      end,
      "lastRequest" = ${now}
    where ${now} - "rateLimit"."lastRequest" > ${windowMs}
       or "rateLimit".count < ${rule.max}
    returning count
  `;
  return rows.length > 0;
}
