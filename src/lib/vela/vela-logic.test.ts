// Tests for VELA's core rules that run without a database: the photo veil,
// the public Resonanz formula (README) and the word filter (Apple 1.2).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { swipeCapHit, SWIPE_CAPS, isUnveiled, mergeMessages, resonance, resonanceParts, RESONANCE, VEIL_AFTER, nextQuestion, PROMPT_BANK } from "./data.ts";
import { isObjectionable, normalizeForFilter, stripInvisible } from "./content-filter.ts";
import { checkoutDecision } from "./checkout-reuse.ts";

describe("veil", () => {
  it("stays closed until both people have written enough", () => {
    assert.equal(isUnveiled(0, 0), false);
    assert.equal(isUnveiled(VEIL_AFTER, VEIL_AFTER - 1), false);
    assert.equal(isUnveiled(VEIL_AFTER - 1, VEIL_AFTER), false);
    assert.equal(isUnveiled(50, 0), false);
    assert.equal(isUnveiled(VEIL_AFTER, VEIL_AFTER), true);
    assert.equal(isUnveiled(VEIL_AFTER + 4, VEIL_AFTER + 1), true);
  });

  it("never sends a photo in the swipe deck or for veiled matches", () => {
    // Guard against regressions in the server code: Person has no photo field
    // and match photos are only set behind the unveil check.
    const dataSrc = readFileSync(new URL("./data.ts", import.meta.url), "utf8");
    const person = dataSrc.slice(dataSrc.indexOf("export type Person"), dataSrc.indexOf("export type Message"));
    assert.ok(!/photo/.test(person), "Person (deck/inbound cards) must not carry a photo");
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    assert.match(
      apiSrc,
      /const shown = unveiled \? await unveiledPhoto\(sql, row\.user_id, options\.known\?\.\[row\.user_id\]\) : null;/,
    );
  });

  it("polling resends only new or changed match photos and never my own", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const fn = apiSrc.slice(apiSrc.indexOf("async function unveiledPhoto("), apiSrc.indexOf("type KnownPhotos"));
    assert.ok(fn.includes("case when md5(photo) = ${knownKey} then null else photo end"), "known photo must be skipped");
    const sync = apiSrc.slice(apiSrc.indexOf("export const syncVela"), apiSrc.indexOf("export const saveProfile"));
    assert.ok(sync.includes("poll: true"), "syncVela must run the snapshot in poll mode");
    assert.ok(sync.includes("cleanKnownPhotos(data?.known)"), "client fingerprints must be validated");
    const storeSrc = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
    const merge = storeSrc.slice(storeSrc.indexOf("  sync: async"), storeSrc.indexOf("  save: async"));
    assert.ok(merge.includes("mergeThreads(snapshot.threads, get().threads)"), "sync must merge with what the app has");
    const helper = storeSrc.slice(storeSrc.indexOf("function mergeThreads("), storeSrc.indexOf("function apply("));
    assert.ok(helper.includes("old.photoKey === thread.photoKey"), "client must keep its photo only when unchanged");
    assert.ok(!/\bme:/.test(merge), "sync must not overwrite my profile (poll leaves my photo out)");
  });

  it("does not SELECT other people's photos for the deck or swipe target", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const deck = apiSrc.slice(apiSrc.indexOf("const deckRows"), apiSrc.indexOf("const inboundRows"));
    assert.ok(deck.includes("from vela_profiles p"), "deck query missing");
    assert.ok(!/\bp\.photo\b/.test(deck), "deck must not load p.photo (veil never opens there)");
    const swipe = apiSrc.slice(apiSrc.indexOf("export const swipe"), apiSrc.indexOf("export const undoPass"));
    assert.ok(swipe.includes("from vela_profiles where user_id"), "swipe target query missing");
    assert.ok(!/prompts, photo, plus/.test(swipe), "swipe target must not load photo");
    // Matches are the only place other portraits leave the DB — and only after
    // unveil: the match query itself never reads photos, unveiledPhoto() does.
    const matches = apiSrc.slice(apiSrc.indexOf("const matchRows"), apiSrc.indexOf("const threads: Thread[]"));
    assert.ok(matches.includes("from vela_swipes mine"), "match query missing");
    assert.ok(!/\bp\.photo\b/.test(matches), "match query must not load photos before the unveil check");
    assert.equal(apiSrc.match(/unveiledPhoto\(/g)?.length, 2, "unveiledPhoto must have exactly one caller");
  });

  it("loads chat messages per active match through the pair index", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const snap = apiSrc.slice(apiSrc.indexOf("async function snapshot("), apiSrc.indexOf("function cleanProfile("));
    assert.ok(snap.includes("where pair_a = ${pairA} and pair_b = ${pairB}"), "per-pair message query missing");
    // "pair_a = me or pair_b = me" can't use vela_messages_pair_idx for the
    // pair_b side and would load blocked/suspended conversations on every poll.
    assert.ok(!/pair_b = \$\{userId\}/.test(snap), "snapshot must not scan all of a person's messages");
  });
});

