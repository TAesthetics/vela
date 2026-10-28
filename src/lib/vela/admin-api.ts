import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";

/**
 * Operator tools for age review. Access only for emails listed in the
 * ADMIN_EMAILS env var (comma-separated). Unset = nobody has access.
 */
async function isAdmin(sql: Sql, userId: string) {
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return false;
  const rows = await sql<{ email: string }>`select email from "user" where id = ${userId}`;
  const email = rows[0]?.email?.toLowerCase();
  return Boolean(email && allow.includes(email));
}

export type AdminIdCheck = {
  id: string;
  userId: string;
  name: string | null;
  age: number | null;
  createdAt: string;
  image: string | null;
  signals: string[];
};

export type AdminReport = {
  id: string;
  toUser: string;
  name: string | null;
  reason: string;
  details: string;
  createdAt: string;
  status: string | null;
};

export type AdminFlag = {
  id: string;
  userId: string;
  name: string | null;
  source: string;
  signals: string[];
  action: string;
  createdAt: string;
};

export type AdminData =
  | { allowed: false }
  | { allowed: true; checks: AdminIdCheck[]; reports: AdminReport[]; flags: AdminFlag[] };

function signalsOf(value: unknown): string[] {
  const list = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return Array.isArray(list) ? list.map(String) : [];
}

function iso(value: unknown) {
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

async function load(sql: Sql): Promise<AdminData> {
  const { purgeOldIdImages } = await import("@/lib/vela/age-review.server");
  await purgeOldIdImages(sql);
  const checks = await sql<{ id: string; user_id: string; name: string | null; age: number | null; created_at: unknown; image: string | null }>`
    select c.id, c.user_id, p.name, p.age, c.created_at, c.image
    from vela_id_checks c left join vela_profiles p on p.user_id = c.user_id
    where c.status = 'pending'
    order by c.created_at asc
  `;
  const flagRows = await sql<{ id: string; user_id: string; name: string | null; source: string; signals: unknown; action: string; created_at: unknown }>`
    select f.id, f.user_id, p.name, f.source, f.signals, f.action, f.created_at
    from vela_age_flags f left join vela_profiles p on p.user_id = f.user_id
    order by f.created_at desc
    limit 50
  `;
  const reports = await sql<{ id: string; to_user: string; name: string | null; reason: string; details: string; created_at: unknown; status: string | null }>`
    select r.id, r.to_user, p.name, r.reason, r.details, r.created_at, p.status
    from vela_reports r left join vela_profiles p on p.user_id = r.to_user
    where r.reviewed_at is null
    order by (r.reason = 'minor') desc, r.created_at asc
    limit 100
  `;
  return {
    allowed: true,
    checks: checks.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      age: row.age === null ? null : Number(row.age),
      createdAt: iso(row.created_at),
      image: row.image ? `data:image/jpeg;base64,${row.image}` : null,
      signals: flagRows.filter((flag) => flag.user_id === row.user_id).flatMap((flag) => signalsOf(flag.signals)),
    })),
    reports: reports.map((row) => ({
      id: row.id,
      toUser: row.to_user,
      name: row.name,
      reason: row.reason,
      details: row.details,
      createdAt: iso(row.created_at),
      status: row.status,
    })),
    flags: flagRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      source: row.source,
      signals: signalsOf(row.signals),
      action: row.action,
      createdAt: iso(row.created_at),
    })),
  };
}

export const loadAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminData> => {
    const sql = await getSql();
    if (!(await isAdmin(sql, context.userId))) return { allowed: false };
    return load(sql);
  });

/** Approve → unban; reject → stays banned. Either way the ID image is deleted now. */
export const decideIdCheck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; approve?: boolean }) => input)
  .handler(async ({ context, data }): Promise<AdminData> => {
    const sql = await getSql();
    if (!(await isAdmin(sql, context.userId))) return { allowed: false };
    const id = String(data?.id ?? "");
    const approve = data?.approve === true;
    const rows = await sql<{ user_id: string }>`
      update vela_id_checks
      set image = null, status = ${approve ? "approved" : "rejected"}, decided_at = now(), decided_by = ${context.userId}
      where id = ${id} and status = 'pending'
      returning user_id
    `;
    const userId = rows[0]?.user_id;
    if (userId && approve) {
      await sql`update vela_profiles set status = 'active', suspended_at = null where user_id = ${userId}`;
    }
    return load(sql);
  });

/** Manually suspend (age) the person behind a report, or close the report. */
export const resolveReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; suspend?: boolean }) => input)
  .handler(async ({ context, data }): Promise<AdminData> => {
    const sql = await getSql();
    if (!(await isAdmin(sql, context.userId))) return { allowed: false };
    const id = String(data?.id ?? "");
    const rows = await sql<{ to_user: string }>`
      update vela_reports set reviewed_at = now() where id = ${id} and reviewed_at is null returning to_user
    `;
    const userId = rows[0]?.to_user;
    if (userId && data?.suspend === true) {
      const age = await import("@/lib/vela/age-review.server");
      await age.suspendForAge(sql, userId);
      await age.recordFlag(sql, userId, "operator", "suspended", ["Vom Betreiber gesperrt (Alter)"]);
    }
    return load(sql);
  });
