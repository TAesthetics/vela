/**
 * What the app says when a request to the server fails outright (no network,
 * server unreachable, crash) instead of answering with its own error text.
 * Without this, a dropped connection left buttons stuck on "Speichert…" or
 * did nothing visible at all (block, report, swipe, ID upload).
 */
export type FailedAction = "save" | "swipe" | "undo" | "send" | "block" | "report" | "uploadId";

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
