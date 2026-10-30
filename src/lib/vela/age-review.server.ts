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
 * Retention (see /datenschutz, "Speicherdauer"). Runs whenever the app or the
 * admin page loads — there is no cron. Cheap: every statement hits only rows
 * past their deadline.
 *  - ID images: 30 days.
 *  - Crash reports: 30 days after last seen.
 *  - Reports: 12 months.
 *  - Remembered identities of accounts deleted while suspended: 12 months.
 *  - Age-review log and decided ID checks: 12 months, unless the person is
 *    still suspended (an open suspension keeps its history).
 */
export async function purgeExpired(sql: Sql) {
  await purgeOldIdImages(sql);
  const { purgeOldClientErrors } = await import("@/lib/vela/client-errors.server");
  await purgeOldClientErrors(sql);
  await sql`delete from vela_reports where created_at < now() - interval '12 months'`;
  await sql`delete from vela_deleted_identities where created_at < now() - interval '12 months'`;
  await sql`
    delete from vela_age_flags f
    where f.created_at < now() - interval '12 months'
      and not exists (
        select 1 from vela_profiles p where p.user_id = f.user_id and p.status <> 'active'
      )
      and not (
        f.action = 'suspended'
        and exists (select 1 from "user" u where u.id = f.user_id)
        and not exists (
          select 1 from vela_id_checks c
          where c.user_id = f.user_id and c.status = 'approved' and c.decided_at > f.created_at
        )
      )
  `;
  await sql`
    delete from vela_id_checks c
    where c.image is null
      and coalesce(c.decided_at, c.created_at) < now() - interval '12 months'
      and not exists (
        select 1 from vela_profiles p where p.user_id = c.user_id and p.status <> 'active'
      )
  `;
}

/**
 * Normalized e-mail for the suspension check: lower-case, "+tag" dropped, so
 * "Name+x@Mail.com" and "name@mail.com" count as the same person.
 */
function normalizeEmail(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  return `${local.split("+")[0]}@${domain}`;
}

/**
 * Keyed hashes of a login identity. OAuth: provider + account id. E-mail +
 * password ("credential", whose account id is just the user id): the
 * normalized e-mail, so re-registering with the same address after deleting
 * a suspended account does not dodge the suspension. Lets an open age
 * suspension survive full account deletion without keeping who it was.
 */
async function identityHashes(sql: Sql, userId: string): Promise<string[]> {
  const { createHmac } = await import("node:crypto");
  const key = process.env.BETTER_AUTH_SECRET?.trim() || "vela-identity";
  const rows = await sql<{ providerId: string; accountId: string; email: string | null }>`
    select a."providerId", a."accountId", u.email
    from "account" a left join "user" u on u.id = a."userId"
    where a."userId" = ${userId}
  `;
  const identities = rows.map((row) =>
    row.providerId === "credential"
      ? `email:${normalizeEmail(row.email ?? row.accountId)}`
      : `${row.providerId}:${row.accountId}`,
  );
  return [...new Set(identities)].map((identity) =>
    createHmac("sha256", key).update(identity).digest("hex"),
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