describe("resonance", () => {
  const me = { orbit: "depth" as const, values: ["Neugier", "Humor", "Ruhe"] };

  it("follows the published formula", () => {
    assert.equal(resonance(me, { orbit: "light", values: [] }), 48 + 6);
    assert.equal(resonance(me, { orbit: "depth", values: [] }), 48 + 26);
    assert.equal(resonance(me, { orbit: "light", values: ["Humor"] }), 48 + 14 + 6);
    assert.equal(resonance(me, { orbit: "depth", values: ["Humor", "Mut"] }), 48 + 14 + 26);
  });

  it("is clamped to 46–96", () => {
    assert.equal(resonance(me, { orbit: "depth", values: ["Neugier", "Humor", "Ruhe"] }), RESONANCE.max);
    const parts = resonanceParts(me, { orbit: "depth", values: ["Neugier", "Humor", "Ruhe"] });
    assert.equal(parts.raw, 48 + 3 * 14 + 26);
    assert.deepEqual(parts.sharedValues, ["Neugier", "Humor", "Ruhe"]);
    assert.equal(parts.sameOrbit, true);
  });

  it("matches the formula written in the README", () => {
    const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
    const { base, perValue, sameOrbit, otherOrbit, min, max } = RESONANCE;
    assert.ok(
      readme.includes(`Resonanz = ${base} + ${perValue} × (gemeinsame Werte) + (gleicher Orbit ? ${sameOrbit} : ${otherOrbit}), begrenzt auf ${min}–${max}`),
      "README formula is out of sync with RESONANCE in data.ts",
    );
  });
});

describe("prompt questions", () => {
  it("skips the question that is already used", () => {
    const next = nextQuestion(PROMPT_BANK[0], PROMPT_BANK[1]);
    assert.equal(next, PROMPT_BANK[2]);
  });
});

describe("word filter", () => {
  it("normalises case, leetspeak, accents and stretched letters", () => {
    assert.equal(normalizeForFilter("HUUUURE!!"), "hure");
    assert.equal(normalizeForFilter("Gr\u00fc\u00dfe"), "gruesse");
    assert.equal(normalizeForFilter("h0r3"), "hore");
  });

  it("blocks listed words and phrases in their disguised forms", () => {
    for (const text of ["Du Hure", "h u r e", "SCHLAAAMPE", "fick dich", "F1ck dich!", "kys", "send nudes pls", "Hurensöhne"]) {
      assert.equal(isObjectionable(text), true, text);
    }
  });

  it("is not fooled by invisible characters", () => {
    for (const text of ["hu\u200Bre", "Du Hu\u00ADre", "fick\u2060 dich", "\uFEFFschlampe", "hu\u200Dre", "hu\u202Ere"]) {
      assert.equal(isObjectionable(text), true, JSON.stringify(text));
    }
  });

  it("strips invisible and control characters from stored text but keeps emoji intact", () => {
    assert.equal(stripInvisible("Le\u200Bna\u00AD"), "Lena");
    assert.equal(stripInvisible("\u202Eanel"), "anel");
    assert.equal(stripInvisible("hi\u0000\u0007 du\nwie geht's?\t"), "hi du\nwie geht's?\t");
    const family = "\u{1F469}\u200D\u2764\uFE0F\u200D\u{1F468}";
    assert.equal(stripInvisible(family), family);
    const scotland = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";
    assert.equal(stripInvisible(scotland), scotland);
  });

  it("is applied to everything people write", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    for (const field of ["raw.name", "raw.city", "row.a", "data?.note", "data?.text", "data?.details"]) {
      assert.ok(apiSrc.includes(`stripInvisible(String(${field} ?? ""))`), field);
    }
  });

  it("lets ordinary text through (whole words only)", () => {
    for (const text of [
      "",
      "Ich liebe Trauben und grape juice",
      "Wir könnten am Wochenende in die Mongolei",
      "Ich arbeite mit MongoDB",
      "Spice Girls im Auto, laut",
      "Schifffahrt auf der Donau",
      "Ich bin 25 und wohne in Wien",
      "Ich habe 1 Katze und 3 Pflanzen",
    ]) {
      assert.equal(isObjectionable(text), false, text);
    }
  });
});

