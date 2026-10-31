import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  FREE_SWIPES,
  emptySnapshot,
  ORBITS,
  PROMPT_BANK,
  REPORT_REASONS,
  VALUES,
  isUnveiled,
  type Me,
  type Message,
  type Orbit,
  type Person,
  type Prompt,
  type Billing,
  type Snapshot,
  type Thread,
} from "@/lib/vela/data";

type ProfileRow = {
  user_id: string;
  name: string;
  age: number;
  city: string;
  orbit: string;
  values: unknown;
  prompts: unknown;
  photo: string | null;
  plus: boolean | string;
  status?: string;
  sparked_you?: boolean | string;
  adult_confirmed_at?: string | Date | null;
};

const ORBIT_IDS = new Set<string>(ORBITS.map((orbit) => orbit.id));
const VALUE_IDS = new Set<string>(VALUES);
const QUESTIONS = new Set<string>(PROMPT_BANK);

function berlinDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function asBool(value: unknown) {
  return value === true || value === "t" || value === "true";
}

function asJson<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value ?? fallback) as T;
}

function asPrompts(value: unknown): Prompt[] {
  const list = asJson<unknown[]>(value, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as { id?: unknown; q?: unknown; a?: unknown };
      return { id: String(row.id ?? ""), q: String(row.q ?? ""), a: String(row.a ?? "") };
    });
}

function asValues(value: unknown) {
  const list = asJson<unknown[]>(value, []);
  return Array.isArray(list) ? list.map((item) => String(item)) : [];
}

function toPerson(row: ProfileRow, sparkedYou: boolean): Person {
  return {
    id: row.user_id,
    name: row.name,
    age: Number(row.age),
    city: row.city,
    orbit: (ORBIT_IDS.has(row.orbit) ? row.orbit : "real") as Orbit,
    values: asValues(row.values),
    prompts: asPrompts(row.prompts),
    sparkedYou,
  };
}

function toMe(row: ProfileRow): Me {
  return {
    name: row.name,
    age: Number(row.age),
    city: row.city,
    orbit: (ORBIT_IDS.has(row.orbit) ? row.orbit : "real") as Orbit,
    values: asValues(row.values),
    prompts: asPrompts(row.prompts),
    photo: row.photo,
    onboarded: true,
    adultConfirmed: Boolean(row.adult_confirmed_at),
  };
}

function pairOf(a: string, b: string) {
  return a < b ? [a, b] : [b, a];
}

function stamp(value: unknown) {
  const at = new Date(value as string | number | Date).getTime();
  return Number.isFinite(at) ? at : Date.now();
}

const REASON_IDS = new Set<string>(REPORT_REASONS.map((reason) => reason.id));

/** True when either person has blocked the other. */
async function isBlocked(sql: Sql, a: string, b: string) {
  const rows = await sql`
    select 1 from vela_blocks
    where (from_user = ${a} and to_user = ${b}) or (from_user = ${b} and to_user = ${a})
    limit 1
  `;
  return rows.length > 0;
}

async function plusAvailable() {
  // Server-only import, kept out of the client bundle.
  const { isWorkspacePreview } = await import("@/lib/env.server");
  return isWorkspacePreview();
}

function billingServer() {
  // Server-only module (Stripe key), loaded lazily so it never reaches the client bundle.
  return import("@/lib/vela/stripe.server");
}

async function billingSnapshot(sql: Sql, userId: string): Promise<Billing> {
  const stripe = await billingServer();
  const row = await stripe.billingOf(sql, userId);
  const end = row?.current_period_end ? new Date(row.current_period_end).getTime() : null;
  return {
    configured: stripe.stripeConfigured(),
    customer: Boolean(row?.stripe_customer_id),
    status: row?.status ?? null,
    periodEnd: end && Number.isFinite(end) ? end : null,
    cancelAtPeriodEnd: row ? asBool(row.cancel_at_period_end) : false,
  };
}

/** Public https origin for Stripe return URLs. */
async function appOrigin() {
  const { selfHostedPublicUrl } = await import("@/lib/env.server");
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  if (request) {
    const url = new URL(request.url);
    const host = request.headers.get("x-forwarded-host") ?? url.host;
    const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    if (host) return `${proto}://${host}`;
  }
  return selfHostedPublicUrl() ?? "";
}

