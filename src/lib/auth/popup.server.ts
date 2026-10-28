/**
 * Live-preview sign-in popup — server-only (NEVER import from the client).
 *
 * The sandbox preview runs the app in a partitioned iframe, so OAuth must happen
 * in a top-level popup (first-party cookies). This handler is the ENTIRE popup
 * document — no React shell:
 *
 *   Phase 1 (`?providerId=…`): start OAuth server-side and 302 straight to the
 *     broker / upstream login page. The popup never paints the app.
 *   Phase 2 (`?done=1`): after the broker round-trip, emit a tiny HTML page that
 *     posts the session token to the opener and closes. No SPA hydrate, no
 *     server-fn round-trip.
 *
 * Wired automatically by the Vite `authPopupPlugin` in `vite.config.ts` during
 * `npm run dev` (live preview). Do NOT create `src/routes/auth/popup.tsx` — a
 * React route here paints the full app shell in the popup. The opener lives in
 * `client.ts` (`signIn` → `openSignInPopup`).
 */
import { createHash } from "node:crypto";
import { auth, SESSION_TOKEN_COOKIE } from "./server";

/**
 * Server-side one-time hand-off. The opener creates a random code and passes it
 * to the popup; the completion page stores the session token under the code's
 * hash, and the opener claims it once via `GET /auth/popup?claim=<code>`.
 *
 * Needed because Google/X send Cross-Origin-Opener-Policy: after the round-trip
 * the popup has no `window.opener` (postMessage can't arrive) and the opener
 * already sees `popup.closed === true` — especially on phones, where the popup
 * is a separate tab. Lives on globalThis so a Vite module reload keeps it.
 */
type Handoff = { token: string | null; error?: string; expires: number };
const HANDOFF_TTL_MS = 3 * 60_000;
const handoffRef = globalThis as typeof globalThis & { __velaAuthHandoff__?: Map<string, Handoff> };
const handoffs = (handoffRef.__velaAuthHandoff__ ??= new Map<string, Handoff>());

function handoffCode(value: string | null): string | null {
  return value && /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : null;
}

function handoffKey(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function pruneHandoffs(now = Date.now()) {
  for (const [key, entry] of handoffs) if (entry.expires <= now) handoffs.delete(key);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Message shape the popup posts to the opener (must match `client.ts`). */
type PopupMessage = {
  source: "grok-auth-popup";
  token: string | null;
  error?: string;
};

/**
 * Handle `GET /auth/popup`. Invoked by the Vite `authPopupPlugin` (dev / live
 * preview). Do not re-export this from a React route file.
 */
export async function handleAuthPopupRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const done = url.searchParams.get("done") === "1";

  if (url.searchParams.has("claim")) {
    const code = handoffCode(url.searchParams.get("claim"));
    if (!code) return json({ status: "invalid" }, 400);
    pruneHandoffs();
    const key = handoffKey(code);
    const entry = handoffs.get(key);
    if (!entry) return json({ status: "pending" });
    handoffs.delete(key);
    return json({ status: "done", token: entry.token, error: entry.error ?? null });
  }

  if (done) {
    const errored = url.searchParams.has("error");
    const token = errored ? null : readCookie(request, SESSION_TOKEN_COOKIE);
    const message: PopupMessage = {
      source: "grok-auth-popup",
      token,
      ...(errored ? { error: url.searchParams.get("error") ?? "sign_in_failed" } : {}),
      ...(!errored && !token ? { error: "no_session" } : {}),
    };
    const code = handoffCode(url.searchParams.get("code"));
    if (code) {
      pruneHandoffs();
      handoffs.set(handoffKey(code), {
        token: message.token,
        error: message.error,
        expires: Date.now() + HANDOFF_TTL_MS,
      });
    }
    return new Response(completionHtml(message), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Never cache a page that embeds a session token.
        "cache-control": "no-store",
      },
    });
  }

  const providerId = url.searchParams.get("providerId")?.trim();
  if (!providerId) {
    return new Response("Missing providerId", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Stay first-party for the callback so the session cookie lands in THIS popup.
  const code = handoffCode(url.searchParams.get("code"));
  const back = `${url.origin}/auth/popup?done=1${code ? `&code=${code}` : ""}`;
  try {
    const apiRes = await auth.api.signInWithOAuth2({
      body: {
        providerId,
        callbackURL: back,
        errorCallbackURL: `${back}&error=1`,
      },
      // Forward the preview host so Better Auth derives the correct baseURL /
      // redirect_uri for the dynamic `*.grok-sandbox.com` origin.
      headers: request.headers,
      asResponse: true,
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => "");
      return completionResponse({
        source: "grok-auth-popup",
        token: null,
        error: detail || `oauth_init_failed_${apiRes.status}`,
      }, code);
    }

    const body = (await apiRes.json().catch(() => null)) as {
      url?: string;
    } | null;
    const location = body?.url;
    if (!location) {
      return completionResponse({
        source: "grok-auth-popup",
        token: null,
        error: "oauth_init_missing_url",
      }, code);
    }

    // 302 to the broker (which headlessly forwards to Google/X). Forward any
    // Set-Cookie (OAuth state / PKCE) so the callback can complete in this popup.
    const headers = new Headers({ location, "cache-control": "no-store" });
    for (const cookie of apiRes.headers.getSetCookie()) {
      headers.append("set-cookie", cookie);
    }
    return new Response(null, { status: 302, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_init_threw";
    return completionResponse({
      source: "grok-auth-popup",
      token: null,
      error: message,
    }, code);
  }
}

function completionResponse(message: PopupMessage, code?: string | null): Response {
  if (code) {
    pruneHandoffs();
    handoffs.set(handoffKey(code), { token: null, error: message.error, expires: Date.now() + HANDOFF_TTL_MS });
  }
  return new Response(completionHtml(message), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Minimal HTML: postMessage the token to the opener and close. No React. */
function completionHtml(message: PopupMessage): string {
  // JSON is safe inside a <script type="application/json"> block; the inline
  // script only reads it. Avoids escaping pitfalls of embedding in JS source.
  const payload = JSON.stringify(message).replace(/</g, "\\u003c");
  const status = message.token
    ? "Anmeldung wird abgeschlossen…"
    : "Anmeldung fehlgeschlagen.";
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="2;url=/" />
<title>Anmeldung</title>
<style>
  html,body{margin:0;min-height:100%;background:#0b0b0c;color:#a1a1aa;
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  main{min-height:100vh;display:grid;place-items:center;padding:1.5rem;text-align:center}
  a{color:#f2e7d5}
</style>
</head>
<body>
<main>
  <div>
    <p>${status}</p>
    <p><a href="/">Weiter zu Vela</a></p>
  </div>
</main>
<script type="application/json" id="grok-auth-popup-msg">${payload}</script>
<script>
(function () {
  var el = document.getElementById("grok-auth-popup-msg");
  var msg = { source: "grok-auth-popup", token: null };
  try { if (el && el.textContent) msg = JSON.parse(el.textContent); } catch (e) {}
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(msg, window.location.origin);
    }
  } catch (e) {}
  try { window.close(); } catch (e) {}
  // Phones keep this tab after Google/X. close() is ignored, so continue here.
  setTimeout(function () { window.location.replace("/"); }, 300);
})();
</script>
</body>
</html>`;
}

/** Read a single cookie value from the request (handles `=` inside values). */
function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    const raw = trimmed.slice(eq + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