describe("swipeCapHit", () => {
  it("lets normal use through and stops scripted bursts", () => {
    assert.equal(swipeCapHit(5, 40), false);
    assert.equal(swipeCapHit(SWIPE_CAPS.perMinute - 1, SWIPE_CAPS.perDay - 1), false);
    assert.equal(swipeCapHit(SWIPE_CAPS.perMinute, 10), true);
    assert.equal(swipeCapHit(0, SWIPE_CAPS.perDay), true);
  });

  it("adds atomic burst guards on swipe alongside the row-count caps", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const swipe = apiSrc.slice(apiSrc.indexOf("export const swipe"), apiSrc.indexOf("export const undoPass"));
    assert.match(swipe, /consumeRateLimit\(tx, `vela:swipe:\$\{context\.userId\}`/);
    assert.match(swipe, /SWIPE_MINUTE_RULE/);
    assert.match(swipe, /consumeRateLimit\(tx, `vela:swipe-day:\$\{context\.userId\}`/);
    assert.match(swipe, /SWIPE_DAY_RULE/);
    assert.match(swipe, /swipeCapHit/);
  });

  it("checks the free daily allowance and inserts under one per-swiper lock", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const swipe = apiSrc.slice(apiSrc.indexOf("export const swipe"), apiSrc.indexOf("export const undoPass"));
    const tx = swipe.slice(swipe.indexOf("withTransaction("));
    assert.ok(swipe.includes("withTransaction("));
    assert.match(tx, /pg_advisory_xact_lock\(hashtext\(\$\{`vela:swipe:\$\{context\.userId\}`\}\)\)/);
    const lock = tx.indexOf("pg_advisory_xact_lock");
    const free = tx.indexOf("FREE_SWIPES");
    const insert = tx.indexOf("insert into vela_swipes");
    assert.ok(lock < free && free < insert);
    assert.match(tx, /on conflict \(from_user, to_user\) do nothing/);
  });

  it("inserts the spark note under the per-sender message lock after the limit check", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const swipe = apiSrc.slice(apiSrc.indexOf("export const swipe"), apiSrc.indexOf("export const undoPass"));
    const noteBlock = swipe.slice(swipe.indexOf('direction === "spark" && note)'));
    const lock = noteBlock.indexOf("vela:message:${context.userId}");
    const limit = noteBlock.indexOf("messageLimitHit(tx");
    const insert = noteBlock.indexOf("'note')");
    assert.ok(lock > 0 && lock < limit && limit < insert);
  });

  it("undoes a pass atomically under the same per-swiper lock", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const undo = apiSrc.slice(apiSrc.indexOf("export const undoPass"), apiSrc.indexOf("export const sendMessage"));
    const tx = undo.slice(undo.indexOf("withTransaction("));
    assert.ok(undo.includes("withTransaction("));
    const lock = tx.indexOf("vela:swipe:${context.userId}");
    const plus = tx.indexOf("select plus");
    const del = tx.indexOf("delete from vela_swipes");
    assert.ok(lock > 0 && lock < plus && plus < del);
    assert.match(tx, /returning to_user/);
  });
});

