import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";

/** Max distinct error groups kept; new groups beyond this are dropped. */
const MAX_GROUPS = 500;

export type ClientErrorInput = {
  message?: unknown;
  stack?: unknown;
  path?: unknown;
  platform?: unknown;
  release?: unknown;
};

/** Removes query strings and fragments (could carry login codes or tokens). */
function stripQueries(text: string) {
  return text.replace(/([^\s?#()]+)[?#][^\s:()]*/g, "$1");
}

/** Removes things that look like emails or long tokens from free text. */
function scrub(text: string) {
  return stripQueries(text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "<token>");
}

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function normalizeClientError(input: ClientErrorInput) {
  const message = scrub(clip(input.message, 500)).slice(0, 300).trim();
  if (!message) return null;
  const stack = scrub(clip(input.stack, 4000)).slice(0, 2000);
  const path = stripQueries(clip(input.path, 300)).slice(0, 200);
  const platform = ["web", "ios", "android"].includes(String(input.platform)) ? String(input.platform) : "web";
  const release = clip(input.release, 40).replace(/[^\w.-]/g, "");
  // Group by message + top stack frame without line/column noise.
  const topFrame = stack.split("\n").find((line) => line.includes("/")) ?? "";
  const fingerprint = createHash("sha256")
    .update(`${message.replace(/\d+/g, "N")}|${topFrame.replace(/:\d+/g, "")}`)
    .digest("hex")
    .slice(0, 32);
  return { fingerprint, message, stack, path, platform, release };
}

export async function recordClientError(sql: Sql, input: ClientErrorInput) {
  const row = normalizeClientError(input);
  if (!row) return false;
  const existing = await sql<{ fingerprint: string }>`
    update vela_client_errors
    set count = count + 1, last_seen = now(), path = ${row.path}, release = ${row.release}
    where fingerprint = ${row.fingerprint}
    returning fingerprint
  `;
  if (existing.length > 0) return true;
  const total = await sql<{ n: unknown }>`select count(*) as n from vela_client_errors`;
  if (Number(total[0]?.n ?? 0) >= MAX_GROUPS) return false;
  await sql`
    insert into vela_client_errors (fingerprint, message, stack, path, platform, release)
    values (${row.fingerprint}, ${row.message}, ${row.stack}, ${row.path}, ${row.platform}, ${row.release})
    on conflict (fingerprint) do update set count = vela_client_errors.count + 1, last_seen = now()
  `;
  return true;
}

export async function purgeOldClientErrors(sql: Sql) {
  await sql`delete from vela_client_errors where last_seen < now() - interval '30 days'`;
}
