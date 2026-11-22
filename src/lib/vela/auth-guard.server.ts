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

/**
 * Per-account brake on wrong passwords. The per-IP limit above does nothing
 * against password guessing spread over many IPs (botnets, mobile networks),
 * so every e-mail sign-in also counts against the address itself: after
 * SIGN_IN_ACCOUNT_RULE.max wrong passwords that account answers 429 for
 * 15 minutes after the last counted attempt, whichever IP asks. The attempt is
 * counted atomically before Better Auth runs (parallel bursts cannot slip
 * past) and refunded when it was not a wrong password (success, bad input),
 * so normal sign-ins never add up. The key is a hash, no address is stored.
 */
export const SIGN_IN_ACCOUNT_RULE: RateRule = { windowSec: 15 * 60, max: 10 };
export const ACCOUNT_LOCKED_MESSAGE =
  "Zu viele falsche Passwörter für dieses Konto. Warte 15 Minuten oder nutz „Passwort vergessen?“.";

/** Normalized like Better Auth does before looking the account up. */
export function signInAccountKey(email: string): string {
  return rateLimitKey("vela:auth-sign-in-account", email.trim().toLowerCase());
}

/** E-mail of an /api/auth/sign-in/email request, or null for any other request. */
export async function signInEmailOf(request: Request): Promise<string | null> {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return null;
  }
  if (!/\/api\/auth\/sign-in\/email\/?$/.test(pathname)) return null;
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    return email && email.length <= 320 ? email : null;
  } catch {
    return null;
  }
}

/** Only a wrong e-mail/password (401) counts as a failed guess. */
export function countsAsFailedSignIn(status: number): boolean {
  return status === 401;
}

/**
 * Runs an e-mail sign-in under the per-account brake. Fails open on DB errors
 * (the per-IP limits still apply).
 */
export async function withSignInAccountLimit(
  email: string,
  getSql: () => Promise<Sql>,
  run: () => Promise<Response>,
): Promise<Response> {
  const key = signInAccountKey(email);
  let sql: Sql | null = null;
  try {
    sql = await getSql();
    if (!(await consumeRateLimit(sql, key, SIGN_IN_ACCOUNT_RULE))) {
      return new Response(JSON.stringify({ code: "ACCOUNT_LOCKED", message: ACCOUNT_LOCKED_MESSAGE }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": String(SIGN_IN_ACCOUNT_RULE.windowSec) },
      });
    }
  } catch {
    sql = null;
  }
  const response = await run();
  if (sql && !countsAsFailedSignIn(response.status)) {
    try {
      await sql`update "rateLimit" set count = greatest(count - 1, 0) where key = ${key}`;
    } catch {
      // Counter stays one higher until the window ends; harmless.
    }
  }
  return response;
}

/** Lifts the brake, e.g. after the password was reset with a valid link. */
export async function clearSignInAccountLimit(sql: Sql, email: string): Promise<void> {
  await sql`update "rateLimit" set count = 0 where key = ${signInAccountKey(email)}`;
}
