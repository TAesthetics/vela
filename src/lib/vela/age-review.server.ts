/**
 * Human age review — server-only (never import from client code).
 *
 * No AI: a "Minderjährig" report only queues a review entry. The operator
 * decides on /admin/age (suspend, approve/reject an uploaded ID).
 */
import type { Sql } from "@/lib/db";

export type AgeSource = "report" | "operator";

/** Audit entry in vela_age_flags (reports and operator actions). */
export async function recordFlag(
  sql: Sql,
  userId: string,
  source: AgeSource,
  action: "none" | "review" | "suspended",
  signals: string[] = [],
) {
  await sql`
    insert into vela_age_flags (id, user_id, source, minor_likelihood, signals, model, action)
    values (
      ${crypto.randomUUID()},
      ${userId},
      ${source},
      ${null},
      ${JSON.stringify(signals)}::jsonb,
      ${null},
      ${action}
    )
  `;
}

export async function suspendForAge(sql: Sql, userId: string) {
  await sql`
    update vela_profiles set status = 'suspended_age', suspended_at = now()
    where user_id = ${userId} and status = 'active'
  `;
}

/** Delete ID images older than 30 days (and any still pending → expired). */
export async function purgeOldIdImages(sql: Sql) {
  await sql`
    update vela_id_checks
    set image = null,
        status = case when status = 'pending' then 'expired' else status end
    where image is not null and created_at < now() - interval '30 days'
  `;
}

/**
 * Keyed hash of a login identity (provider + account id). Lets an open age
 * suspension survive full account deletion without keeping who it was.
 */
async function identityHashes(sql: Sql, userId: string): Promise<string[]> {
  const { createHmac } = await import("node:crypto");
  const key = process.env.BETTER_AUTH_SECRET?.trim() || "vela-identity";
  const rows = await sql<{ providerId: string; accountId: string }>`
    select "providerId", "accountId" from "account" where "userId" = ${userId}
  `;
  return rows.map((row) =>
    createHmac("sha256", key).update(`${row.providerId}:${row.accountId}`).digest("hex"),
  );
}

/** Before deleting an account with an open age suspension: remember the identity. */
export async function rememberSuspendedIdentity(sql: Sql, userId: string) {
  for (const hash of await identityHashes(sql, userId)) {
    await sql`
      insert into vela_deleted_identities (identity_hash, reason)
      values (${hash}, 'age_suspension')
      on conflict (identity_hash) do update set created_at = now()
    `;
  }
}

/**
 * On a new profile: if this login identity was deleted while suspended (within
 * 12 months), carry the suspension over to the new user id.
 */
export async function carryOverSuspension(sql: Sql, userId: string): Promise<boolean> {
  const hashes = await identityHashes(sql, userId);
  let carried = false;
  for (const hash of hashes) {
    const hit = await sql`
      delete from vela_deleted_identities
      where identity_hash = ${hash} and created_at > now() - interval '12 months'
      returning identity_hash
    `;
    if (hit.length > 0) carried = true;
  }
  if (carried) await recordFlag(sql, userId, "operator", "suspended", ["Sperre nach Löschen und Neuanmeldung übernommen"]);
  return carried;
}
