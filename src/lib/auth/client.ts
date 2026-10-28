import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { runPreSignInSignOut, runSignOut } from "../../../scripts/sign-out-plan.mjs";
import { GROK_PROVIDERS } from "./providers";

/**
 * Better Auth client for this React SPA (browser-side).
 *
 * Talks to this app's OWN Better Auth at same-origin `/api/auth/*`. In the live
 * preview the app is an embedded iframe with PARTITIONED cookies, so after a
 * popup sign-in it can't read the session cookie — it authenticates with a
 * bearer token instead (captured from the popup, see `signIn`). The `onRequest`
 * hook attaches that token when present; when deployed (cookie auth) no token
 * is stored, so nothing changes.
 *
 * To sign out call `signOut()` below, NOT `authClient.signOut()`: the raw call
 * leaves the bearer token in place, and `onRequest` keeps re-attaching it, so
 * the visitor stays signed in.
 */
export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
  fetchOptions: {
    onRequest(ctx) {
      const token = getBearerToken();
      if (token) ctx.headers.set("Authorization", `Bearer ${token}`);
      return ctx;
    },
  },
});

/**
 * True when sign-in UI should be shown — i.e. whenever `VITE_AUTH_ENABLED` is
 * not `"false"`. The shipped template sets it to `"false"`
 * (`.grok/app-env.json`), which selects the dev user (see `use-current-user`);
 * with the key removed, sign-in is real in preview (baked preview client) and
 * when deployed (injected per-app client).
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

/** The upstream providers to render sign-in buttons for. */
export { GROK_PROVIDERS };

// ── Live-preview bearer token ────────────────────────────────────────────────
// The embedded preview iframe has partitioned cookies, so we keep the session's
// bearer token in sessionStorage and attach it to every Better Auth request (and
// to server functions, via `@/lib/auth/middleware`). Empty everywhere except the
// preview after a popup sign-in, so the cookie path is untouched elsewhere.
const BEARER_KEY = "grok-auth.bearer-token";

/** The stored preview bearer token, or null. */
export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

function setBearerToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(BEARER_KEY, token);
    else window.sessionStorage.removeItem(BEARER_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * The sandbox live preview runs this app inside an iframe on a `*.grok-sandbox.com`
 * host, where a full-page redirect to the broker can't work — so sign-in uses a
 * popup there and a normal redirect everywhere else.
 */
function inLivePreview(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.location.hostname.endsWith(".grok-sandbox.com")) return false;
  // Partitioned cookies (and therefore the popup + bearer path) only apply
  // inside the embedded preview iframe. A phone that opens the sandbox URL as
  // a normal tab must use a full-page redirect: a popup there survives OAuth
  // as a tab that cannot close, and the visitor stays on "Signing you in…".
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Message the popup posts back to the opener once sign-in completes. */
type PopupMessage = { source: "grok-auth-popup"; token: string | null; error?: string };

/**
 * Start sign-in with one upstream provider (`providerId` from `GROK_PROVIDERS`),
 * federating through the Grok auth broker.
 *
 * - **Live preview** (`*.grok-sandbox.com` iframe): opens a POPUP to
 *   `/auth/popup`, served by the template Vite plugin (see `vite.config.ts` +
 *   `popup.server.ts`) — 302s to the broker/upstream login (no app chrome) and,
 *   on return, posts the session bearer token back. We store it and refresh the
 *   session; no top-level navigation of the iframe to the broker.
 * - **Deployed** (and local non-iframe): a normal full-page redirect into the broker.
 *
 * Either way it clears any existing local session FIRST so switching providers
 * actually switches identity.
 */
export async function signIn(
  providerId: string,
  opts: { callbackURL?: string; errorCallbackURL?: string } = {},
): Promise<void> {
  const callbackURL = opts.callbackURL ?? "/";
  const errorCallbackURL = opts.errorCallbackURL ?? "/";

  // Open the popup SYNCHRONOUSLY on the user gesture — before any await
  // (including signOut). Awaiting first drops user-gesture privilege in some
  // browsers when the opener is a cross-origin live-preview iframe.
  const handoff = inLivePreview() ? newHandoffCode() : null;
  const popup = handoff ? openSignInPopup(providerId, handoff) : null;
  if (handoff) savePending({ code: handoff, callbackURL, startedAt: Date.now() });

  // Clear any prior session so switching providers actually switches identity.
  // Bounded because the popup is already open — a request that never settles
  // would leave it hanging — but bounded PER ENVIRONMENT: only the server can
  // end a deployed session, so cutting it short at the preview's 1.5s would
  // start OAuth with the old session still live.
  await runPreSignInSignOut({
    livePreview: inLivePreview(),
    hasBearer: Boolean(getBearerToken()),
    requestSignOut: () => authClient.signOut(),
    clearToken: () => setBearerToken(null),
  });

  if (handoff) {
    if (!popup) {
      clearPending();
      throw new Error("Das Anmeldefenster wurde blockiert. Bitte erlaube Pop-ups für diese Seite.");
    }
    await completePreviewSignIn(handoff, Date.now(), callbackURL);
    return;
  }

  const { data, error } = await authClient.signIn.oauth2({
    providerId,
    callbackURL,
    errorCallbackURL,
  });
  if (error) throw new Error(error.message ?? "Sign-in failed");
  if (data?.url) window.location.href = data.url;
}

/**
 * Open `/auth/popup` in a new window. Must run synchronously inside the click
 * handler (no await before this). The path is served by the template Vite
 * plugin (`authPopupPlugin` in vite.config.ts) — NOT by a React route.
 *
 * Opens the real URL directly (not about:blank → assign). From a cross-origin
 * iframe the about:blank dance often fails on the first click and the window
 * ends up showing the app shell.
 */
function openSignInPopup(providerId: string, code: string): Window | null {
  const origin = window.location.origin;
  const url = `${origin}/auth/popup?providerId=${encodeURIComponent(providerId)}&code=${code}`;
  // Unique name per attempt so a prior attempt stuck on the SPA is not reused.
  const name = `grok-signin-${Date.now()}`;
  return window.open(url, name, "popup,width=500,height=650");
}

// ── Live-preview hand-off ────────────────────────────────────────────────────
// `popup.closed` is not trustworthy: Google/X set Cross-Origin-Opener-Policy, so
// after the round-trip the opener sees the popup as closed and the popup has no
// opener to postMessage to (on phones the popup is a separate tab). Instead the
// popup's completion page stores the token server-side under a one-time code,
// and we poll `/auth/popup?claim=<code>` for up to 3 minutes. A postMessage, if
// it does arrive, simply wins the race.
const PENDING_KEY = "grok-auth.pending-sign-in";
const HANDOFF_WINDOW_MS = 3 * 60_000;
const CLAIM_INTERVAL_MS = 1500;

type PendingSignIn = { code: string; callbackURL: string; startedAt: number };
type HandoffResult = { token: string | null; error?: string };

let cancelWaiting: (() => void) | null = null;

function newHandoffCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function savePending(pending: PendingSignIn) {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    /* storage unavailable — the in-memory wait still works */
  }
}

function readPending(): PendingSignIn | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingSignIn;
    if (typeof pending?.code !== "string" || typeof pending.startedAt !== "number") return null;
    if (Date.now() - pending.startedAt > HANDOFF_WINDOW_MS) {
      clearPending();
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** True while a preview sign-in started in this tab may still complete. */
export function hasPendingSignIn(): boolean {
  return inLivePreview() && readPending() !== null;
}

/** Stop waiting for a preview sign-in (the "Abbrechen" button). */
export function cancelSignIn(): void {
  clearPending();
  cancelWaiting?.();
}

/** Human-readable German message for a sign-in error code. */
export function signInErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "cancelled":
      return "Anmeldung abgebrochen.";
    case "timeout":
      return "Die Anmeldung hat zu lange gedauert. Bitte versuch es noch einmal.";
    case "access_denied":
      return "Du hast die Anmeldung abgelehnt.";
    case "no_session":
      return "Die Anmeldung kam nicht zurück. Bitte versuch es noch einmal.";
    case "state_not_found":
    case "state_mismatch":
    case "please_restart_the_process":
      return "Die Anmeldung ist abgelaufen. Bitte starte sie noch einmal, am besten im selben Browser.";
    default:
      return `Anmeldung fehlgeschlagen${code ? ` (${code.slice(0, 80)})` : ""}. Bitte versuch es noch einmal.`;
  }
}

