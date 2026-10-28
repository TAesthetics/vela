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
