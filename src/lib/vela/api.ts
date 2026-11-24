import { createServerFn } from "@tanstack/react-start";
import { FILTER_MESSAGE, isObjectionable, stripInvisible } from "./content-filter";
import { cleanJpegDataUrl, stripJpegMetadata } from "./jpeg";
import { getSql, withTransaction, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { errorMonitor } from "@/lib/vela/error-monitor";
import { userFacingError } from "@/lib/vela/user-facing-error";
import {
  FREE_SWIPES,
  SWIPE_CAPS,
  swipeCapHit,
  emptySnapshot,
  ORBITS,
  PROMPT_BANK,
  REPORT_REASONS,
  VALUES,
  isUnveiled,
  CHAT_HISTORY_LIMIT,
  OLDER_PAGE_SIZE,
  olderPageStart,
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

/** At most this many waiting sparks are sent as people (VELA+); the count covers all. */
const INBOUND_LIMIT = 40;
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
  if (!isWorkspacePreview()) return false;
  // Belt and braces: the free test switch must never work on a real deployment,
  // even if VELA_SELF_HOSTED was forgotten there. Real billing (Stripe) or a
  // Vercel production build means Plus is only available by paying.
  if (process.env.VERCEL_ENV === "production") return false;
  if ((await billingServer()).stripeConfigured()) return false;
  return true;
}

function billingServer() {
  // Server-only module (Stripe key), loaded lazily so it never reaches the client bundle.
  return import("@/lib/vela/stripe.server");
}

/** Records a swallowed server error on /admin/age (lazy: server-only module). */
async function recordServerError(source: string, err: unknown) {
  const monitor = await import("@/lib/vela/server-errors.server");
  await monitor.recordServerError(source, err);
}

async function billingSnapshot(sql: Sql, userId: string): Promise<Billing> {
  const stripe = await billingServer();
  const row = await stripe.billingOf(sql, userId);
  const end = row?.current_period_end ? new Date(row.current_period_end).getTime() : null;
  const { storeRowActive } = await import("@/lib/vela/store-entitlement");
  const purchase = await stripe.storePurchaseOf(sql, userId);
  const storeActive = storeRowActive(purchase);
  const storeEnd = purchase?.expires_at ? new Date(purchase.expires_at).getTime() : null;
  return {
    configured: stripe.stripeConfigured(),
    customer: Boolean(row?.stripe_customer_id),
    status: row?.status ?? null,
    periodEnd: end && Number.isFinite(end) ? end : null,
    cancelAtPeriodEnd: row ? asBool(row.cancel_at_period_end) : false,
    store:
      storeActive && (purchase?.store === "app_store" || purchase?.store === "play_store") ? purchase.store : null,
    storeUntil: storeActive && storeEnd && Number.isFinite(storeEnd) ? storeEnd : null,
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
/** Profile saves (incl. photo uploads) per person: 30 per hour. */
const PROFILE_SAVE_RULE = { windowSec: 3600, max: 30 };
/** ID-document uploads per person: 5 per hour (up to ~1.5 MB each). */
const ID_UPLOAD_RULE = { windowSec: 3600, max: 5 };
/** Self-service data export (Art. 15/20): 10 per hour. */
const DATA_EXPORT_RULE = { windowSec: 3600, max: 10 };
/** Stripe Checkout / Customer Portal session creation: 10 per hour. */
const STRIPE_SESSION_RULE = { windowSec: 3600, max: 10 };
/** Blocks per person: 60 per hour (real use is fine; stops scripts flooding vela_blocks). */
const BLOCK_RULE = { windowSec: 3600, max: 60 };
/** "Ältere Nachrichten laden" per person: 30 pages a minute (3000 messages). */
const OLDER_MESSAGES_RULE = { windowSec: 60, max: 30 };
/**
 * Atomic burst guards on the rateLimit table. The count queries on
 * vela_messages / vela_reports / vela_swipes read-then-insert, so parallel
 * requests could all pass them; these single-statement counters cannot be
 * overtaken. Swipe hard caps match SWIPE_CAPS; the free daily allowance
 * stays a row count so an undo still gives that swipe back.
 */
const MESSAGE_BURST_RULE = { windowSec: 60, max: MESSAGE_LIMITS.perMinute };
const REPORT_BURST_RULE = { windowSec: 86400, max: REPORTS_PER_DAY };
const SWIPE_MINUTE_RULE = { windowSec: 60, max: SWIPE_CAPS.perMinute };
const SWIPE_DAY_RULE = { windowSec: 86400, max: SWIPE_CAPS.perDay };
// A resent identical message within this window is treated as already sent.
const DUPLICATE_MESSAGE_SECONDS = 10;

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

/**
 * Rejects actions by suspended people and toward suspended/blocked people.
 * Also by people without a profile yet: they haven't confirmed they're 18+
 * and a remembered ban/age suspension is only applied on their first save.
 */
async function canInteract(sql: Sql, me: string, other: string) {
  const mine = await sql<{ status: string }>`select status from vela_profiles where user_id = ${me}`;
  if (mine[0]?.status !== "active") return false;
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

async function suspensionSnapshot(sql: Sql, userId: string, profileStatus: string): Promise<Snapshot> {
  if (profileStatus === "banned") return { ...emptySnapshot(), suspension: { reason: "ban", idCheck: "none" } };
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

/**
 * Photo of a match whose veil has lifted; callers check isUnveiled first.
 * `key` is an md5 fingerprint of the portrait. When the client already shows
 * the photo with that fingerprint (knownKey), the photo itself is left out, so
 * chat polling doesn't resend up to ~120 KB per unveiled match every 8 s.
 */
async function unveiledPhoto(
  sql: Sql,
  userId: string,
  knownKey = "",
): Promise<{ photo: string | null; key: string | null }> {
  const rows = await sql<{ photo: string | null; key: string | null }>`
    select md5(photo) as key,
      case when md5(photo) = ${knownKey} then null else photo end as photo
    from vela_profiles where user_id = ${userId} and status = 'active'
  `;
  return { photo: rows[0]?.photo ?? null, key: rows[0]?.key ?? null };
}

/** Photo fingerprints the client already has, by person id (from syncVela). */
type KnownPhotos = Record<string, string>;

/** Accepts at most 200 well-formed entries; anything else is ignored. */
function cleanKnownPhotos(input: unknown): KnownPhotos {
  const known: KnownPhotos = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return known;
  for (const [id, key] of Object.entries(input as Record<string, unknown>).slice(0, 200)) {
    if (id.length <= 64 && typeof key === "string" && /^[0-9a-f]{32}$/.test(key)) known[id] = key;
  }
  return known;
}

/**
 * Messages the client already holds per match, by person id (from syncVela):
 * how many (n) and the id of the last one. Messages are only ever appended
 * (they are deleted only with the whole conversation), so a poll can skip the
 * first n - 1 and check that the next one is still `last` before trusting it.
 */
type KnownMessages = Record<string, { n: number; last: string }>;

/** Accepts at most 200 well-formed "n:lastId" entries; anything else is ignored. */
function cleanKnownMessages(input: unknown): KnownMessages {
  const known: KnownMessages = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return known;
  for (const [id, value] of Object.entries(input as Record<string, unknown>).slice(0, 200)) {
    if (id.length > 64 || typeof value !== "string") continue;
    const match = /^([1-9][0-9]{0,6}):([A-Za-z0-9_-]{1,64})$/.exec(value);
    if (match) known[id] = { n: Number(match[1]), last: match[2] };
  }
  return known;
}

type SnapshotOptions = {
  /** Background poll: leave out my own portrait (the client keeps it) and known match photos. */
  poll?: boolean;
  known?: KnownPhotos;
  /** Background poll: send only messages after the ones the client already has. */
  knownMessages?: KnownMessages;
};

async function snapshot(sql: Sql, userId: string, options: SnapshotOptions = {}): Promise<Snapshot> {
  const day = berlinDay();
  const mine = await sql<ProfileRow>`
    select user_id, name, age, city, orbit, values, prompts,
      case when ${options.poll ? "1" : "0"} = '1' then null else photo end as photo,
      plus, status, adult_confirmed_at
    from vela_profiles where user_id = ${userId}
  `;
  const meRow = mine[0];
  // Suspended people see only the suspension screen — nothing about others.
  if (meRow && meRow.status && meRow.status !== "active") return suspensionSnapshot(sql, userId, meRow.status);
  // No profile yet (onboarding): nothing about other people. Only after the
  // first save is 18+ confirmed and a remembered ban/age suspension applied,
  // so a fresh login must not browse the deck before that.
  if (!meRow) {
    return { ...emptySnapshot(), plusAvailable: await plusAvailable(), billing: await billingSnapshot(sql, userId) };
  }
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
  // No photo column here on purpose: Person has none, and the veil never opens
  // in the deck. Loading JPEG blobs for 40 cards would waste memory and risk a
  // future regression that ships them to the client.
  const deckRows = await sql<ProfileRow>`
    select p.user_id, p.name, p.age, p.city, p.orbit, p.values, p.prompts, p.plus,
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
  // "Wartet schon": everyone who sparked me and is still waiting for my answer,
  // counted over all of them, not just those among the 40 newest deck cards
  // (with more than 40 newer profiles, older sparks used to vanish from the
  // count and from the VELA+ list). Same filters as the deck: active, not yet
  // swiped by me, no block either way. Uses vela_swipes_to_idx.
  const inboundRows = await sql<ProfileRow & { total: number | string }>`
    select p.user_id, p.name, p.age, p.city, p.orbit, p.values, p.prompts, p.plus,
      count(*) over () as total
    from vela_swipes s
    join vela_profiles p on p.user_id = s.from_user
    where s.to_user = ${userId} and s.direction = 'spark'
      and p.user_id <> ${userId}
      and p.status = 'active'
      and not exists (
        select 1 from vela_swipes mine where mine.from_user = ${userId} and mine.to_user = p.user_id
      )
      and not exists (
        select 1 from vela_blocks b
        where (b.from_user = ${userId} and b.to_user = p.user_id)
           or (b.from_user = p.user_id and b.to_user = ${userId})
      )
    order by s.created_at desc
    limit ${INBOUND_LIMIT}::int
  `;
  // No photo column here either: photos of matches are loaded below, one by one,
  // only for matches whose veil has actually lifted, so a veiled photo is never
  // even read from the database for this request.
  const matchRows = await sql<ProfileRow>`
    select p.user_id, p.name, p.age, p.city, p.orbit, p.values, p.prompts, p.plus
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
  const threads: Thread[] = (await Promise.all(matchRows.map(async (row) => {
    const [pairA, pairB] = pairOf(userId, row.user_id);
    // One indexed query per active match (vela_messages_pair_idx on
    // pair_a, pair_b, created_at). Never "pair_a = me or pair_b = me": that
    // can't use the index for the pair_b side (full scan on every poll) and
    // would also load conversations with blocked or suspended people.
    // On a poll where the client already holds n messages ending in `last`,
    // only the messages after those are sent. Never more than the last
    // CHAT_HISTORY_LIMIT, so a long chat doesn't ship its whole history on
    // every app start. The veil counts come from window functions over the
    // whole conversation (computed before the row filter), so they stay exact
    // even when only the tail is returned.
    const loadMessages = (after: number) => sql<{
      id: string;
      from_user: string;
      body: string;
      kind: string;
      created_at: unknown;
      rn: unknown;
      mine_total: unknown;
      their_total: unknown;
    }>`
      select id, from_user, body, kind, created_at, rn, mine_total, their_total
      from (
        select id, from_user, body, kind, created_at,
          row_number() over (order by created_at asc, id asc) as rn,
          count(*) over () as total,
          count(*) filter (where kind = 'message' and from_user = ${userId}) over () as mine_total,
          count(*) filter (where kind = 'message' and from_user <> ${userId}) over () as their_total
        from vela_messages
        where pair_a = ${pairA} and pair_b = ${pairB}
      ) conversation
      where rn > greatest(${after}::int, total - ${CHAT_HISTORY_LIMIT}::int)
      order by rn asc
    `;
    const held = options.knownMessages?.[row.user_id];
    let messagesFrom = 0;
    let tail = false;
    let messageRows = held ? await loadMessages(held.n - 1) : [];
    if (!held || messageRows[0]?.id !== held.last) {
      // Nothing held, or the client's copy doesn't line up (or is more than
      // CHAT_HISTORY_LIMIT behind): send the latest messages.
      messageRows = await loadMessages(0);
      messagesFrom = messageRows.length > 0 ? Number(messageRows[0].rn) - 1 : 0;
    } else {
      messagesFrom = held.n;
      tail = true;
    }
    // Every row carries the whole-conversation totals; with no messages at all
    // both are zero.
    const mineCount = Number(messageRows[0]?.mine_total ?? 0);
    const theirCount = Number(messageRows[0]?.their_total ?? 0);
    if (tail) messageRows = messageRows.slice(1);
    const messages: Message[] = messageRows
      .map((message) => ({
        id: message.id,
        from: message.from_user === userId ? ("me" as const) : ("them" as const),
        kind: message.kind === "note" ? ("note" as const) : ("message" as const),
        text: message.body,
        at: stamp(message.created_at),
      }));
    // The veil lifts only when BOTH people have each written VEIL_AFTER chat
    // messages in this match. Spark notes never count. Enforced here, server-side:
    // this is the only place other people's photos are selected, and the photo
    // is not even loaded until both sides clear VEIL_AFTER.
    const unveiled = isUnveiled(mineCount, theirCount);
    const shown = unveiled ? await unveiledPhoto(sql, row.user_id, options.known?.[row.user_id]) : null;
    return {
      person: toPerson(row, true),
      photo: shown?.photo ?? null,
      photoKey: shown?.key ?? null,
      unveiled,
      mineCount,
      theirCount,
      messages,
      messagesFrom,
    };
  })));

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
    inboundCount: Number(inboundRows[0]?.total ?? 0),
    threads,
  };
}

function cleanProfile(input: unknown): { me: Me } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Das Profil ist unvollständig." };
  const raw = input as Partial<Me>;
  const name = stripInvisible(String(raw.name ?? "")).trim().replace(/\s+/g, " ");
  const city = stripInvisible(String(raw.city ?? "")).trim().replace(/\s+/g, " ");
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
    const a = stripInvisible(String(row.a ?? "")).trim().replace(/\s+/g, " ");
    if (!/^[a-z0-9-]{1,40}$/.test(id)) return { error: "Die Sätze sind unvollständig." };
    if (!QUESTIONS.has(q)) return { error: "Wähl eine der Fragen." };
    if (a.length < 8 || a.length > 280) return { error: "Zwei echte Sätze. Mindestens ein paar Worte." };
    cleanPrompts.push({ id, q, a });
  }
  if (cleanPrompts[0].q === cleanPrompts[1].q) return { error: "Zwei verschiedene Fragen." };
  if ([name, city, ...cleanPrompts.map((prompt) => prompt.a)].some(isObjectionable)) {
    return { error: FILTER_MESSAGE };
  }
  let photo: string | null = null;
  if (raw.photo) {
    const value = String(raw.photo);
    if (!value.startsWith("data:image/jpeg;base64,") || value.length > 120_000) {
      return { error: "Das Porträt ist zu groß. Ein kleineres Bild bitte." };
    }
    // Checks it is a real JPEG and strips EXIF/GPS and other metadata.
    photo = cleanJpegDataUrl(value, 120_000);
    if (!photo) return { error: "Das Porträt ist beschädigt. Bitte ein anderes Bild." };
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
  .middleware([authMiddleware, errorMonitor])
  .handler(async ({ context }) => {
    const sql = await getSql();
    // Retention fallback on load, at most once per 10 minutes across all
    // instances (daily cron at /api/cron/retention runs the full purge).
    await (await ageReview()).purgeExpiredThrottled(sql);
    return snapshot(sql, context.userId);
  });

/**
 * Light refresh for open sessions (new messages, sparks, matches): same
 * snapshot as loadVela, but without the retention purge, so frequent polling
 * stays cheap.
 */
export const syncVela = createServerFn({ method: "GET" })
  .middleware([authMiddleware, errorMonitor])
  .validator((input: { known?: Record<string, string>; held?: Record<string, string> } | undefined) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    // Polling: me.photo is left out (the client keeps its own portrait from the
    // full load), so is every match photo the client already has, and so are
    // the chat messages it already holds (only new ones are sent).
    return snapshot(sql, context.userId, {
      poll: true,
      known: cleanKnownPhotos(data?.known),
      knownMessages: cleanKnownMessages(data?.held),
    });
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware, errorMonitor])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const parsed = cleanProfile(data);
    if ("error" in parsed) return { error: parsed.error, snapshot: null };
    const sql = await getSql();
    // Photos are stored as data URLs, so endless re-saves would bloat the DB.
    // Counted in the shared rateLimit table so it holds on serverless.
    const { consumeRateLimit } = await import("@/lib/vela/rate-limit.server");
    if (!(await consumeRateLimit(sql, `vela:profile-save:${context.userId}`, PROFILE_SAVE_RULE))) {
      return {
        error: "Du hast dein Profil gerade sehr oft gespeichert. Versuch es in ein paar Minuten noch einmal.",
        snapshot: null,
      };
    }
    const me = parsed.me;
    const review = await ageReview();
    // A suspended person can't edit their way out, and a deleted + re-created
    // profile starts suspended while an age suspension is still open.
    // Only the insert uses this status; an existing row keeps its own.
    // One transaction under a per-person lock: carryOverSuspension consumes the
    // remembered ban, so a double tap on the first save must not let the second
    // request (which no longer sees it) insert the row as "active" first.
    await withTransaction(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`vela:profile:${context.userId}`}))`;
      const isNew = (await tx`select 1 from vela_profiles where user_id = ${context.userId}`).length === 0;
      const carried = isNew ? await review.carryOverSuspension(tx, context.userId) : null;
      const newStatus =
        carried === "ban"
          ? "banned"
          : carried === "age" || (await openAgeSuspension(tx, context.userId))
            ? "suspended_age"
            : "active";
      await tx.query(
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
          newStatus,
        ],
      );
    });
    // Paid before the profile existed (or re-created it): carry VELA+ over.
    await (await billingServer()).syncPlus(sql, context.userId);
    return { error: null, snapshot: await snapshot(sql, context.userId) };
  });

export const swipe = createServerFn({ method: "POST" })
  .middleware([authMiddleware, errorMonitor])
  .validator(
    (input: {
      toUser?: string;
      direction?: string;
      promptId?: string;
      note?: string;
      known?: Record<string, string>;
      held?: Record<string, string>;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const toUser = String(data?.toUser ?? "");
    const direction = data?.direction === "spark" ? "spark" : data?.direction === "pass" ? "pass" : "";
    const note = stripInvisible(String(data?.note ?? "")).trim().slice(0, 240);
    const promptId = String(data?.promptId ?? "");
    const sql = await getSql();
    // Answer like a poll (deck stays complete): the app keeps its own portrait
    // and the photos/messages it already holds, so a swipe stays small.
    const reply = () =>
      snapshot(sql, context.userId, {
        poll: true,
        known: cleanKnownPhotos(data?.known),
        knownMessages: cleanKnownMessages(data?.held),
      });
    if (direction === "spark" && note && isObjectionable(note)) {
      return { status: "filtered" as const, snapshot: await reply() };
    }
    if (!toUser || toUser === context.userId || !direction) {
      return { status: "skip" as const, snapshot: await reply() };
    }
    const day = berlinDay();
    // Prompts only — never pull the portrait for a swipe (veil stays closed).
    const target = await sql<ProfileRow>`
      select user_id, name, age, city, orbit, values, prompts, plus
      from vela_profiles where user_id = ${toUser}
    `;
    if (!target[0]) return { status: "skip" as const, snapshot: await reply() };
    if (!(await canInteract(sql, context.userId, toUser))) {
      return { status: "skip" as const, snapshot: await reply() };
    }
    const existing = await sql<{ direction: string }>`
      select direction from vela_swipes where from_user = ${context.userId} and to_user = ${toUser}
    `;
    if (existing[0]) return { status: "skip" as const, snapshot: await reply() };
    const caps = await sql<{ minute: number | string; today: number | string }>`
      select
        count(*) filter (where created_at > now() - interval '1 minute') as minute,
        count(*) filter (where day = ${day}) as today
      from vela_swipes where from_user = ${context.userId}
    `;
    if (swipeCapHit(Number(caps[0]?.minute ?? 0), Number(caps[0]?.today ?? 0))) {
      return { status: "skip" as const, snapshot: await reply() };
    }
    if (direction === "spark") {
      const prompts = asPrompts(target[0].prompts);
      if (!prompts.some((prompt) => prompt.id === promptId)) {
        return { status: "skip" as const, snapshot: await reply() };
      }
    }
    // The free daily allowance, the burst counters and the insert run in one
    // transaction under a per-swiper advisory lock, so parallel swipes can't
    // slip past the free limit (count-then-insert race) or the ceilings. The
    // allowance stays a row count so undo still gives a swipe back. A double
    // tap on the same person is settled by the primary key (from_user, to_user):
    // the loser is a quiet skip, never a server error or a second note.
    const { consumeRateLimit } = await import("@/lib/vela/rate-limit.server");
    const outcome = await withTransaction(async (tx): Promise<"limit" | "skip" | "inserted"> => {
      await tx`select pg_advisory_xact_lock(hashtext(${`vela:swipe:${context.userId}`}))`;
      // Re-check under the pair lock (insertBlock takes it too), so a block or
      // ban that lands while this swipe is in flight always wins: no spark and
      // no match can be stored after it.
      await tx`select pg_advisory_xact_lock(hashtext(${pairLockKey(context.userId, toUser)}))`;
      if (!(await canInteract(tx, context.userId, toUser))) return "skip";
      const me = await tx<{ plus: boolean | string }>`
        select plus from vela_profiles where user_id = ${context.userId}
      `;
      const plus = me[0] ? asBool(me[0].plus) : false;
      if (!plus) {
        const usedRows = await tx<{ n: number | string }>`
          select count(*) as n from vela_swipes where from_user = ${context.userId} and day = ${day}
        `;
        if (Number(usedRows[0]?.n ?? 0) >= FREE_SWIPES) return "limit";
      }
      if (
        !(await consumeRateLimit(tx, `vela:swipe:${context.userId}`, SWIPE_MINUTE_RULE)) ||
        !(await consumeRateLimit(tx, `vela:swipe-day:${context.userId}`, SWIPE_DAY_RULE))
      ) {
        return "skip";
      }
      const inserted = await tx`
        insert into vela_swipes (from_user, to_user, direction, prompt_id, note, day)
        values (
          ${context.userId},
          ${toUser},
          ${direction},
          ${direction === "spark" ? promptId : null},
          ${direction === "spark" ? note : ""},
          ${day}
        )
        on conflict (from_user, to_user) do nothing
        returning 1
      `;
      return inserted.length === 0 ? "skip" : "inserted";
    });
    if (outcome === "limit") {
      return { status: "limit" as const, snapshot: await reply() };
    }
    if (outcome === "skip") {
      return { status: "skip" as const, snapshot: await reply() };
    }
    if (direction === "spark" && note) {
      // The spark note counts toward the message cap, so it takes the same
      // per-sender lock as sendMessage: a note and a parallel message can't
      // both slip past the daily limit.
      const [pairA, pairB] = pairOf(context.userId, toUser);
      await withTransaction(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext(${`vela:message:${context.userId}`}))`;
        // Same pair lock and re-check as sendMessage: a block that landed
        // between the swipe and its note keeps the note out.
        await tx`select pg_advisory_xact_lock(hashtext(${pairLockKey(context.userId, toUser)}))`;
        if (!(await canInteract(tx, context.userId, toUser))) return;
        if (await messageLimitHit(tx, context.userId)) return;
        await tx`
          insert into vela_messages (id, pair_a, pair_b, from_user, body, kind)
          values (${crypto.randomUUID()}, ${pairA}, ${pairB}, ${context.userId}, ${note}, 'note')
        `;
      });
    }
    let status: "match" | "sent" | "ok" = direction === "pass" ? "ok" : "sent";
    if (direction === "spark") {
      const back = await sql`
        select 1 from vela_swipes
        where from_user = ${toUser} and to_user = ${context.userId} and direction = 'spark'
      `;
      if (back.length > 0) status = "match";
    }
    return { status, snapshot: await reply() };
  });