/** Wait for the token via postMessage OR the server-side claim, max 3 min. */
function waitForHandoff(code: string, startedAt: number): Promise<HandoffResult> {
  return new Promise((resolve) => {
    const origin = window.location.origin;
    let settled = false;
    let timer: number | undefined;
    const settle = (result: HandoffResult) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (cancelWaiting === cancel) cancelWaiting = null;
      resolve(result);
    };
    const cancel = () => settle({ token: null, error: "cancelled" });
    cancelWaiting?.();
    cancelWaiting = cancel;

    function onMessage(event: MessageEvent) {
      if (event.origin !== origin) return;
      const data = event.data as PopupMessage | undefined;
      if (!data || data.source !== "grok-auth-popup") return;
      // The server copy is single-use; claim it so it does not linger.
      void fetch(`/auth/popup?claim=${code}`, { cache: "no-store" }).catch(() => undefined);
      settle({ token: data.token ?? null, error: data.error ?? (data.token ? undefined : "no_session") });
    }

    async function poll() {
      if (settled) return;
      if (Date.now() - startedAt > HANDOFF_WINDOW_MS) {
        settle({ token: null, error: "timeout" });
        return;
      }
      try {
        const res = await fetch(`/auth/popup?claim=${code}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { status?: string; token?: string | null; error?: string | null };
          if (body.status === "done") {
            settle({ token: body.token ?? null, error: body.error ?? (body.token ? undefined : "no_session") });
            return;
          }
        }
      } catch {
        /* network blip — keep polling */
      }
      if (!settled) timer = window.setTimeout(() => void poll(), CLAIM_INTERVAL_MS);
    }

    window.addEventListener("message", onMessage);
    void poll();
  });
}

async function completePreviewSignIn(code: string, startedAt: number, callbackURL: string): Promise<void> {
  const result = await waitForHandoff(code, startedAt);
  clearPending();
  if (!result.token) {
    if (result.error === "cancelled") return;
    throw new Error(signInErrorMessage(result.error));
  }
  setBearerToken(result.token);
  // Refresh the client session store with the bearer attached (onRequest).
  try {
    await authClient.getSession();
  } catch {
    /* session store will recover on next useSession fetch */
  }
  authClient.$store.notify("$sessionSignal");
  const dest = new URL(callbackURL, window.location.origin);
  const here = window.location;
  if (dest.origin !== here.origin || dest.pathname !== here.pathname || dest.search !== here.search) {
    window.location.href = callbackURL;
  }
}

/**
 * After the preview iframe reloads mid sign-in (phones often reload the
 * backgrounded tab), pick the pending hand-off back up. Resolves true when a
 * session was established; throws with a readable message on failure.
 */
export async function resumePendingSignIn(): Promise<boolean> {
  if (!inLivePreview()) return false;
  const pending = readPending();
  if (!pending) return false;
  await completePreviewSignIn(pending.code, pending.startedAt, pending.callbackURL);
  return Boolean(getBearerToken());
}

/**
 * Sign out of THIS app's local session, clear the preview token, then redirect.
 *
 * Use this, never `authClient.signOut()` — see the note on `authClient`.
 * Sequencing lives in `scripts/sign-out-plan.mjs` so it can be unit-tested.
 *
 * **Rejects when deployed if the server never confirms.** There the session is
 * an HttpOnly cookie only the server can clear, so redirecting anyway would
 * report a sign-out that did not happen. `<UserButton />` handles that for you;
 * a hand-rolled control must catch it and let the visitor retry. In the live
 * preview the local clear is sufficient, so it always resolves.
 */
export async function signOut(redirectTo = "/"): Promise<void> {
  await runSignOut({
    livePreview: inLivePreview(),
    hasBearer: Boolean(getBearerToken()),
    // Better Auth resolves with `{ error }` instead of rejecting, so surface a
    // failed response as a rejection for the sequence to act on.
    requestSignOut: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed");
    },
    clearToken: () => setBearerToken(null),
    redirect: () => {
      window.location.href = redirectTo;
    },
  });
}