function ageReview() {
  // Server-only module, loaded lazily so it never reaches the client bundle.
  return import("@/lib/vela/age-review.server");
}

/** The person's own profile status ('active' when there is no profile yet). */
async function statusOf(sql: Sql, userId: string) {
  const rows = await sql<{ status: string }>`select status from vela_profiles where user_id = ${userId}`;
  return rows[0]?.status ?? "active";
}

/**
 * Per-person abuse limits, counted from the rows themselves so they hold on
 * serverless (no in-memory state). Generous for real chats, tight for bots.
 */
const MESSAGE_LIMITS = { perMinute: 20, perDay: 600 };
const REPORTS_PER_DAY = 10;

async function messageLimitHit(sql: Sql, userId: string) {
  const rows = await sql<{ minute: number | string; day: number | string }>`
    select
      count(*) filter (where created_at > now() - interval '1 minute') as minute,
      count(*) as day
    from vela_messages
    where from_user = ${userId} and created_at > now() - interval '1 day'
  `;
  return (
    Number(rows[0]?.minute ?? 0) >= MESSAGE_LIMITS.perMinute ||
    Number(rows[0]?.day ?? 0) >= MESSAGE_LIMITS.perDay
  );
}

/** Rejects actions by suspended people and toward suspended/blocked people. */
async function canInteract(sql: Sql, me: string, other: string) {
  if ((await statusOf(sql, me)) !== "active") return false;
  if ((await statusOf(sql, other)) !== "active") return false;
  return !(await isBlocked(sql, me, other));
}

/** True once the operator approved an ID for this person. */
async function ageVerified(sql: Sql, userId: string) {
  const rows = await sql`
    select 1 from vela_id_checks where user_id = ${userId} and status = 'approved' limit 1
  `;
  return rows.length > 0;
}

/**
 * A suspension survives deleting and re-creating the profile: it stays open
 * until an ID check after the latest suspension flag was approved.
 */
async function openAgeSuspension(sql: Sql, userId: string) {
  const rows = await sql`
    select 1 from vela_age_flags f
    where f.user_id = ${userId} and f.action = 'suspended'
      and not exists (
        select 1 from vela_id_checks c
        where c.user_id = f.user_id and c.status = 'approved' and c.decided_at > f.created_at
      )
    limit 1
  `;
  return rows.length > 0;
}

async function suspensionSnapshot(sql: Sql, userId: string): Promise<Snapshot> {
  const checks = await sql<{ status: string }>`
    select status from vela_id_checks where user_id = ${userId}
    order by created_at desc limit 1
  `;
  const status = checks[0]?.status;
  const idCheck =
    status === "pending" || status === "approved" || status === "rejected" || status === "expired"
      ? status
      : "none";
  return {
    ...emptySnapshot(),
    suspension: { reason: "age", idCheck },
  };
}

