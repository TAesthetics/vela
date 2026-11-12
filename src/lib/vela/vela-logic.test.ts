// Tests for VELA's core rules that run without a database: the photo veil,
// the public Resonanz formula (README) and the word filter (Apple 1.2).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { swipeCapHit, SWIPE_CAPS, isUnveiled, resonance, resonanceParts, RESONANCE, VEIL_AFTER, nextQuestion, PROMPT_BANK } from "./data.ts";
import { isObjectionable, normalizeForFilter } from "./content-filter.ts";
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
    assert.match(apiSrc, /photo: unveiled \? row\.photo : null/);
  });

  it("does not SELECT other people's photos for the deck or swipe target", () => {
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const deck = apiSrc.slice(apiSrc.indexOf("const deckRows"), apiSrc.indexOf("const inboundRows"));
    assert.ok(deck.includes("from vela_profiles p"), "deck query missing");
    assert.ok(!/\bp\.photo\b/.test(deck), "deck must not load p.photo (veil never opens there)");
    const swipe = apiSrc.slice(apiSrc.indexOf("export const swipe"), apiSrc.indexOf("export const undoPass"));
    assert.ok(swipe.includes("from vela_profiles where user_id"), "swipe target query missing");
    assert.ok(!/prompts, photo, plus/.test(swipe), "swipe target must not load photo");
    // Matches are the only place other portraits leave the DB — and only after unveil.
    assert.match(apiSrc, /const matchRows[\s\S]*?p\.photo[\s\S]*?from vela_swipes mine/);
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
