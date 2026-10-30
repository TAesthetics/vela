/**
 * Own crash reporting (no Sentry or other third party). Uncaught errors and
 * rejected promises are sent anonymously to /api/client-error and show up on
 * /admin/age. No user id, no cookies, no query strings. At most 5 reports per
 * page load, each distinct message once.
 */
const MAX_PER_PAGE = 5;
const sent = new Set<string>();
let installed = false;

function platform(): string {
  if (typeof window === "undefined") return "web";
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  try {
    const name = cap?.getPlatform?.();
    return name === "ios" || name === "android" ? name : "web";
  } catch {
    return "web";
  }
}

export function reportError(error: unknown) {
  if (typeof window === "undefined") return;
  try {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : typeof error === "string" ? error : "";
    if (!message || sent.has(message) || sent.size >= MAX_PER_PAGE) return;
    // Noise from browser extensions / aborted navigations.
    if (/ResizeObserver loop|Script error\.?$|AbortError/.test(message)) return;
    sent.add(message);
    const body = JSON.stringify({
      message,
      stack: error instanceof Error ? (error.stack ?? "") : "",
      path: window.location.pathname,
      platform: platform(),
      release: String(import.meta.env.VITE_VELA_RELEASE ?? ""),
    });
    const url = "/api/client-error";
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
    void fetch(url, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true, credentials: "omit" }).catch(
      () => undefined,
    );
  } catch {
    // Reporting must never throw.
  }
}

export function installErrorReporter() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  window.addEventListener("error", (event) => reportError(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => reportError(event.reason));
}