async function snapshot(sql: Sql, userId: string): Promise<Snapshot> {
  const day = berlinDay();
  const mine = await sql<ProfileRow>`
    select user_id, name, age, city, orbit, values, prompts, photo, plus, status, adult_confirmed_at
    from vela_profiles where user_id = ${userId}
  `;
  const meRow = mine[0];
  // Suspended people see only the suspension screen — nothing about others.
  if (meRow && meRow.status !== "active") return suspensionSnapshot(sql, userId);
  const plus = meRow ? asBool(meRow.plus) : false;
  const usedRows = await sql<{ n: number }>`
    select count(*) as n from vela_swipes
    where from_user = ${userId} and day = ${day}
  `;
  const used = Number(usedRows[0]?.n ?? 0);
  const lastRows = await sql<{ to_user: string }>`
    select to_user from vela_swipes
    where from_user = ${userId} and direction = 'pass'
    order by created_at desc
    limit 1
  `;
  const otherRows = await sql<{ n: number }>`
    select count(*) as n from vela_profiles p
    where p.user_id <> ${userId}
      and p.status = 'active'
      and not exists (
        select 1 from vela_blocks b
        where (b.from_user = ${userId} and b.to_user = p.user_id)
           or (b.from_user = p.user_id and b.to_user = ${userId})
      )
  `;
  const deckRows = await sql<ProfileRow>`
    select p.user_id, p.name, p.age, p.city, p.orbit, p.values, p.prompts, p.photo, p.plus,
      exists (
        select 1 from vela_swipes s
        where s.from_user = p.user_id and s.to_user = ${userId} and s.direction = 'spark'
      ) as sparked_you
    from vela_profiles p
    where p.user_id <> ${userId}
      and p.status = 'active'
      and not exists (
        select 1 from vela_swipes s where s.from_user = ${userId} and s.to_user = p.user_id
      )
      and not exists (
        select 1 from vela_blocks b
        where (b.from_user = ${userId} and b.to_user = p.user_id)
           or (b.from_user = p.user_id and b.to_user = ${userId})
      )
    order by p.created_at desc
    limit 40
  `;
  const inboundRows = deckRows.filter((row) => asBool(row.sparked_you));
  const matchRows = await sql<ProfileRow & { photo: string | null }>`
    select p.user_id, p.name, p.age, p.city, p.orbit, p.values, p.prompts, p.photo, p.plus
    from vela_swipes mine
    join vela_swipes theirs
      on theirs.from_user = mine.to_user
     and theirs.to_user = mine.from_user
     and theirs.direction = 'spark'
    join vela_profiles p on p.user_id = mine.to_user
    where mine.from_user = ${userId} and mine.direction = 'spark'
      and p.status = 'active'
      and not exists (
        select 1 from vela_blocks b
        where (b.from_user = ${userId} and b.to_user = p.user_id)
           or (b.from_user = p.user_id and b.to_user = ${userId})
      )
    order by mine.created_at desc
  `;
  const messageRows = await sql<{
    id: string;
    pair_a: string;
    pair_b: string;
    from_user: string;
    body: string;
    kind: string;
    created_at: unknown;
  }>`
    select id, pair_a, pair_b, from_user, body, kind, created_at
    from vela_messages
    where pair_a = ${userId} or pair_b = ${userId}
    order by created_at asc
  `;

  const threads: Thread[] = matchRows.map((row) => {
    const [pairA, pairB] = pairOf(userId, row.user_id);
    const messages: Message[] = messageRows
      .filter((message) => message.pair_a === pairA && message.pair_b === pairB)
      .map((message) => ({
        id: message.id,
        from: message.from_user === userId ? ("me" as const) : ("them" as const),
        kind: message.kind === "note" ? ("note" as const) : ("message" as const),
        text: message.body,
        at: stamp(message.created_at),
      }));
    // The veil lifts only when BOTH people have each written VEIL_AFTER chat
    // messages in this match. Spark notes never count. Enforced here, server-side:
    // the photo is not sent to the client until then.
    const chat = messages.filter((message) => message.kind === "message");
    const mineCount = chat.filter((message) => message.from === "me").length;
    const theirCount = chat.filter((message) => message.from === "them").length;
    const unveiled = isUnveiled(mineCount, theirCount);
    return {
      person: toPerson(row, true),
      photo: unveiled ? row.photo : null,
      unveiled,
      mineCount,
      theirCount,
      messages,
    };
  });

  return {
    me: meRow ? toMe(meRow) : null,
    suspension: null,
    plus,
    plusAvailable: await plusAvailable(),
    billing: await billingSnapshot(sql, userId),
    swipesLeft: plus ? null : Math.max(0, FREE_SWIPES - used),
    lastPassId: lastRows[0]?.to_user ?? null,
    others: Number(otherRows[0]?.n ?? 0),
    deck: deckRows.map((row) => toPerson(row, plus && asBool(row.sparked_you))),
    inbound: plus ? inboundRows.map((row) => toPerson(row, true)) : [],
    inboundCount: inboundRows.length,
    threads,
  };
}