export const undoPass = createServerFn({ method: "POST" })
  .middleware([authMiddleware, errorMonitor])
  .validator((input: { known?: Record<string, string>; held?: Record<string, string> } | undefined) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const reply = () =>
      snapshot(sql, context.userId, {
        poll: true,
        known: cleanKnownPhotos(data?.known),
        knownMessages: cleanKnownMessages(data?.held),
      });
    // Same per-person lock as swipe: an undo and a parallel swipe (or a double
    // tap on "Rückgängig") are serialized, and only the request that actually
    // deleted the pass reports it, so one tap never undoes two passes.
    const undone = await withTransaction(async (tx): Promise<string | null | false> => {
      await tx`select pg_advisory_xact_lock(hashtext(${`vela:swipe:${context.userId}`}))`;
      const me = await tx<{ plus: boolean | string }>`
        select plus from vela_profiles where user_id = ${context.userId}
      `;
      if (!me[0] || !asBool(me[0].plus)) return false;
      const deleted = await tx<{ to_user: string }>`
        delete from vela_swipes
        where from_user = ${context.userId} and direction = 'pass' and to_user = (
          select to_user from vela_swipes
          where from_user = ${context.userId} and direction = 'pass'
          order by created_at desc
          limit 1
        )
        returning to_user
      `;
      return deleted[0]?.to_user ?? null;
    });
    if (undone === false) {
      return { ok: false, snapshot: await reply() };
    }
    return { ok: Boolean(undone), id: undone, snapshot: await reply() };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware, errorMonitor])
  .validator(
    (input: { toUser?: string; text?: string; known?: Record<string, string>; held?: Record<string, string> }) => input,
  )
  .handler(async ({ context, data }) => {
    const toUser = String(data?.toUser ?? "");
    const text = stripInvisible(String(data?.text ?? "")).trim().slice(0, 500);
    const sql = await getSql();
    // Answer like a poll: the app keeps its own portrait and sends what it
    // already holds, so a sent message doesn't pull every unveiled photo again.
    const reply = () =>
      snapshot(sql, context.userId, {
        poll: true,
        known: cleanKnownPhotos(data?.known),
        knownMessages: cleanKnownMessages(data?.held),
      });
    if (!toUser || !text || toUser === context.userId) {
      return { error: "Leer.", snapshot: await reply() };
    }
    if (text.replace(/\s/g, "").length < 2) {
      return { error: "Ein bisschen mehr, bitte.", snapshot: await reply() };
    }
    if (isObjectionable(text)) {
      return { error: FILTER_MESSAGE, snapshot: await reply() };
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
      return { error: "Noch kein Gespräch.", snapshot: await reply() };
    }
    if (!(await canInteract(sql, context.userId, toUser))) {
      return { error: "Dieses Gespräch ist beendet.", snapshot: await reply() };
    }
    // Limit checks, a duplicate check and the insert run in one transaction
    // under a per-sender advisory lock, so parallel requests can't overrun the
    // daily cap, and a resent request (double tap, network retry) with the
    // same text within a few seconds doesn't post the message twice.
    const { consumeRateLimit } = await import("@/lib/vela/rate-limit.server");
    const [pairA, pairB] = pairOf(context.userId, toUser);
    const outcome = await withTransaction(async (tx): Promise<"duplicate" | "limited" | "ended" | "inserted"> => {
      await tx`select pg_advisory_xact_lock(hashtext(${`vela:message:${context.userId}`}))`;
      // Re-check under the pair lock (insertBlock takes it too), so a block
      // that lands while this request is in flight always wins.
      await tx`select pg_advisory_xact_lock(hashtext(${pairLockKey(context.userId, toUser)}))`;
      if (!(await canInteract(tx, context.userId, toUser))) return "ended";
      const same = await tx`
        select 1 from vela_messages
        where pair_a = ${pairA} and pair_b = ${pairB} and from_user = ${context.userId}
          and kind = 'message' and body = ${text}
          and created_at > now() - ${DUPLICATE_MESSAGE_SECONDS}::int * interval '1 second'
        limit 1
      `;
      if (same.length > 0) return "duplicate";
      if (
        (await messageLimitHit(tx, context.userId)) ||
        !(await consumeRateLimit(tx, `vela:message:${context.userId}`, MESSAGE_BURST_RULE))
      ) {
        return "limited";
      }
      await tx`
        insert into vela_messages (id, pair_a, pair_b, from_user, body, kind)
        values (${crypto.randomUUID()}, ${pairA}, ${pairB}, ${context.userId}, ${text}, 'message')
      `;
      return "inserted";
    });
    if (outcome === "limited") {
      return { error: "Kurz durchatmen. Gleich geht es weiter.", snapshot: await reply() };
    }
    if (outcome === "ended") {
      return { error: "Dieses Gespräch ist beendet.", snapshot: await reply() };
    }
    return { error: null, snapshot: await reply() };
  });

