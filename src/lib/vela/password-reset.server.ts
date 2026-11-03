import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Sql } from "@/lib/db";

/** How long an operator-created reset link stays valid. */
export const RESET_LINK_HOURS = 24;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type CreatedResetLink = { ok: true; token: string; expiresAt: string } | { ok: false; error: string };

/**
 * Create a one-time reset token for the account with this e-mail. Older unused
 * links for the same person stop working. Only the hash is stored.
 */
export async function createResetToken(sql: Sql, email: string, createdBy: string): Promise<CreatedResetLink> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return { ok: false, error: "Bitte eine E-Mail-Adresse eingeben." };
  const users = await sql<{ id: string }>`select id from "user" where lower(email) = ${normalized} limit 1`;
  const userId = users[0]?.id;
  if (!userId) return { ok: false, error: "Kein Konto mit dieser E-Mail-Adresse." };
  const accounts = await sql`
    select 1 from "account" where "userId" = ${userId} and "providerId" = 'credential' limit 1
  `;
  if (accounts.length === 0) return { ok: false, error: "Dieses Konto hat kein Passwort (andere Anmeldung)." };

  await sql`delete from vela_password_resets where user_id = ${userId} and used_at is null`;
  await sql`delete from vela_password_resets where created_at < now() - interval '8 days'`;
  const token = randomBytes(32).toString("base64url");
  const rows = await sql<{ expires_at: string | Date }>`
    insert into vela_password_resets (token_hash, user_id, created_by, expires_at)
    values (${hashToken(token)}, ${userId}, ${createdBy}, now() + make_interval(hours => ${RESET_LINK_HOURS}))
    returning expires_at
  `;
  const expires = rows[0]?.expires_at;
  return { ok: true, token, expiresAt: expires ? new Date(expires).toISOString() : "" };
}

export type ResetResult = { ok: true } | { ok: false; error: string };

/**
 * Set a new password with a valid link. Marks the link used and signs the
 * person out everywhere, so a stolen session can't stay logged in.
 */
export async function resetWithToken(sql: Sql, token: string, password: string): Promise<ResetResult> {
  if (password.length < 8) return { ok: false, error: "Das Passwort braucht mindestens 8 Zeichen." };
  if (password.length > 128) return { ok: false, error: "Das Passwort darf höchstens 128 Zeichen haben." };
  if (!token || token.length > 200) return { ok: false, error: "Dieser Link ist ungültig." };
  const claimed = await sql<{ user_id: string }>`
    update vela_password_resets set used_at = now()
    where token_hash = ${hashToken(token)} and used_at is null and expires_at > now()
    returning user_id
  `;
  const userId = claimed[0]?.user_id;
  if (!userId) return { ok: false, error: "Dieser Link ist abgelaufen oder wurde schon benutzt." };
  const hash = await hashPassword(password);
  const updated = await sql`
    update "account" set "password" = ${hash}, "updatedAt" = now()
    where "userId" = ${userId} and "providerId" = 'credential'
    returning 1
  `;
  if (updated.length === 0) return { ok: false, error: "Dieses Konto hat kein Passwort." };
  await sql`delete from "session" where "userId" = ${userId}`;
  return { ok: true };
}
