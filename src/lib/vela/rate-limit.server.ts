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
 * DB-backed sliding window on the Better Auth `rateLimit` table
 * (migrations/0011). Same store as sign-in/sign-up, so counters survive
 * serverless cold starts. Returns true when the caller may proceed.
 */
export async function consumeRateLimit(sql: Sql, key: string, rule: RateRule): Promise<boolean> {
  const now = Date.now();
  const windowMs = rule.windowSec * 1000;
  const existing = await sql<{ id: string; count: number | string; lastRequest: number | string }>`
    select id, count, "lastRequest" from "rateLimit" where key = ${key} limit 1
  `;
  const row = existing[0];
  if (!row) {
    try {
      await sql`
        insert into "rateLimit" (id, key, count, "lastRequest")
        values (${randomUUID()}, ${key}, 1, ${now})
      `;
      return true;
    } catch {
      // Concurrent first hit — fall through and treat as an existing row.
      return consumeRateLimit(sql, key, rule);
    }
  }
  const last = Number(row.lastRequest);
  const count = Number(row.count);
  if (!Number.isFinite(last) || now - last > windowMs) {
    await sql`
      update "rateLimit" set count = 1, "lastRequest" = ${now} where key = ${key}
    `;
    return true;
  }
  if (count >= rule.max) return false;
  await sql`
    update "rateLimit" set count = count + 1, "lastRequest" = ${now} where key = ${key}
  `;
  return true;
}