/**
 * "Ältere Nachrichten laden": the OLDER_PAGE_SIZE messages before the first one
 * the chat holds (position `before`, whose id is `firstId`). Same rules as the
 * chat in the snapshot: only a mutual match, only while both profiles are
 * active and nobody blocked. Only message rows come back, never photos or
 * veil data (the veil counts stay with the snapshot). If the message at
 * `before` is no longer `firstId`, the chat changed and the app reloads.
 */
export const loadOlderMessages = createServerFn({ method: "POST" })
  .middleware([authMiddleware, errorMonitor])
  .validator((input: { withUser?: string; before?: number; firstId?: string }) => input)
  .handler(async ({ context, data }): Promise<{ error: string | null; stale?: boolean; from: number; messages: Message[] }> => {
    const withUser = String(data?.withUser ?? "");
    const before = Number(data?.before);
    const firstId = String(data?.firstId ?? "");
    if (
      !withUser ||
      withUser.length > 64 ||
      withUser === context.userId ||
      !Number.isInteger(before) ||
      before < 1 ||
      before > 10_000_000 ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(firstId)
    ) {
      return { error: "Leer.", from: 0, messages: [] };
    }
    const sql = await getSql();
    const mutual = await sql`
      select 1 from vela_swipes mine
      join vela_swipes theirs
        on theirs.from_user = mine.to_user
       and theirs.to_user = mine.from_user
       and theirs.direction = 'spark'
      where mine.from_user = ${context.userId}
        and mine.to_user = ${withUser}
        and mine.direction = 'spark'
    `;
    if (mutual.length === 0) return { error: "Noch kein Gespräch.", from: 0, messages: [] };
    if (!(await canInteract(sql, context.userId, withUser))) {
      return { error: "Dieses Gespräch ist beendet.", from: 0, messages: [] };
    }
    const { consumeRateLimit } = await import("@/lib/vela/rate-limit.server");
    if (!(await consumeRateLimit(sql, `vela:older-messages:${context.userId}`, OLDER_MESSAGES_RULE))) {
      return { error: "Kurz durchatmen. Gleich geht es weiter.", from: 0, messages: [] };
    }
    const from = olderPageStart(before);
    const [pairA, pairB] = pairOf(context.userId, withUser);
    // Same order and numbering as the snapshot (rn is 1-based, position rn - 1),
    // plus the first held message to confirm the page lines up with it.
    const rows = await sql<{ id: string; from_user: string; body: string; kind: string; created_at: unknown; rn: unknown }>`
      select id, from_user, body, kind, created_at, rn
      from (
        select id, from_user, body, kind, created_at,
          row_number() over (order by created_at asc, id asc) as rn
        from vela_messages
        where pair_a = ${pairA} and pair_b = ${pairB}
      ) conversation
      where rn > ${from}::int and rn <= ${before + 1}::int
      order by rn asc
      limit ${OLDER_PAGE_SIZE + 1}
    `;
    const anchor = rows[rows.length - 1];
    if (!anchor || Number(anchor.rn) !== before + 1 || anchor.id !== firstId) {
      return { error: null, stale: true, from: 0, messages: [] };
    }
    const messages: Message[] = rows.slice(0, -1).map((message) => ({
      id: message.id,
      from: message.from_user === context.userId ? ("me" as const) : ("them" as const),
      kind: message.kind === "note" ? ("note" as const) : ("message" as const),
      text: message.body,
      at: stamp(message.created_at),
    }));
    return { error: null, from, messages };
  });

