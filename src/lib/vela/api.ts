import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  FREE_SWIPES,
  ORBITS,
  PROMPT_BANK,
  VALUES,
  VEIL_AFTER,
  type Me,
  type Message,
  type Orbit,
  type Person,
  type Prompt,
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
  sparked_you?: boolean | string;
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
  };
}

function pairOf(a: string, b: string) {
  return a < b ? [a, b] : [b, a];
}

function stamp(value: unknown) {
  const at = new Date(value as string | number | Date).getTime();
  return Number.isFinite(at) ? at : Date.now();
}

async function snapshot(sql: Sql, userId: string): Promise<Snapshot> {
  const day = berlinDay();
  const mine = await sql<ProfileRow>`
    select user_id, name, age, city, orbit, values, prompts, photo, plus
    from vela_profiles where user_id = ${userId}
  `;
  const meRow = mine[0];
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
    select count(*) as n from vela_profiles where user_id <> ${userId}
  `;
  const deckRows = await sql<ProfileRow>`
    select p.user_id, p.name, p.age, p.city, p.orbit, p.values, p.prompts, p.photo, p.plus,
      exists (
        select 1 from vela_swipes s
        where s.from_user = p.user_id and s.to_user = ${userId} and s.direction = 'spark'
      ) as sparked_you
    from vela_profiles p
    where p.user_id <> ${userId}
      and not exists (
        select 1 from vela_swipes s where s.from_user = ${userId} and s.to_user = p.user_id
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
    order by mine.created_at desc
  `;
  const messageRows = await sql<{
    id: string;
    pair_a: string;
    pair_b: string;
    from_user: string;
    body: string;
    created_at: unknown;
  }>`
    select id, pair_a, pair_b, from_user, body, created_at
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
        from: message.from_user === userId ? "me" : "them",
        text: message.body,
        at: stamp(message.created_at),
      }));
    const mineCount = messages.filter((message) => message.from === "me").length;
    const unveiled = mineCount >= VEIL_AFTER;
    return {
      person: toPerson(row, true),
      photo: unveiled ? row.photo : null,
      unveiled,
      messages,
    };
  });

  return {
    me: meRow ? toMe(meRow) : null,
    plus,
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
    },
  };
}

export const loadVela = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
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
    await sql.query(
      `insert into vela_profiles (user_id, name, age, city, orbit, values, prompts, photo)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
       on conflict (user_id) do update set
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
      ],
    );
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
    if (direction === "spark" && note) {
      const [pairA, pairB] = pairOf(context.userId, toUser);
      await sql`
        insert into vela_messages (id, pair_a, pair_b, from_user, body)
        values (${crypto.randomUUID()}, ${pairA}, ${pairB}, ${context.userId}, ${note})
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
    const [pairA, pairB] = pairOf(context.userId, toUser);
    await sql`
      insert into vela_messages (id, pair_a, pair_b, from_user, body)
      values (${crypto.randomUUID()}, ${pairA}, ${pairB}, ${context.userId}, ${text})
    `;
    return { error: null, snapshot: await snapshot(sql, context.userId) };
  });

export const setPlus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`update vela_profiles set plus = true where user_id = ${context.userId}`;
    return snapshot(sql, context.userId);
  });

export const deleteProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const id = context.userId;
    await sql`delete from vela_messages where pair_a = ${id} or pair_b = ${id}`;
    await sql`delete from vela_swipes where from_user = ${id} or to_user = ${id}`;
    await sql`delete from vela_profiles where user_id = ${id}`;
    return snapshot(sql, context.userId);
  });
