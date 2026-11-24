import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";
import { normalizeClientError, saveErrorRow, type ErrorRow } from "./client-errors.server.ts";
import { isUserFacingError } from "./user-facing-error.ts";

/**
 * Own server error monitoring (no third-party service), next to the app crash
 * reports on /admin/age. Unexpected failures in server functions, the Stripe
 * webhook, Stripe calls whose error the person only sees as "try again", and
 * the retention cron land in the same anonymous, grouped table
 * (vela_client_errors, platform "server"): message and stack only, emails and
 * long tokens scrubbed, no user id, no IP, deleted 30 days after last seen.
 * Vercel's own logs keep the full console.error as before.
 */

/** Signed-out / cross-site rejections and redirects are normal, not bugs. */
const EXPECTED_NAMES = new Set(["UnauthorizedError", "CrossSiteRequestError", "AbortError"]);

/** Per server instance: at most this many writes per minute (a hot bug must not hammer the DB). */
export const SERVER_ERROR_WRITES_PER_MINUTE = 20;
const WRITE_TIMEOUT_MS = 2000;

/**
 * Pure: the row to store for one server error, or null when it is not worth
 * recording (expected rejections, messages meant for the person, non-errors).
 * `source` names where it happened, e.g. "fn:sendMessage" or "webhook:stripe".
 */
export function serverErrorRow(source: string, err: unknown, release = ""): ErrorRow | null {
  if (isUserFacingError(err)) return null;
  let message = "";
  let stack = "";
  if (err instanceof Error) {
    if (EXPECTED_NAMES.has(err.name)) return null;
    message = `${err.name}: ${err.message}`;
    stack = err.stack ?? "";
  } else if (typeof err === "string") {
    message = err;
  } else {
    return null;
  }
  const cleanSource = source.replace(/[^\w:.-]/g, "").slice(0, 80) || "server";
  const row = normalizeClientError(
    { message, stack, path: cleanSource, platform: "server", release },
    ["server"],
  );
  if (!row) return null;
  // Same message in different places stays two groups.
  const fingerprint = createHash("sha256").update(`${row.fingerprint}|${cleanSource}`).digest("hex").slice(0, 32);
  return { ...row, fingerprint };
}

/** Sliding one-minute write budget for this instance. */
export function createWriteBudget(max = SERVER_ERROR_WRITES_PER_MINUTE, windowMs = 60_000) {
  const times: number[] = [];
  return (now = Date.now()) => {
    while (times.length > 0 && now - times[0]! >= windowMs) times.shift();
    if (times.length >= max) return false;
    times.push(now);
    return true;
  };
}

const takeWrite = createWriteBudget();

function currentRelease() {
  return (process.env.VERCEL_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 7);
}

/**
 * Best effort: logs, then stores the error. Never throws and gives up after
 * 2 s, so monitoring can't break or stall the request it reports on.
 * `sql` is optional (defaults to the shared pool); tests pass a fake.
 */
export async function recordServerError(source: string, err: unknown, sql?: Sql): Promise<void> {
  try {
    const row = serverErrorRow(source, err, currentRelease());
    if (!row) return;
    console.error(`[server-error] ${row.path}`, err instanceof Error ? err.message : err);
    if (!takeWrite()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const write = (async () => {
      const db = sql ?? (await (await import("@/lib/db")).getSql());
      await saveErrorRow(db, row);
    })();
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, WRITE_TIMEOUT_MS);
    });
    await Promise.race([write.catch(() => undefined), timeout]);
    if (timer) clearTimeout(timer);
  } catch {
    // Monitoring must never turn one error into two.
  }
}