describe("block and retention hardening", () => {
  it("lets an approved ID lift only an age suspension, never a rule ban", () => {
    const adminSrc = readFileSync(new URL("./admin-api.ts", import.meta.url), "utf8");
    const start = adminSrc.indexOf("export const decideIdCheck");
    const block = adminSrc.slice(start, adminSrc.indexOf("export const resolveReport"));
    assert.match(block, /set status = 'active'[\s\S]*?and status = 'suspended_age'/);
    assert.doesNotMatch(block, /set status = 'active', suspended_at = null where user_id = \$\{userId\}`/);
  });

  it("blocking and sending share a pair lock, and sendMessage re-checks under it", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const insertBlock = apiSrc.slice(apiSrc.indexOf("async function blockInTx"), apiSrc.indexOf("async function userExists"));
    const blockLock = insertBlock.indexOf("pairLockKey(from, to)");
    assert.ok(blockLock > 0 && blockLock < insertBlock.indexOf("insert into vela_blocks"));
    const send = apiSrc.slice(apiSrc.indexOf("export const sendMessage"), apiSrc.indexOf("export const setPlus"));
    const tx = send.slice(send.indexOf("withTransaction("));
    const pairLock = tx.indexOf("pairLockKey(context.userId, toUser)");
    const recheck = tx.indexOf("canInteract(tx, context.userId, toUser)");
    const insert = tx.indexOf("insert into vela_messages");
    assert.ok(pairLock > 0 && pairLock < recheck && recheck < insert);
    assert.match(send, /outcome === "ended"/);
  });

  it("swipe and its spark note re-check blocks under the pair lock before inserting", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const swipe = apiSrc.slice(apiSrc.indexOf("export const swipe"), apiSrc.indexOf("export const undoPass"));
    const first = swipe.slice(swipe.indexOf("withTransaction("));
    const pairLock = first.indexOf("pairLockKey(context.userId, toUser)");
    const recheck = first.indexOf("canInteract(tx, context.userId, toUser)");
    const insert = first.indexOf("insert into vela_swipes");
    assert.ok(pairLock > 0 && pairLock < recheck && recheck < insert);
    const note = swipe.slice(swipe.lastIndexOf("withTransaction("));
    const noteMsgLock = note.indexOf("vela:message:${context.userId}");
    const notePair = note.indexOf("pairLockKey(context.userId, toUser)");
    const noteRecheck = note.indexOf("canInteract(tx, context.userId, toUser)");
    const noteInsert = note.indexOf("insert into vela_messages");
    // Same lock order as sendMessage (sender lock, then pair lock), so no deadlock.
    assert.ok(noteMsgLock > 0 && noteMsgLock < notePair && notePair < noteRecheck && noteRecheck < noteInsert);
  });

  it("reportUser blocks inside the report transaction, reporter lock first", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const report = apiSrc.slice(apiSrc.indexOf("export const reportUser"), apiSrc.indexOf("export const deleteProfile"));
    const tx = report.slice(report.indexOf("withTransaction("));
    const reporterLock = tx.indexOf("vela:report:${context.userId}");
    const block = tx.indexOf("blockInTx(tx, context.userId, toUser)");
    const insert = tx.indexOf("insert into vela_reports");
    const flag = tx.indexOf("recordFlag(tx, toUser");
    assert.ok(reporterLock > 0 && reporterLock < block && block < insert && insert < flag);
    assert.doesNotMatch(report, /insertBlock\(/);
  });

  it("rate-limits blockUser and checks the target exists before insert", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const block = apiSrc.slice(apiSrc.indexOf("export const blockUser"), apiSrc.indexOf("export const reportUser"));
    assert.match(block, /consumeRateLimit\(sql, `vela:block:\$\{context\.userId\}`/);
    assert.match(block, /BLOCK_RULE/);
    assert.match(block, /userExists\(sql, toUser\)/);
    assert.match(block, /Zu viele Blockierungen gerade/);
    const report = apiSrc.slice(apiSrc.indexOf("export const reportUser"), apiSrc.indexOf("export const deleteProfile"));
    assert.match(report, /userExists\(sql, toUser\)/);
  });

  it("checks pending ID reviews and inserts an ID upload under one per-person lock", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const upload = apiSrc.slice(apiSrc.indexOf("export const uploadIdDocument"));
    const tx = upload.slice(upload.indexOf("withTransaction("));
    assert.ok(upload.includes("withTransaction("));
    const lock = tx.indexOf("vela:id-upload:${context.userId}`}))");
    const pending = tx.indexOf("status = 'pending' limit 1");
    const cap = tx.indexOf("consumeRateLimit(tx");
    const insert = tx.indexOf("insert into vela_id_checks");
    assert.ok(lock > 0 && lock < pending && pending < cap && cap < insert);
  });

  it("carries a remembered suspension over and inserts the profile under one per-person lock", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const save = apiSrc.slice(apiSrc.indexOf("export const saveProfile"), apiSrc.indexOf("export const swipe"));
    const tx = save.slice(save.indexOf("withTransaction("));
    assert.ok(save.includes("withTransaction("));
    const lock = tx.indexOf("vela:profile:${context.userId}`}))");
    const isNew = tx.indexOf("select 1 from vela_profiles");
    const carry = tx.indexOf("carryOverSuspension(tx");
    const open = tx.indexOf("openAgeSuspension(tx");
    const insert = tx.indexOf("insert into vela_profiles");
    assert.ok(lock > 0 && lock < isNew && isNew < carry && carry < open && open < insert);
    const del = apiSrc.slice(apiSrc.indexOf("export const deleteProfile"));
    assert.ok(del.indexOf("vela:profile:${id}`}))") < del.indexOf("delete from vela_profiles"));
  });

  it("throttles the retention fallback on app load and header-only cron", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const ageSrc = readFileSync(new URL("./age-review.server.ts", import.meta.url), "utf8");
    assert.match(ageSrc, /export async function purgeExpiredThrottled/);
    assert.match(ageSrc, /"vela:retention-purge"/);
    assert.match(ageSrc, /windowSec: 10 \* 60, max: 1/);
    const load = apiSrc.slice(apiSrc.indexOf("export const loadVela"), apiSrc.indexOf("export const syncVela"));
    assert.match(load, /purgeExpiredThrottled\(sql\)/);
    assert.doesNotMatch(load, /\.purgeExpired\(sql\)/);
    const cronSrc = readFileSync(new URL("../../routes/api/cron/retention.ts", import.meta.url), "utf8");
    assert.match(cronSrc, /auth === "secret"\) await purgeExpired\(sql\)/);
    assert.match(cronSrc, /purgeExpiredThrottled\(sql\)/);
  });

  it("purges stale rate counters, expired sessions and one-time tokens", () => {
    const ageSrc = readFileSync(new URL("./age-review.server.ts", import.meta.url), "utf8");
    const purge = ageSrc.slice(ageSrc.indexOf("export async function purgeExpired("));
    assert.match(purge.slice(0, purge.indexOf("\n}\n")), /purgeStaleAuthRows\(sql\)/);
    assert.match(ageSrc, /delete from "rateLimit" where "lastRequest" </);
    assert.match(ageSrc, /delete from "session" where "expiresAt" </);
    assert.match(ageSrc, /delete from "verification" where "expiresAt" </);
    // Never cut a live window short: retention must exceed every rule's window.
    const m = ageSrc.match(/RATE_LIMIT_RETENTION_MS = (\d+) \* 86_400_000;/);
    assert.ok(m);
    const RATE_LIMIT_RETENTION_MS = Number(m[1]) * 86_400_000;
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const windows = [...apiSrc.matchAll(/windowSec: (\d+)/g)].map((m) => Number(m[1]));
    assert.ok(windows.length > 0);
    for (const w of windows) assert.ok(w * 1000 < RATE_LIMIT_RETENTION_MS);
  });

  it("exposes a daily retention cron route that calls purgeExpired", () => {
    const cronSrc = readFileSync(new URL("../../routes/api/cron/retention.ts", import.meta.url), "utf8");
    assert.match(cronSrc, /createFileRoute\("\/api\/cron\/retention"\)/);
    assert.match(cronSrc, /purgeExpired/);
    assert.match(cronSrc, /CRON_SECRET/);
    assert.match(cronSrc, /x-vercel-cron/);
    const vercel = readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8");
    assert.match(vercel, /"path": "\/api\/cron\/retention"/);
    assert.match(vercel, /"schedule": "15 3 \* \* \*"/);
  });

  it("ships a full Content-Security-Policy (not only frame-ancestors)", () => {
    const vercel = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8")) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    const global = vercel.headers.find((block) => block.source === "/(.*)");
    assert.ok(global, "global headers block missing");
    const csp = global!.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    for (const part of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-src 'none'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "https://localhost",
      "frame-ancestors 'self' https://*.grok-sandbox.com",
      "upgrade-insecure-requests",
    ]) {
      assert.match(csp, new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    const perms = global!.headers.find((h) => h.key === "Permissions-Policy")?.value ?? "";
    assert.match(perms, /camera=\(\)/);
    assert.match(perms, /usb=\(\)/);
    assert.match(perms, /browsing-topics=\(\)/);
  });
});