function cleanProfile(input: unknown): { me: Me } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Das Profil ist unvollständig." };
  const raw = input as Partial<Me>;
  const name = String(raw.name ?? "").trim().replace(/\s+/g, " ");
  const city = String(raw.city ?? "").trim().replace(/\s+/g, " ");
  const age = Number(raw.age);
  const orbit = String(raw.orbit ?? "");
  if (name.length < 2 || name.length > 32) return { error: "Wie sollen wir dich nennen?" };
  if (!Number.isInteger(age) || age < 18 || age > 99) return { error: "Vela ist nur für Erwachsene." };
  if (raw.adultConfirmed !== true) return { error: "Bitte bestätige, dass du mindestens 18 Jahre alt bist." };
  if (city.length < 2 || city.length > 40) return { error: "In welcher Stadt bist du?" };
  if (!ORBIT_IDS.has(orbit)) return { error: "Wähl einen Orbit." };
  const values = Array.isArray(raw.values) ? raw.values.map(String) : [];
  if (values.length !== 3 || values.some((value) => !VALUE_IDS.has(value))) {
    return { error: "Wähl drei, nicht mehr." };
  }
  const prompts = Array.isArray(raw.prompts) ? raw.prompts : [];
  if (prompts.length !== 2) return { error: "Zwei Sätze, nicht mehr und nicht weniger." };
  const cleanPrompts: Prompt[] = [];
  for (const prompt of prompts) {
    if (!prompt || typeof prompt !== "object") return { error: "Die Sätze sind unvollständig." };
    const row = prompt as Partial<Prompt>;
    const id = String(row.id ?? "");
    const q = String(row.q ?? "");
    const a = String(row.a ?? "").trim().replace(/\s+/g, " ");
    if (!/^[a-z0-9-]{1,40}$/.test(id)) return { error: "Die Sätze sind unvollständig." };
    if (!QUESTIONS.has(q)) return { error: "Wähl eine der Fragen." };
    if (a.length < 8 || a.length > 280) return { error: "Zwei echte Sätze. Mindestens ein paar Worte." };
    cleanPrompts.push({ id, q, a });
  }
  if (cleanPrompts[0].q === cleanPrompts[1].q) return { error: "Zwei verschiedene Fragen." };
  let photo: string | null = null;
  if (raw.photo) {
    const value = String(raw.photo);
    if (!value.startsWith("data:image/jpeg;base64,") || value.length > 120_000) {
      return { error: "Das Porträt ist zu groß. Ein kleineres Bild bitte." };
    }
    photo = value;
  }
  return {
    me: {
      name,
      age,
      city,
      orbit: orbit as Orbit,
      values,
      prompts: cleanPrompts,
      photo,
      onboarded: true,
      adultConfirmed: true,
    },
  };
}

export const loadVela = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    // Retention on every load: reports 12 months, ID images 30 days (no cron).
    await (await ageReview()).purgeExpired(sql);
    return snapshot(sql, context.userId);
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const parsed = cleanProfile(data);
    if ("error" in parsed) return { error: parsed.error, snapshot: null };
    const sql = await getSql();
    const me = parsed.me;
    // A suspended person can't edit their way out, and a deleted + re-created
    // profile starts suspended while an age suspension is still open.
    const isNew = (await sql`select 1 from vela_profiles where user_id = ${context.userId}`).length === 0;
    const suspended =
      (await statusOf(sql, context.userId)) !== "active" ||
      (await openAgeSuspension(sql, context.userId)) ||
      (isNew && (await (await ageReview()).carryOverSuspension(sql, context.userId)));
    await sql.query(
      `insert into vela_profiles (user_id, name, age, city, orbit, values, prompts, photo, status, adult_confirmed_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, now())
       on conflict (user_id) do update set
         adult_confirmed_at = coalesce(vela_profiles.adult_confirmed_at, excluded.adult_confirmed_at),
         name = excluded.name,
         age = excluded.age,
         city = excluded.city,
         orbit = excluded.orbit,
         values = excluded.values,
         prompts = excluded.prompts,
         photo = excluded.photo`,
      [
        context.userId,
        me.name,
        me.age,
        me.city,
        me.orbit,
        JSON.stringify(me.values),
        JSON.stringify(me.prompts),
        me.photo,
        suspended ? "suspended_age" : "active",
      ],
    );
    // Paid before the profile existed (or re-created it): carry VELA+ over.
    await (await billingServer()).syncPlus(sql, context.userId);
    return { error: null, snapshot: await snapshot(sql, context.userId) };
  });

