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
  action: "none" | "review" | "suspended" | "banned" | "unbanned",
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

/** Ban for rule violations (not age): hidden everywhere, no ID upload path. */
export async function banForRules(sql: Sql, userId: string) {
  await sql`
    update vela_profiles set status = 'banned', suspended_at = now()
    where user_id = ${userId} and status <> 'banned'
  `;
}

/** Lift a rule ban (operator). Leaves age suspensions untouched. */
export async function liftBan(sql: Sql, userId: string) {
  const rows = await sql`
    update vela_profiles set status = 'active', suspended_at = null
    where user_id = ${userId} and status = 'banned'
    returning user_id
  `;
  return rows.length > 0;
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

/** At most one fallback purge per window, shared across all instances. */
export const RETENTION_FALLBACK_RULE = { windowSec: 10 * 60, max: 1 } as const;

/**
 * Fallback retention for hot paths (app load, unauthenticated cron header):
 * runs purgeExpired at most once per 10 minutes, coordinated through the
 * shared rateLimit table, so frequent app loads or spoofed cron calls don't
 * each fire the full set of delete statements. The daily cron with
 * CRON_SECRET and the admin page still call purgeExpired directly.
 */
export async function purgeExpiredThrottled(sql: Sql): Promise<boolean> {
  const { consumeRateLimit } = await import("./rate-limit.server.ts");
  if (!(await consumeRateLimit(sql, "vela:retention-purge", RETENTION_FALLBACK_RULE))) return false;
  await purgeExpired(sql);
  return true;
}

/**
 * Retention (see /datenschutz, "Speicherdauer"). Runs daily via Vercel Cron
 * at /api/cron/retention (03:15 UTC) and still on app/admin load as a fallback.
 * Cheap: every statement hits only rows past their deadline.
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
  // Reset links: valid 24 h, kept at most 7 days after that.
  await sql`delete from vela_password_resets where created_at < now() - interval '8 days'`;
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

export type CarriedSuspension = "age" | "ban";

/**
 * Before deleting an account with an open age suspension or a rule ban:
 * remember the identity (keyed hash only) and why.
 */
export async function rememberSuspendedIdentity(sql: Sql, userId: string, kind: CarriedSuspension = "age") {
  const reason = kind === "ban" ? "ban" : "age_suspension";
  for (const hash of await identityHashes(sql, userId)) {
    await sql`
      insert into vela_deleted_identities (identity_hash, reason)
      values (${hash}, ${reason})
      on conflict (identity_hash) do update set created_at = now(),
        reason = case when vela_deleted_identities.reason = 'ban' then 'ban' else excluded.reason end
    `;
  }
}

/**
 * On a new profile: if this login identity was deleted while suspended (within
 * 12 months), carry the suspension over to the new user id.
 */
export async function carryOverSuspension(sql: Sql, userId: string): Promise<CarriedSuspension | null> {
  const hashes = await identityHashes(sql, userId);
  let carried: CarriedSuspension | null = null;
  for (const hash of hashes) {
    const hit = await sql<{ reason: string }>`
      delete from vela_deleted_identities
      where identity_hash = ${hash} and created_at > now() - interval '12 months'
      returning reason
    `;
    for (const row of hit) {
      if (row.reason === "ban") carried = "ban";
      else carried ??= "age";
    }
  }
  if (carried === "ban") {
    await recordFlag(sql, userId, "operator", "banned", ["Sperre (Regelverstoß) nach Löschen und Neuanmeldung übernommen"]);
  } else if (carried === "age") {
    await recordFlag(sql, userId, "operator", "suspended", ["Sperre nach Löschen und Neuanmeldung übernommen"]);
  }
  return carried;
}
