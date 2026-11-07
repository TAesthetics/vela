import type { Sql } from "@/lib/db";
import { clientIp, consumeRateLimit, rateLimitKey, type RateRule } from "./rate-limit.server.ts";

/**
 * Atomic per-IP limits for the Better Auth endpoints, checked in
 * /api/auth/$ before Better Auth runs. Better Auth keeps its own database
 * limiter (same numbers, src/lib/auth/server.ts), but in 1.6 that one reads
 * and then writes the counter, so a burst of parallel requests can exceed it
 * (GHSA-44jh-23m7-hpcf). This layer uses a single upsert and closes that gap.
 */
const AUTH_RULES: Array<{ match: (path: string) => boolean; scope: string; rule: RateRule }> = [
  { match: (p) => p.startsWith("/sign-in/"), scope: "vela:auth-sign-in", rule: { windowSec: 15 * 60, max: 30 } },
  { match: (p) => p.startsWith("/sign-up/"), scope: "vela:auth-sign-up", rule: { windowSec: 60 * 60, max: 10 } },
  { match: (p) => p === "/change-password", scope: "vela:auth-change-password", rule: { windowSec: 15 * 60, max: 10 } },
  { match: (p) => p === "/change-email", scope: "vela:auth-change-email", rule: { windowSec: 60 * 60, max: 10 } },
];

/** Rule for a request URL under /api/auth, or null when it is not limited here. */
export function authRuleFor(url: string): { scope: string; rule: RateRule } | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const i = pathname.indexOf("/api/auth");
  if (i < 0) return null;
  const path = pathname.slice(i + "/api/auth".length).replace(/\/+$/, "") || "/";
  const hit = AUTH_RULES.find((r) => r.match(path));
  return hit ? { scope: hit.scope, rule: hit.rule } : null;
}

/** 429 response when the request is over its limit, otherwise null. Fails open on DB errors (Better Auth still limits). */
export async function authRateLimited(request: Request, getSql: () => Promise<Sql>): Promise<Response | null> {
  const hit = authRuleFor(request.url);
  if (!hit) return null;
  try {
    const sql = await getSql();
    const ok = await consumeRateLimit(sql, rateLimitKey(hit.scope, clientIp(request.headers)), hit.rule);
    if (ok) return null;
  } catch {
    return null;
  }
  return new Response(
    JSON.stringify({ code: "TOO_MANY_REQUESTS", message: "Zu viele Versuche. Warte kurz und versuch es dann noch einmal." }),
    { status: 429, headers: { "content-type": "application/json", "retry-after": String(hit.rule.windowSec) } },
  );
}