export const swipe = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { toUser?: string; direction?: string; promptId?: string; note?: string }) => input)
  .handler(async ({ context, data }) => {
    const toUser = String(data?.toUser ?? "");
    const direction = data?.direction === "spark" ? "spark" : data?.direction === "pass" ? "pass" : "";
    const note = String(data?.note ?? "").trim().slice(0, 240);
    const promptId = String(data?.promptId ?? "");
    if (!toUser || toUser === context.userId || !direction) {
      const sql = await getSql();
      return { status: "skip" as const, snapshot: await snapshot(sql, context.userId) };
    }
    const sql = await getSql();
    const day = berlinDay();
    const target = await sql<ProfileRow>`
      select user_id, name, age, city, orbit, values, prompts, photo, plus
      from vela_profiles where user_id = ${toUser}
    `;
    if (!target[0]) return { status: "skip" as const, snapshot: await snapshot(sql, context.userId) };
    if (!(await canInteract(sql, context.userId, toUser))) {
      return { status: "skip" as const, snapshot: await snapshot(sql, context.userId) };
    }
    const existing = await sql<{ direction: string }>`
      select direction from vela_swipes where from_user = ${context.userId} and to_user = ${toUser}
    `;
    if (existing[0]) return { status: "skip" as const, snapshot: await snapshot(sql, context.userId) };
    const me = await sql<{ plus: boolean | string }>`
      select plus from vela_profiles where user_id = ${context.userId}
    `;
    const plus = me[0] ? asBool(me[0].plus) : false;
    if (!plus) {
      const usedRows = await sql<{ n: number }>`
        select count(*) as n from vela_swipes where from_user = ${context.userId} and day = ${day}
      `;
      if (Number(usedRows[0]?.n ?? 0) >= FREE_SWIPES) {
        return { status: "limit" as const, snapshot: await snapshot(sql, context.userId) };
      }
    }
    if (direction === "spark") {
      const prompts = asPrompts(target[0].prompts);
      if (!prompts.some((prompt) => prompt.id === promptId)) {
        return { status: "skip" as const, snapshot: await snapshot(sql, context.userId) };
      }
    }
    await sql`
      insert into vela_swipes (from_user, to_user, direction, prompt_id, note, day)
      values (
        ${context.userId},
        ${toUser},
        ${direction},
        ${direction === "spark" ? promptId : null},
        ${direction === "spark" ? note : ""},
        ${day}
      )
    `;
    if (direction === "spark" && note && !(await messageLimitHit(sql, context.userId))) {
      const [pairA, pairB] = pairOf(context.userId, toUser);
      await sql`
        insert into vela_messages (id, pair_a, pair_b, from_user, body, kind)
        values (${crypto.randomUUID()}, ${pairA}, ${pairB}, ${context.userId}, ${note}, 'note')
      `;
    }
    let status: "match" | "sent" | "ok" = direction === "pass" ? "ok" : "sent";
    if (direction === "spark") {
      const back = await sql`
        select 1 from vela_swipes
        where from_user = ${toUser} and to_user = ${context.userId} and direction = 'spark'
      `;
      if (back.length > 0) status = "match";
    }
    return { status, snapshot: await snapshot(sql, context.userId) };
  });

export const undoPass = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await sql<{ plus: boolean | string }>`
      select plus from vela_profiles where user_id = ${context.userId}
    `;
    if (!me[0] || !asBool(me[0].plus)) {
      return { ok: false, snapshot: await snapshot(sql, context.userId) };
    }
    const last = await sql<{ to_user: string }>`
      select to_user from vela_swipes
      where from_user = ${context.userId} and direction = 'pass'
      order by created_at desc
      limit 1
    `;
    if (last[0]) {
      await sql`
        delete from vela_swipes
        where from_user = ${context.userId} and to_user = ${last[0].to_user} and direction = 'pass'
      `;
    }
    return { ok: Boolean(last[0]), id: last[0]?.to_user ?? null, snapshot: await snapshot(sql, context.userId) };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { toUser?: string; text?: string }) => input)
  .handler(async ({ context, data }) => {
    const toUser = String(data?.toUser ?? "");
    const text = String(data?.text ?? "").trim().slice(0, 500);
    const sql = await getSql();
    if (!toUser || !text || toUser === context.userId) {
      return { error: "Leer.", snapshot: await snapshot(sql, context.userId) };
    }
    if (text.replace(/\s/g, "").length < 2) {
      return { error: "Ein bisschen mehr, bitte.", snapshot: await snapshot(sql, context.userId) };
    }
    const mutual = await sql`
      select 1 from vela_swipes mine
      join vela_swipes theirs
        on theirs.from_user = mine.to_user
       and theirs.to_user = mine.from_user
       and theirs.direction = 'spark'
      where mine.from_user = ${context.userId}
        and mine.to_user = ${toUser}
        and mine.direction = 'spark'
    `;
    if (mutual.length === 0) {
      return { error: "Noch kein Gespräch.", snapshot: await snapshot(sql, context.userId) };
    }
    if (!(await canInteract(sql, context.userId, toUser))) {
      return { error: "Dieses Gespräch ist beendet.", snapshot: await snapshot(sql, context.userId) };
    }
    if (await messageLimitHit(sql, context.userId)) {
      return { error: "Kurz durchatmen. Gleich geht es weiter.", snapshot: await snapshot(sql, context.userId) };
    }
    const [pairA, pairB] = pairOf(context.userId, toUser);
    await sql`
      insert into vela_messages (id, pair_a, pair_b, from_user, body, kind)
      values (${crypto.randomUUID()}, ${pairA}, ${pairB}, ${context.userId}, ${text}, 'message')
    `;
    return { error: null, snapshot: await snapshot(sql, context.userId) };
  });

