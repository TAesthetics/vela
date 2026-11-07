// DB-backed rate limit helpers (password-reset / future abuse limits).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientIp, consumeRateLimit, rateLimitKey, type RateRule } from "./rate-limit.server.ts";
import type { Sql } from "@/lib/db";

describe("clientIp", () => {
  it("prefers the first forwarded address", () => {
    const headers = new Headers({ "x-forwarded-for": " 203.0.113.9, 10.0.0.1 " });
    assert.equal(clientIp(headers), "203.0.113.9");
  });

  it("falls back to unknown without headers", () => {
    assert.equal(clientIp(null), "unknown");
    assert.equal(clientIp(new Headers()), "unknown");
  });
});

describe("rateLimitKey", () => {
  it("hashes the IP so the table never stores it raw", () => {
    const key = rateLimitKey("vela:password-reset", "203.0.113.9");
    assert.match(key, /^vela:password-reset:[a-f0-9]{32}$/);
    assert.ok(!key.includes("203.0.113.9"));
    assert.equal(key, rateLimitKey("vela:password-reset", "203.0.113.9"));
    assert.notEqual(key, rateLimitKey("vela:password-reset", "203.0.113.10"));
  });
});

describe("consumeRateLimit", () => {
  // Simulates the single atomic upsert: values are
  // (id, key, now, now, windowMs, now, now, windowMs, max).
  function fakeSql(store: Map<string, { id: string; count: number; lastRequest: number }>): Sql {
    const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      if (!text.includes('insert into "rateLimit"') || !text.includes("on conflict (key) do update")) {
        throw new Error(`unexpected SQL: ${text}`);
      }
      const [id, key, now, , windowMs, , , , max] = values as [string, string, number, number, number, number, number, number, number];
      const row = store.get(key);
      if (!row) {
        store.set(key, { id, count: 1, lastRequest: now });
        return [{ count: 1 }];
      }
      const expired = now - row.lastRequest > windowMs;
      if (!expired && row.count >= max) return [];
      const count = expired ? 1 : row.count + 1;
      store.set(key, { ...row, count, lastRequest: now });
      return [{ count }];
    }) as Sql;
    sql.query = async () => [];
    return sql;
  }

  it("allows up to max hits inside the window, then blocks", async () => {
    const store = new Map();
    const sql = fakeSql(store);
    const rule: RateRule = { windowSec: 60, max: 3 };
    assert.equal(await consumeRateLimit(sql, "k", rule), true);
    assert.equal(await consumeRateLimit(sql, "k", rule), true);
    assert.equal(await consumeRateLimit(sql, "k", rule), true);
    assert.equal(await consumeRateLimit(sql, "k", rule), false);
    assert.equal(store.get("k")?.count, 3);
  });

  it("resets after the window has passed", async () => {
    const store = new Map([["k", { id: "x", count: 3, lastRequest: Date.now() - 61_000 }]]);
    const sql = fakeSql(store);
    assert.equal(await consumeRateLimit(sql, "k", { windowSec: 60, max: 3 }), true);
    assert.equal(store.get("k")?.count, 1);
  });

  it("uses one atomic statement per hit", async () => {
    let calls = 0;
    const store = new Map();
    const inner = fakeSql(store);
    const sql = (async (s: TemplateStringsArray, ...v: unknown[]) => {
      calls++;
      return inner(s, ...v);
    }) as Sql;
    await Promise.all([1, 2, 3, 4, 5].map(() => consumeRateLimit(sql, "k", { windowSec: 60, max: 2 })));
    assert.equal(calls, 5);
    assert.equal(store.get("k")?.count, 2);
  });
});
