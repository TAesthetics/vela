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
  function fakeSql(store: Map<string, { id: string; count: number; lastRequest: number }>): Sql {
    const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      if (text.includes('from "rateLimit"') && text.includes("where key")) {
        const key = String(values[0]);
        const row = store.get(key);
        return row ? [{ id: row.id, count: row.count, lastRequest: row.lastRequest }] : [];
      }
      // insert embeds literal count=1: values are (id, key, lastRequest)
      if (text.includes('insert into "rateLimit"')) {
        const [id, key, lastRequest] = values as [string, string, number];
        if (store.has(key)) throw new Error("unique");
        store.set(key, { id, count: 1, lastRequest });
        return [];
      }
      if (text.includes('update "rateLimit" set count = 1')) {
        const [now, key] = values as [number, string];
        const row = store.get(key);
        if (row) store.set(key, { ...row, count: 1, lastRequest: now });
        return [];
      }
      if (text.includes('update "rateLimit" set count = count + 1')) {
        const [now, key] = values as [number, string];
        const row = store.get(key);
        if (row) store.set(key, { ...row, count: row.count + 1, lastRequest: now });
        return [];
      }
      throw new Error(`unexpected SQL: ${text}`);
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
});