export const setPlus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    // No checkout yet: Plus can only be switched on in the workspace preview.
    if (!(await plusAvailable())) {
      return { error: "Plus kommt bald.", snapshot: await snapshot(sql, context.userId) };
    }
    await sql`update vela_profiles set plus = true where user_id = ${context.userId}`;
    return { error: null, snapshot: await snapshot(sql, context.userId) };
  });

/** VELA+: start Stripe Checkout (card, Apple Pay, Google Pay). Returns the URL to open. */
export const startPlusCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ url: string | null; error: string | null }> => {
    const stripe = await billingServer();
    if (!stripe.stripeConfigured()) return { url: null, error: "Zahlungen sind noch nicht eingerichtet." };
    const sql = await getSql();
    if ((await statusOf(sql, context.userId)) !== "active") return { url: null, error: "Das geht gerade nicht." };
    const profile = await sql`select 1 from vela_profiles where user_id = ${context.userId}`;
    if (profile.length === 0) return { url: null, error: "Leg zuerst dein Profil an." };
    const current = await stripe.billingOf(sql, context.userId);
    if (current && stripe.isActiveStatus(current.status)) return { url: null, error: "Vela+ ist schon aktiv." };
    const users = await sql<{ email: string | null }>`select email from "user" where id = ${context.userId}`;
    try {
      const url = await stripe.createCheckout(
        sql,
        { id: context.userId, email: users[0]?.email ?? null },
        await appOrigin(),
      );
      return { url, error: null };
    } catch {
      return { url: null, error: "Die Bezahlseite ließ sich nicht öffnen. Versuch es gleich nochmal." };
    }
  });

/** VELA+: Stripe billing portal to cancel, change the payment method or get invoices. */
export const openPlusPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ url: string | null; error: string | null }> => {
    const stripe = await billingServer();
    if (!stripe.stripeConfigured()) return { url: null, error: "Zahlungen sind noch nicht eingerichtet." };
    const sql = await getSql();
    const current = await stripe.billingOf(sql, context.userId);
    if (!current?.stripe_customer_id) return { url: null, error: "Du hast noch kein Abo." };
    try {
      return { url: await stripe.createPortal(current.stripe_customer_id, await appOrigin()), error: null };
    } catch {
      return { url: null, error: "Die Abo-Verwaltung ließ sich nicht öffnen. Versuch es gleich nochmal." };
    }
  });

async function insertBlock(sql: Sql, from: string, to: string) {
  await sql`
    insert into vela_blocks (from_user, to_user) values (${from}, ${to})
    on conflict (from_user, to_user) do nothing
  `;
}

export const blockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { toUser?: string }) => input)
  .handler(async ({ context, data }) => {
    const toUser = String(data?.toUser ?? "");
    const sql = await getSql();
    if (!toUser || toUser === context.userId) {
      return { error: "Das geht nicht.", snapshot: await snapshot(sql, context.userId) };
    }
    await insertBlock(sql, context.userId, toUser);
    return { error: null, snapshot: await snapshot(sql, context.userId) };
  });