describe("VELA+ checkout reuse", () => {
  const now = 1_800_000_000;
  it("reuses an open page, waits after payment, otherwise starts fresh", () => {
    assert.deepEqual(checkoutDecision({ status: "open", url: "https://pay", expires_at: now + 3600 }, now), { url: "https://pay" });
    assert.equal(checkoutDecision({ status: "open", url: "https://pay", expires_at: now + 30 }, now), null);
    assert.deepEqual(checkoutDecision({ status: "complete", created: now - 60 }, now), { completing: true });
    assert.equal(checkoutDecision({ status: "complete", created: now - 3600 }, now), null);
    assert.equal(checkoutDecision({ status: "expired", url: null }, now), null);
  });

  it("looks up and creates the checkout page under one per-person lock", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const checkout = apiSrc.slice(apiSrc.indexOf("export const startPlusCheckout"), apiSrc.indexOf("export const openPlusPortal"));
    const tx = checkout.slice(checkout.indexOf("withTransaction("));
    const lock = tx.indexOf("vela:checkout:${context.userId}");
    const reuse = tx.indexOf("reusableCheckout(tx");
    const create = tx.indexOf("createCheckout(tx");
    assert.ok(lock > 0 && lock < reuse && reuse < create);
    const del = apiSrc.slice(apiSrc.indexOf("export const deleteProfile"), apiSrc.indexOf("export const exportMyData"));
    assert.match(del, /expireOpenCheckout\(sql, id\)/);
    assert.match(del, /delete from vela_checkout_sessions/);
  });
});

