/**
 * What the app says when a request to the server fails outright (no network,
 * server unreachable, crash) instead of answering with its own error text.
 * Without this, a dropped connection left buttons stuck on "Speichert…" or
 * did nothing visible at all (block, report, swipe, ID upload).
 */
export type FailedAction = "save" | "swipe" | "undo" | "send" | "block" | "report" | "uploadId" | "older" | "plus";

const TEXTS: Record<FailedAction, { offline: string; failed: string }> = {
  save: {
    offline: "Keine Verbindung. Dein Profil ist noch nicht gespeichert.",
    failed: "Speichern hat nicht geklappt. Versuch es gleich nochmal.",
  },
  swipe: {
    offline: "Keine Verbindung. Die Karte ist noch da, versuch es gleich nochmal.",
    failed: "Das hat nicht geklappt. Versuch es gleich nochmal.",
  },
  undo: {
    offline: "Keine Verbindung. Rückgängig geht gerade nicht.",
    failed: "Rückgängig hat nicht geklappt. Versuch es gleich nochmal.",
  },
  send: {
    offline: "Keine Verbindung. Deine Nachricht ist noch nicht raus.",
    failed: "Senden hat nicht geklappt. Versuch es gleich nochmal.",
  },
  block: {
    offline: "Keine Verbindung. Noch nicht blockiert, versuch es gleich nochmal.",
    failed: "Blockieren hat nicht geklappt. Versuch es gleich nochmal.",
  },
  report: {
    offline: "Keine Verbindung. Deine Meldung ist noch nicht raus.",
    failed: "Melden hat nicht geklappt. Versuch es gleich nochmal.",
  },
  uploadId: {
    offline: "Keine Verbindung. Dein Ausweis ist noch nicht hochgeladen.",
    failed: "Hochladen hat nicht geklappt. Versuch es gleich nochmal.",
  },
  older: {
    offline: "Keine Verbindung. Ältere Nachrichten lassen sich gerade nicht laden.",
    failed: "Ältere Nachrichten ließen sich nicht laden. Versuch es gleich nochmal.",
  },
  plus: {
    offline: "Keine Verbindung. Vela+ lässt sich gerade nicht freischalten.",
    failed: "Freischalten hat nicht geklappt. Versuch es gleich nochmal.",
  },
};

export function failureText(action: FailedAction, offline: boolean): string {
  const text = TEXTS[action];
  return offline ? text.offline : text.failed;
}

/** True when the browser knows it has no connection. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Shown when the server no longer accepts this phone's login (ended elsewhere). */
export const SIGNED_OUT_TEXT = "Du wurdest abgemeldet.";

/**
 * True when a server function refused the request because the session is no
 * longer valid: password changed, "Andere Geräte abmelden" or the account was
 * deleted on another phone. `requireUserId` throws `UnauthorizedError`, whose
 * message "Unauthorized" is the stable contract that survives serialization.
 */
export function isUnauthorized(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { message?: unknown }).message === "Unauthorized";
}

/**
 * Shown instead of the endless "Der Schleier liegt." when the very first load
 * fails (no network, server unreachable or crashed), with a retry button.
 */
export function loadFailureText(offline: boolean): string {
  return offline
    ? "Keine Verbindung. Vela lädt, sobald du wieder Netz hast."
    : "Vela ließ sich gerade nicht laden. Versuch es gleich nochmal.";
}

/**
 * loadVela refused because this login reloaded too often within a minute
 * (LOAD_RULE in api.ts). Not a bug and not offline, so it is shown as is and
 * never sent to error monitoring.
 */
export const LOAD_LIMITED_TEXT = "Vela wurde gerade sehr oft neu geladen. Warte eine Minute und versuch es dann nochmal.";

/** True for the server's "reloaded too often" answer (message survives serialization). */
export function isLoadLimited(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { message?: unknown }).message === LOAD_LIMITED_TEXT;
}

/**
 * A swipe, message, undo, block, report, Vela+ or ID upload was refused
 * because this login sent far more of them within a minute than a person can
 * (ACTION_RULE in api.ts). Nothing was stored; shown as is, never reported.
 */
export const ACTION_LIMITED_TEXT = "Gerade kam sehr viel auf einmal an. Warte eine Minute und versuch es dann nochmal.";

/** True for the server's "too many actions" answer (message survives serialization). */
export function isActionLimited(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { message?: unknown }).message === ACTION_LIMITED_TEXT;
}

/**
 * exportMyData refused because this login exported too often within an hour
 * (DATA_EXPORT_RULE in api.ts). Shown as is, never reported.
 */
export const EXPORT_LIMITED_TEXT = "Du hast gerade schon mehrmals exportiert. Versuch es in ein paar Minuten noch einmal.";

/**
 * True when the person closed the share sheet without picking a target:
 * Capacitor Share rejects with "Share canceled", the Web Share API with an
 * AbortError. Not a failure, so nothing is shown.
 */
export function isShareCanceled(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  return name === "AbortError" || (typeof message === "string" && /share cancell?ed/i.test(message));
}

/**
 * What "Meine Daten herunterladen" says when it fails, or null when nothing
 * should be shown (share sheet closed on purpose). Before, every failure read
 * "Export ging gerade nicht", even the server's "exported too often" answer.
 */
export function exportFailureText(err: unknown, offline: boolean): string | null {
  if (isShareCanceled(err)) return null;
  if (typeof err === "object" && err !== null && (err as { message?: unknown }).message === EXPORT_LIMITED_TEXT) {
    return EXPORT_LIMITED_TEXT;
  }
  if (isUnauthorized(err)) return SIGNED_OUT_TEXT;
  if (offline) return "Keine Verbindung. Der Export geht, sobald du wieder Netz hast.";
  return "Export ging gerade nicht. Versuch es gleich nochmal.";
}
