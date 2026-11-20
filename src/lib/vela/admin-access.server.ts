import type { Sql } from "@/lib/db";

export type AdminEnv = { ADMIN_EMAILS?: string; ADMIN_USER_IDS?: string };

function list(value: string | undefined, lower: boolean) {
  return (value ?? "")
    .split(",")
    .map((item) => (lower ? item.trim().toLowerCase() : item.trim()))
    .filter(Boolean);
}

/**
 * Who may use /admin.
 *
 * - ADMIN_USER_IDS set (comma-separated account IDs): only those accounts,
 *   ADMIN_EMAILS is ignored. Account IDs are random and never reused.
 * - Otherwise ADMIN_EMAILS, but each address is pinned to the first account
 *   that used admin access with it (table vela_admin_pins). E-mails are not
 *   verified, so after the operator's account was deleted someone else could
 *   register the same address; the pin keeps that new account out.
 *
 * Fails closed: any database error means no access.
 */
export async function isAdminUser(sql: Sql, userId: string, env: AdminEnv = process.env): Promise<boolean> {
  if (!userId) return false;
  const ids = list(env.ADMIN_USER_IDS, false);
  if (ids.length > 0) return ids.includes(userId);
  const emails = list(env.ADMIN_EMAILS, true);
  if (emails.length === 0) return false;
  try {
    const rows = await sql<{ email: string | null }>`select email from "user" where id = ${userId}`;
    const email = rows[0]?.email?.trim().toLowerCase();
    if (!email || !emails.includes(email)) return false;
    // First use claims the address; later accounts with the same address don't.
    await sql`
      insert into vela_admin_pins (email, user_id) values (${email}, ${userId})
      on conflict (email) do nothing
    `;
    const pins = await sql<{ user_id: string }>`select user_id from vela_admin_pins where email = ${email}`;
    return pins[0]?.user_id === userId;
  } catch {
    return false;
  }
}