describe("ban plus age suspension survive deletion", () => {
  it("carries both when a ban hid an open age suspension", async () => {
    const { carriedFromReasons } = await import("./age-review.server.ts");
    assert.deepEqual(carriedFromReasons([]), { ban: false, age: false });
    assert.deepEqual(carriedFromReasons(["age_suspension"]), { ban: false, age: true });
    assert.deepEqual(carriedFromReasons(["ban"]), { ban: true, age: false });
    assert.deepEqual(carriedFromReasons(["ban_age"]), { ban: true, age: true });
    assert.deepEqual(carriedFromReasons(["ban", "age_suspension"]), { ban: true, age: true });
  });

  it("remembers ban_age on delete and records the age flag on carry-over", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const ageSrc = readFileSync(new URL("./age-review.server.ts", import.meta.url), "utf8");
    const del = apiSrc.slice(apiSrc.indexOf("export const deleteProfile"));
    assert.match(del, /rememberSuspendedIdentity\(tx, id, ageOpen \? "ban_age" : "ban"\)/);
    const carry = ageSrc.slice(ageSrc.indexOf("export async function carryOverSuspension"));
    assert.ok(carry.indexOf('"suspended"') > 0 && carry.indexOf('"suspended"') < carry.indexOf('return "ban"'));
    assert.match(ageSrc, /then 'ban_age' else 'ban' end/);
  });
});