export const reportUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { toUser?: string; reason?: string; details?: string }) => input)
  .handler(async ({ context, data }) => {
    const toUser = String(data?.toUser ?? "");
    const reason = String(data?.reason ?? "");
    const details = String(data?.details ?? "").trim().slice(0, 1000);
    const sql = await getSql();
    if (!toUser || toUser === context.userId) {
      return { error: "Das geht nicht.", snapshot: await snapshot(sql, context.userId) };
    }
    if (!REASON_IDS.has(reason)) {
      return { error: "Wähl einen Grund.", snapshot: await snapshot(sql, context.userId) };
    }
    // One report per person is enough (it already blocks), and a daily cap
    // keeps mass false reports from flooding the operator's review queue.
    const already = await sql`
      select 1 from vela_reports where from_user = ${context.userId} and to_user = ${toUser} limit 1
    `;
    if (already.length > 0) {
      await insertBlock(sql, context.userId, toUser);
      return { error: null, snapshot: await snapshot(sql, context.userId) };
    }
    const recent = await sql<{ n: number | string }>`
      select count(*) as n from vela_reports
      where from_user = ${context.userId} and created_at > now() - interval '1 day'
    `;
    if (Number(recent[0]?.n ?? 0) >= REPORTS_PER_DAY) {
      // Still block, so the person is out of sight; just no new report row.
      await insertBlock(sql, context.userId, toUser);
      return {
        error: "Du hast heute schon viele Meldungen geschickt. Die Person ist blockiert, wir schauen uns die bisherigen an.",
        snapshot: await snapshot(sql, context.userId),
      };
    }
    await sql`
      insert into vela_reports (id, from_user, to_user, reason, details)
      values (${crypto.randomUUID()}, ${context.userId}, ${toUser}, ${reason}, ${details})
    `;
    // Reporting always blocks, so the reporter never sees this person again.
    await insertBlock(sql, context.userId, toUser);
    if (reason === "minor" && !(await ageVerified(sql, toUser))) {
      // No automatic action: the operator reviews it on /admin/age.
      await (await ageReview()).recordFlag(sql, toUser, "report", "review", ["Gemeldet: Minderjährig"]);
    }
    return { error: null, snapshot: await snapshot(sql, context.userId) };
  });

export const deleteProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const id = context.userId;
    // A running VELA+ subscription must not keep billing a deleted account:
    // cancel it at Stripe first; if that fails, stop before deleting anything.
    const stripe = await billingServer();
    const billing = await stripe.billingOf(sql, id);
    if (billing?.stripe_subscription_id && billing.status !== "canceled" && billing.status !== "incomplete_expired") {
      try {
        await stripe.cancelNow(billing.stripe_subscription_id);
      } catch (err) {
        const gone = err instanceof Error && /No such subscription|canceled/i.test(err.message);
        if (!gone) {
          throw new Error(
            "Dein VELA+ Abo ließ sich gerade nicht beenden. Kündige es unter „Abo verwalten“ und lösch dein Konto dann nochmal.",
          );
        }
      }
    }
    await sql`delete from vela_subscriptions where user_id = ${id}`;
    // An open age suspension must not be dodged by deleting and signing in
    // again: keep only a keyed hash of the login identity (max. 12 months).
    if (await openAgeSuspension(sql, id)) await (await ageReview()).rememberSuspendedIdentity(sql, id);
    await sql`delete from vela_messages where pair_a = ${id} or pair_b = ${id}`;
    await sql`delete from vela_swipes where from_user = ${id} or to_user = ${id}`;
    await sql`delete from vela_blocks where from_user = ${id} or to_user = ${id}`;
    await sql`
      update vela_id_checks
      set image = null, status = case when status = 'pending' then 'expired' else status end
      where user_id = ${id} and image is not null
    `;
    await sql`delete from vela_profiles where user_id = ${id}`;
    // DSGVO Art. 17: also delete the login itself. End the session first so its
    // cookies are cleared in this response, then the user row (sessions and
    // linked accounts go with it via ON DELETE CASCADE). Reports stay for up to
    // 12 months (see Datenschutz), keyed only by the now orphaned id.
    try {
      const { auth } = await import("@/lib/auth/server");
      const { getRequest } = await import("@tanstack/react-start/server");
      const headers = new Headers(getRequest()?.headers);
      const bearer = (context as { bearerToken?: string }).bearerToken;
      if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
      await auth.api.signOut({ headers });
    } catch {
      /* no session to end (e.g. auth off) — the row deletes below still apply */
    }
    await sql`delete from "session" where "userId" = ${id}`;
    await sql`delete from "account" where "userId" = ${id}`;
    await sql`delete from "user" where id = ${id}`;
    return emptySnapshot();
  });

