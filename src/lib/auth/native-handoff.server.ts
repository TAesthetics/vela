/**
 * Native-app login hand-off — server-only (NEVER import from the client).
 *
 * Google and X block OAuth in embedded webviews, so the store app signs in in
 * the system browser and brings the session back into its webview:
 *
 *   1. App: random `verifier`, `challenge = sha256(verifier)`; opens
 *      GET /auth/native?providerId=…&challenge=… in the system browser.
 *   2. Here: start OAuth (302 to the broker) with the callback back to us.
 *   3. GET /auth/native?done=1&challenge=…: read the fresh session cookie from
 *      the system browser, store it (5 min, single use) under the challenge
 *      together with the hash of a random `grant`, and redirect to
 *      vela://auth?grant=… (the OS hands that only to the app).
 *   4. App: POST /auth/native { verifier, grant } from its webview. Both must
 *      match; then this response sets the session cookie in the webview.
 *
 * Someone who only sees the deep link lacks the verifier; someone who started
 * the flow on their own device (and got a victim to log in) lacks the grant.
 * Stored in Better Auth's `verification` table so it works across serverless
 * instances. Nothing here is used by the normal website.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";
import { isSelfHosted, selfHostedPublicUrl } from "@/lib/env.server";
import { GROK_PROVIDERS } from "./providers";
import { auth, SESSION_TOKEN_COOKIE } from "./server";

const DEEP_LINK = "vela://auth";
const TTL_MINUTES = 5;
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // Better Auth default session length
const B64URL_43 = /^[A-Za-z0-9_-]{43}$/;

const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");

function appOrigin(request: Request): string {
  // Behind a proxy (Railway) request.url may carry the internal host, so prefer
  // the configured public origin.
  const configured = isSelfHosted()
    ? selfHostedPublicUrl()
    : process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "");
  return configured || new URL(request.url).origin;
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0 || trimmed.slice(0, eq) !== name) continue;
    const raw = trimmed.slice(eq + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

function html(body: string, status = 200, deepLink?: string): Response {
  const refresh = deepLink ? `<meta http-equiv="refresh" content="0;url=${deepLink}" />` : "";
  return new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />${refresh}<title>VELA</title>
<style>html,body{margin:0;min-height:100%;background:#12100e;color:#b3a69a;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:2rem;text-align:center}
a{display:inline-block;margin-top:1.5rem;padding:.9rem 1.8rem;border-radius:999px;background:#e4572e;color:#12100e;text-decoration:none;font-weight:600}</style>
</head><body><main><div>${body}</div></main></body></html>`,
    {
      status,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    },
  );
}

function backToApp(params: Record<string, string>, message: string): Response {
  const link = `${DEEP_LINK}?${new URLSearchParams(params).toString()}`;
  return html(
    `<p style="color:#f3eee6">${message}</p><a href="${link}">Zurück zu VELA</a>`,
    200,
    link,
  );
}

async function storeHandoff(
  challenge: string,
  value: { grantHash: string; token: string | null; error?: string },
) {
  const sql = await getSql();
  const identifier = `vela-native:${challenge}`;
  await sql`delete from "verification" where identifier = ${identifier}`;
  await sql`
    insert into "verification" (id, identifier, value, "expiresAt")
    values (${randomUUID()}, ${identifier}, ${JSON.stringify(value)},
            now() + make_interval(mins => ${TTL_MINUTES}))
  `;
}

/** GET: start OAuth in the system browser, or finish it and bounce to the app. */
export async function handleNativeAuthGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const challenge = url.searchParams.get("challenge") ?? "";
  if (!B64URL_43.test(challenge)) return html("<p>Ungültige Anmeldung.</p>", 400);

  if (url.searchParams.get("done") === "1") {
    const failed = url.searchParams.has("error");
    const token = failed ? null : readCookie(request, SESSION_TOKEN_COOKIE);
    const error = failed
      ? (url.searchParams.get("error") ?? "sign_in_failed")
      : token
        ? undefined
        : "no_session";
    if (error) return backToApp({ error }, "Die Anmeldung hat nicht geklappt.");
    const grant = randomBytes(32).toString("base64url");
    await storeHandoff(challenge, { grantHash: sha256(grant), token });
    return backToApp({ grant }, "Angemeldet. Weiter in der VELA-App.");
  }

  const providerId = url.searchParams.get("providerId") ?? "";
  if (!GROK_PROVIDERS.some((p) => p.providerId === providerId)) {
    return html("<p>Unbekannter Anmeldedienst.</p>", 400);
  }
  const back = `${appOrigin(request)}/auth/native?done=1&challenge=${challenge}`;
  try {
    const res = await auth.api.signInWithOAuth2({
      body: { providerId, callbackURL: back, errorCallbackURL: `${back}&error=1` },
      headers: request.headers,
      asResponse: true,
    });
    const body = (await res.json().catch(() => null)) as { url?: string } | null;
    if (!res.ok || !body?.url)
      return backToApp(
        { error: `oauth_init_${res.status}` },
        "Die Anmeldung konnte nicht starten.",
      );
    const headers = new Headers({ location: body.url, "cache-control": "no-store" });
    for (const cookie of res.headers.getSetCookie()) headers.append("set-cookie", cookie);
    return new Response(null, { status: 302, headers });
  } catch {
    return backToApp({ error: "oauth_init_failed" }, "Die Anmeldung konnte nicht starten.");
  }
}

/** POST { verifier, grant } from the app's webview: sets the session cookie. */
export async function handleNativeAuthClaim(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200, cookie?: string) => {
    const headers = new Headers({
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    if (cookie) headers.append("set-cookie", cookie);
    return new Response(JSON.stringify(body), { status, headers });
  };
  const input = (await request.json().catch(() => null)) as {
    verifier?: unknown;
    grant?: unknown;
  } | null;
  const verifier = typeof input?.verifier === "string" ? input.verifier : "";
  const grant = typeof input?.grant === "string" ? input.grant : "";
  if (!B64URL_43.test(verifier) || !B64URL_43.test(grant)) return json({ error: "invalid" }, 400);

  const sql = await getSql();
  const rows = await sql<{ value: string }>`
    delete from "verification"
    where identifier = ${`vela-native:${sha256(verifier)}`} and "expiresAt" > now()
    returning value
  `;
  const stored = rows[0]
    ? (JSON.parse(rows[0].value) as { grantHash: string; token: string | null })
    : null;
  const expected = Buffer.from(stored?.grantHash ?? "");
  const actual = Buffer.from(sha256(grant));
  if (!stored?.token || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return json({ error: "expired" }, 400);
  }
  const cookie =
    `${SESSION_TOKEN_COOKIE}=${encodeURIComponent(stored.token)}; Path=/; HttpOnly; Secure; SameSite=Lax; ` +
    `Max-Age=${SESSION_MAX_AGE}`;
  return json({ status: "done" }, 200, cookie);
}