export const setPlus = createServerFn({ method: "POST" })
  .middleware([authMiddleware, errorMonitor])
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
  .middleware([authMiddleware, errorMonitor])
  .handler(async ({ context }): Promise<{ url: string | null; error: string | null }> => {
    const sql = await getSql();
    const { consumeRateLimit } = await import("@/lib/vela/rate-limit.server");
    if (!(await consumeRateLimit(sql, `vela:stripe-checkout:${context.userId}`, STRIPE_SESSION_RULE))) {
      return { url: null, error: "Zu viele Bezahlversuche. Versuch es in ein paar Minuten noch einmal." };
    }
    const stripe = await billingServer();
    if (!stripe.stripeConfigured()) return { url: null, error: "Zahlungen sind noch nicht eingerichtet." };
    if ((await statusOf(sql, context.userId)) !== "active") return { url: null, error: "Das geht gerade nicht." };
    const profile = await sql`select 1 from vela_profiles where user_id = ${context.userId}`;
    if (profile.length === 0) return { url: null, error: "Leg zuerst dein Profil an." };
    const current = await stripe.billingOf(sql, context.userId);
    if (current && stripe.isActiveStatus(current.status)) return { url: null, error: "Vela+ ist schon aktiv." };
    // Bought in the iOS/Android app: no second, parallel subscription on the web.
    const { storeRowActive } = await import("@/lib/vela/store-entitlement");
    if (storeRowActive(await stripe.storePurchaseOf(sql, context.userId))) {
      return { url: null, error: "Vela+ ist schon aktiv (in der App gekauft)." };
    }
    const users = await sql<{ email: string | null }>`select email from "user" where id = ${context.userId}`;
    const origin = await appOrigin();
    try {
      // One payment page per person at a time: a double tap or a second tab
      // gets the same open page, so nobody can end up with two subscriptions.
      return await withTransaction(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext(${`vela:checkout:${context.userId}`}))`;
        const reuse = await stripe.reusableCheckout(tx, context.userId);
        if (reuse && "url" in reuse) return { url: reuse.url, error: null };
        if (reuse) return { url: null, error: "Deine Zahlung ist eingegangen, VELA+ wird gerade aktiviert." };
        const url = await stripe.createCheckout(tx, { id: context.userId, email: users[0]?.email ?? null }, origin);
        return { url, error: null };
      });
    } catch (err) {
      await recordServerError("stripe:checkout", err);
      return { url: null, error: "Die Bezahlseite ließ sich nicht öffnen. Versuch es gleich nochmal." };
    }
  });

/** VELA+: Stripe billing portal to cancel, change the payment method or get invoices. */
export const openPlusPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware, errorMonitor])
  .handler(async ({ context }): Promise<{ url: string | null; error: string | null }> => {
    const sql = await getSql();
    const { consumeRateLimit } = await import("@/lib/vela/rate-limit.server");
    if (!(await consumeRateLimit(sql, `vela:stripe-portal:${context.userId}`, STRIPE_SESSION_RULE))) {
      return { url: null, error: "Zu viele Anfragen. Versuch es in ein paar Minuten noch einmal." };
    }
    const stripe = await billingServer();
    if (!stripe.stripeConfigured()) return { url: null, error: "Zahlungen sind noch nicht eingerichtet." };
    const current = await stripe.billingOf(sql, context.userId);
    if (!current?.stripe_customer_id) return { url: null, error: "Du hast noch kein Abo." };
    try {
      return { url: await stripe.createPortal(current.stripe_customer_id, await appOrigin()), error: null };
    } catch (err) {
      await recordServerError("stripe:portal", err);
      return { url: null, error: "Die Abo-Verwaltung ließ sich nicht öffnen. Versuch es gleich nochmal." };
    }
  });

/** Per-pair advisory lock key, shared by blocking and sending a message. */
function pairLockKey(a: string, b: string) {
  const [pairA, pairB] = pairOf(a, b);
  return `vela:pair:${pairA}:${pairB}`;
}

/**
 * Block inside an open transaction, under the pair lock that sendMessage and
 * swipe also take: once it commits, a message or match that was already past
 * its first block check can't land after it. Pair lock is always taken last.
 */
async function blockInTx(tx: Sql, from: string, to: string) {
  await tx`select pg_advisory_xact_lock(hashtext(${pairLockKey(from, to)}))`;
  await tx`
    insert into vela_blocks (from_user, to_user) values (${from}, ${to})
    on conflict (from_user, to_user) do nothing
  `;
}

async function insertBlock(_sql: Sql, from: string, to: string) {
  await withTransaction((tx) => blockInTx(tx, from, to));
}

/** True when the id exists as a Better Auth user row (not self — callers check that). */
async function userExists(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql`select 1 from "user" where id = ${userId} limit 1`;
  return rows.length > 0;
}

export const blockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware, errorMonitor])
  .validator((input: { toUser?: string; known?: Record<string, string>; held?: Record<string, string> }) => input)
  .handler(async ({ context, data }) => {
    const toUser = String(data?.toUser ?? "");
    const sql = await getSql();
    // Light answer like a poll (see swipe): the app keeps what it already has.
    const reply = () =>
      snapshot(sql, context.userId, {
        poll: true,
        known: cleanKnownPhotos(data?.known),
        knownMessages: cleanKnownMessages(data?.held),
      });
    if (!toUser || toUser === context.userId) {
      return { error: "Das geht nicht.", snapshot: await reply() };
    }
    // Soft cap against scripts flooding vela_blocks (shared rateLimit table).
    const { consumeRateLimit } = await import("@/lib/vela/rate-limit.server");
    if (!(await consumeRateLimit(sql, `vela:block:${context.userId}`, BLOCK_RULE))) {
      return {
        error: "Zu viele Blockierungen gerade. Versuch es gleich noch einmal.",
        snapshot: await reply(),
      };
    }
    if (!(await userExists(sql, toUser))) {
      return { error: "Das geht nicht.", snapshot: await reply() };
    }
    await insertBlock(sql, context.userId, toUser);
    return { error: null, snapshot: await reply() };
  });

export const reportUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware, errorMonitor])
  .validator(
    (input: {
      toUser?: string;
      reason?: string;
      details?: string;
      known?: Record<string, string>;
      held?: Record<string, string>;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const toUser = String(data?.toUser ?? "");
    const reason = String(data?.reason ?? "");
    const details = stripInvisible(String(data?.details ?? "")).trim().slice(0, 1000);
    const sql = await getSql();
    // Light answer like a poll (see swipe): the app keeps what it already has.
    const reply = () =>
      snapshot(sql, context.userId, {
        poll: true,
        known: cleanKnownPhotos(data?.known),
        knownMessages: cleanKnownMessages(data?.held),
      });
    if (!toUser || toUser === context.userId || !(await userExists(sql, toUser))) {
      return { error: "Das geht nicht.", snapshot: await reply() };
    }
    if (!REASON_IDS.has(reason)) {
      return { error: "Wähl einen Grund.", snapshot: await reply() };
    }
    // One report per person is enough (it already blocks), and a daily cap
    // keeps mass false reports from flooding the operator's review queue.
    // Check and insert run in one transaction under a per-reporter advisory
    // lock, so a double tap or parallel requests can't slip past either check
    // (two rows for the same person, or more than the daily cap).
    const { consumeRateLimit } = await import("@/lib/vela/rate-limit.server");
    const outcome = await withTransaction(async (tx): Promise<"duplicate" | "capped" | "inserted"> => {
      await tx`select pg_advisory_xact_lock(hashtext(${`vela:report:${context.userId}`}))`;
      const already = await tx`
        select 1 from vela_reports where from_user = ${context.userId} and to_user = ${toUser} limit 1
      `;
      // Reporting always blocks, in the same transaction as the report row, so
      // there is never a report without its block (or a block lost on error).
      // Lock order: reporter lock, then pair lock (same as message/swipe).
      await blockInTx(tx, context.userId, toUser);
      if (already.length > 0) return "duplicate";
      const recent = await tx<{ n: number | string }>`
        select count(*) as n from vela_reports
        where from_user = ${context.userId} and created_at > now() - interval '1 day'
      `;
      if (
        Number(recent[0]?.n ?? 0) >= REPORTS_PER_DAY ||
        !(await consumeRateLimit(tx, `vela:report:${context.userId}`, REPORT_BURST_RULE))
      ) {
        return "capped";
      }
      await tx`
        insert into vela_reports (id, from_user, to_user, reason, details)
        values (${crypto.randomUUID()}, ${context.userId}, ${toUser}, ${reason}, ${details})
      `;
      if (reason === "minor" && !(await ageVerified(tx, toUser))) {
        // No automatic action: the operator reviews it on /admin/age.
        await (await ageReview()).recordFlag(tx, toUser, "report", "review", ["Gemeldet: Minderjährig"]);
      }
      return "inserted";
    });
    if (outcome === "capped") {
      // Still blocked (above), so the person is out of sight; just no new report row.
      return {
        error: "Du hast heute schon viele Meldungen geschickt. Die Person ist blockiert, wir schauen uns die bisherigen an.",
        snapshot: await reply(),
      };
    }
    return { error: null, snapshot: await reply() };
  });

export const deleteProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware, errorMonitor])
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
          await recordServerError("stripe:cancel-on-delete", err);
          throw userFacingError(
            "Dein VELA+ Abo ließ sich gerade nicht beenden. Kündige es unter „Abo verwalten“ und lösch dein Konto dann nochmal.",
          );
        }
      }
    }
    // An open payment page must not turn into a subscription after deletion.
    await stripe.expireOpenCheckout(sql, id);
    // End the session first so its cookies are cleared in this response. If the
    // deletion below fails, the person is only signed out and can try again.
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
    const review = await ageReview();
    // All or nothing: a failure halfway must not leave an account without
    // messages but with a profile, or a deleted login with leftover data.
    await withTransaction(async (tx) => {
      // Same lock as saveProfile, so a parallel first save can't slip in between.
      await tx`select pg_advisory_xact_lock(hashtext(${`vela:profile:${id}`}))`;
      await tx`delete from vela_subscriptions where user_id = ${id}`;
      await tx`delete from vela_store_purchases where user_id = ${id}`;
      await tx`delete from vela_checkout_sessions where user_id = ${id}`;
      // An open age suspension must not be dodged by deleting and signing in
      // again: keep only a keyed hash of the login identity (max. 12 months).
      // Same for a rule ban.
      const banned = (await statusOf(tx, id)) === "banned";
      const ageOpen = await openAgeSuspension(tx, id);
      if (banned) await review.rememberSuspendedIdentity(tx, id, ageOpen ? "ban_age" : "ban");
      else if (ageOpen) await review.rememberSuspendedIdentity(tx, id);
      await tx`delete from vela_messages where pair_a = ${id} or pair_b = ${id}`;
      await tx`delete from vela_swipes where from_user = ${id} or to_user = ${id}`;
      await tx`delete from vela_blocks where from_user = ${id} or to_user = ${id}`;
      await tx`
        update vela_id_checks
        set image = null, status = case when status = 'pending' then 'expired' else status end
        where user_id = ${id} and image is not null
      `;
      await tx`delete from vela_profiles where user_id = ${id}`;
      // DSGVO Art. 17: also delete the login itself (sessions and linked
      // accounts too). Reports stay for up to 12 months (see Datenschutz),
      // keyed only by the now orphaned id.
      await tx`delete from "session" where "userId" = ${id}`;
      await tx`delete from "account" where "userId" = ${id}`;
      await tx`delete from "user" where id = ${id}`;
    });
    return emptySnapshot();
  });

/**
 * DSGVO Art. 15/20: everything VELA stores about the signed-in person, as JSON.
 * Only their own data: received swipes and reports filed against them are left
 * out (they would reveal other people), messages are the ones they sent.
 * No password hash, session tokens or ID images.
 */
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([authMiddleware, errorMonitor])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const id = context.userId;
    const { consumeRateLimit } = await import("@/lib/vela/rate-limit.server");
    if (!(await consumeRateLimit(sql, `vela:data-export:${id}`, DATA_EXPORT_RULE))) {
      throw userFacingError("Du hast gerade schon mehrmals exportiert. Versuch es in ein paar Minuten noch einmal.");
    }
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
    const storePurchase = await safe(
      () => sql`
        select store, product_id, expires_at, active, updated_at
        from vela_store_purchases where user_id = ${id}
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
        appStorePurchase: storePurchase[0] ?? null,
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
  .middleware([authMiddleware, errorMonitor])
  .validator((input: { image?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const status = await statusOf(sql, context.userId);
    if (status === "active") {
      return { error: "Dein Konto ist nicht gesperrt.", snapshot: await snapshot(sql, context.userId) };
    }
    if (status === "banned") {
      return { error: "Diese Sperre lässt sich nicht per Ausweis aufheben.", snapshot: await snapshot(sql, context.userId) };
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
    const raw = Buffer.from(base64, "base64");
    // JPEG magic bytes — the client re-encodes every upload through a canvas.
    if (raw.length > ID_MAX_BYTES || raw.length < 1000 || raw[0] !== 0xff || raw[1] !== 0xd8 || raw[2] !== 0xff) {
      return { error: "Das Bild ist zu groß oder kein JPEG.", snapshot: await snapshot(sql, context.userId) };
    }
    // Same as portraits: strip EXIF/GPS/COM even if a modified client skips
    // the canvas re-encode (IDs are particularly sensitive).
    const clean = stripJpegMetadata(new Uint8Array(raw));
    if (!clean || clean.length > ID_MAX_BYTES || clean.length < 1000) {
      return { error: "Das Bild ist zu groß oder kein JPEG.", snapshot: await snapshot(sql, context.userId) };
    }
    // Pending check, retry cap and insert run in one transaction under a
    // per-person advisory lock, so a double tap or a network retry can't store
    // the same ID photo twice (two pending rows for the operator to review).
    const { consumeRateLimit } = await import("@/lib/vela/rate-limit.server");
    const outcome = await withTransaction(async (tx): Promise<"pending" | "limited" | "inserted"> => {
      await tx`select pg_advisory_xact_lock(hashtext(${`vela:id-upload:${context.userId}`}))`;
      const pending = await tx`
        select 1 from vela_id_checks where user_id = ${context.userId} and status = 'pending' limit 1
      `;
      if (pending.length > 0) return "pending";
      // Cap retries after a rejection so a script cannot fill the DB with ID photos.
      if (!(await consumeRateLimit(tx, `vela:id-upload:${context.userId}`, ID_UPLOAD_RULE))) return "limited";
      await tx`
        insert into vela_id_checks (id, user_id, image, status)
        values (${crypto.randomUUID()}, ${context.userId}, ${Buffer.from(clean).toString("base64")}, 'pending')
      `;
      return "inserted";
    });
    if (outcome === "pending") {
      return { error: "Dein Ausweis wird schon geprüft.", snapshot: await snapshot(sql, context.userId) };
    }
    if (outcome === "limited") {
      return {
        error: "Du hast gerade schon mehrmals einen Ausweis hochgeladen. Versuch es in ein paar Minuten noch einmal.",
        snapshot: await snapshot(sql, context.userId),
      };
    }
    return { error: null, snapshot: await snapshot(sql, context.userId) };
  });