/**
 * DSGVO Art. 15/20: everything VELA stores about the signed-in person, as JSON.
 * Only their own data: received swipes and reports filed against them are left
 * out (they would reveal other people), messages are the ones they sent.
 * No password hash, session tokens or ID images.
 */
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const id = context.userId;
    const safe = async <T>(query: () => Promise<T[]>): Promise<T[]> => {
      try {
        return await query();
      } catch {
        return [];
      }
    };
    const [user] = await safe(
      () =>
        sql`select id, name, email, "emailVerified", "createdAt", "updatedAt" from "user" where id = ${id}`,
    );
    const [profile] = await sql`
      select name, age, city, orbit, values, prompts, photo, plus, status, suspended_at, adult_confirmed_at, created_at
      from vela_profiles where user_id = ${id}
    `;
    const swipes = await sql`
      select to_user, direction, prompt_id, note, day, created_at
      from vela_swipes where from_user = ${id} order by created_at
    `;
    const messages = await sql`
      select case when pair_a = ${id} then pair_b else pair_a end as to_user, body, created_at
      from vela_messages where from_user = ${id} order by created_at
    `;
    const blocks =
      await sql`select to_user, created_at from vela_blocks where from_user = ${id} order by created_at`;
    const reports = await sql`
      select to_user, reason, details, created_at from vela_reports where from_user = ${id} order by created_at
    `;
    const subscription = await safe(
      () => sql`
        select status, current_period_end, cancel_at_period_end, updated_at
        from vela_subscriptions where user_id = ${id}
      `,
    );
    const ageChecks = await safe(
      () =>
        sql`select source, action, created_at from vela_age_flags where user_id = ${id} order by created_at`,
    );
    const idChecks = await safe(
      () =>
        sql`select status, created_at, decided_at from vela_id_checks where user_id = ${id} order by created_at`,
    );
    const sessions = await safe(
      () => sql`
        select "createdAt", "expiresAt", "ipAddress", "userAgent" from "session" where "userId" = ${id} order by "createdAt"
      `,
    );
    // As a JSON string: DB rows are untyped, and dates serialize to ISO this way.
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        note: "Datenexport nach Art. 15 und 20 DSGVO. Andere Personen erscheinen nur als ID.",
        account: user ?? { id },
        profile: profile ?? null,
        swipesGiven: swipes,
        messagesSent: messages,
        blocks,
        reportsFiled: reports,
        subscription: subscription[0] ?? null,
        ageReview: ageChecks,
        idChecks,
        sessions,
      },
      null,
      2,
    );
  });

/** Max decoded size of an ID image (after client-side re-encode to JPEG). */
const ID_MAX_BYTES = 1_500_000;

/**
 * Upload an ID document to lift an age suspension. Only for suspended people,
 * one pending check at a time. Stored privately in the database (never a URL),
 * visible only to the operator, deleted once they decide or after 30 days.
 */
export const uploadIdDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { image?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if ((await statusOf(sql, context.userId)) === "active") {
      return { error: "Dein Konto ist nicht gesperrt.", snapshot: await snapshot(sql, context.userId) };
    }
    const image = String(data?.image ?? "");
    const prefix = "data:image/jpeg;base64,";
    if (!image.startsWith(prefix)) {
      return { error: "Bitte ein Foto deines Ausweises (JPEG).", snapshot: await snapshot(sql, context.userId) };
    }
    const base64 = image.slice(prefix.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      return { error: "Das Bild ist beschädigt.", snapshot: await snapshot(sql, context.userId) };
    }
    const bytes = Buffer.from(base64, "base64");
    // JPEG magic bytes — the client re-encodes every upload through a canvas.
    if (bytes.length > ID_MAX_BYTES || bytes.length < 1000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      return { error: "Das Bild ist zu groß oder kein JPEG.", snapshot: await snapshot(sql, context.userId) };
    }
    const pending = await sql`
      select 1 from vela_id_checks where user_id = ${context.userId} and status = 'pending' limit 1
    `;
    if (pending.length > 0) {
      return { error: "Dein Ausweis wird schon geprüft.", snapshot: await snapshot(sql, context.userId) };
    }
    await sql`
      insert into vela_id_checks (id, user_id, image, status)
      values (${crypto.randomUUID()}, ${context.userId}, ${bytes.toString("base64")}, 'pending')
    `;
    return { error: null, snapshot: await snapshot(sql, context.userId) };
  });