describe("chat polling sends only new messages", () => {
  const msg = (id: string) => ({ id, from: "me" as const, kind: "message" as const, text: id, at: "" });
  const thread = (ids: string[], messagesFrom?: number) =>
    ({ person: { id: "p" }, photo: null, photoKey: null, unveiled: false, mineCount: 0, theirCount: 0, messages: ids.map(msg), messagesFrom }) as never;

  it("appends the tail to the messages the client already had", () => {
    const merged = mergeMessages(thread(["c", "d"], 2), thread(["a", "b"]));
    assert.deepEqual(merged.messages.map((m) => m.id), ["a", "b", "c", "d"]);
    assert.equal(merged.messagesFrom, 0);
    const none = mergeMessages(thread([], 2), thread(["a", "b"]));
    assert.deepEqual(none.messages.map((m) => m.id), ["a", "b"]);
  });

  it("takes a full list as is and never builds a chat with a gap", () => {
    assert.deepEqual(mergeMessages(thread(["a"], 0), thread(["x", "y"])).messages.map((m) => m.id), ["a"]);
    const short = mergeMessages(thread(["d"], 3), thread(["a"]));
    assert.deepEqual(short.messages.map((m) => m.id), ["a"]);
  });

  it("server trusts the client's copy only when it lines up and counts the veil over the whole chat", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const snap = apiSrc.slice(apiSrc.indexOf("async function snapshot("), apiSrc.indexOf("function cleanProfile("));
    assert.ok(snap.includes("order by created_at asc, id asc"), "message order must be deterministic");
    assert.ok(snap.includes("messageRows[0]?.id !== held.last"), "tail only after the held last message is confirmed");
    assert.ok(/over \(\) as mine_total/.test(snap) && /over \(\) as their_total/.test(snap), "veil counts from window totals");
    const sync = apiSrc.slice(apiSrc.indexOf("export const syncVela"), apiSrc.indexOf("export const saveProfile"));
    assert.ok(sync.includes("knownMessages: cleanKnownMessages(data?.held)"));
    const load = apiSrc.slice(apiSrc.indexOf("export const loadVela"), apiSrc.indexOf("export const syncVela"));
    assert.ok(!load.includes("knownMessages"), "full loads always send whole chats");
  });

  it("sending a message answers light too and the app keeps its portrait", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const send = apiSrc.slice(apiSrc.indexOf("export const sendMessage"), apiSrc.indexOf("export const setPlus"));
    assert.ok(send.includes("poll: true") && send.includes("cleanKnownPhotos(data?.known)") && send.includes("cleanKnownMessages(data?.held)"));
    assert.ok(!send.includes("snapshot(sql, context.userId)"), "every answer of sendMessage must be the light one");
    const storeSrc = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
    const sendClient = storeSrc.slice(storeSrc.indexOf("  send: async"), storeSrc.indexOf("  unlockPlus: async"));
    assert.ok(sendClient.includes("...pollHints(get().threads)"));
    assert.ok(sendClient.includes("keepKnown(result.snapshot, get())"), "my portrait and held chats must survive the light answer");
    const keep = storeSrc.slice(storeSrc.indexOf("function keepKnown("), storeSrc.indexOf("function apply("));
    assert.ok(keep.includes("photo: state.me.photo") && keep.includes("mergeThreads(snapshot.threads, state.threads)"));
  });

  it("swipes and undo answer light too, with the full deck", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    for (const [from, to] of [
      ["export const swipe", "export const undoPass"],
      ["export const undoPass", "export const sendMessage"],
    ]) {
      const handler = apiSrc.slice(apiSrc.indexOf(from), apiSrc.indexOf(to));
      assert.ok(handler.includes("poll: true") && handler.includes("cleanKnownPhotos(data?.known)") && handler.includes("cleanKnownMessages(data?.held)"), from);
      assert.ok(!handler.includes("snapshot(sql, context.userId)"), `${from}: every answer must be the light one`);
    }
    const snap = apiSrc.slice(apiSrc.indexOf("async function snapshot("), apiSrc.indexOf("function cleanProfile("));
    assert.ok(snap.includes("deck: deckRows.map("), "the deck is never shortened by poll mode");
    const storeSrc = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
    for (const [from, to] of [
      ["  pass: async", "  undo: async"],
      ["  undo: async", "  spark: async"],
      ["  spark: async", "  send: async"],
    ]) {
      const client = storeSrc.slice(storeSrc.indexOf(from), storeSrc.indexOf(to));
      assert.ok(client.includes("pollHints(get().threads)"), from);
      assert.ok(client.includes("keepKnown(result.snapshot, get())"), from);
    }
  });
});
