// Admin access: ADMIN_USER_IDS pin and first-use pinning of ADMIN_EMAILS.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAdminUser } from "./admin-access.server.ts";
import type { Sql } from "@/lib/db";

function fakeDb(users: Record<string, string>, pins = new Map<string, string>(), fail = false) {
  let queries = 0;
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries++;
    if (fail) throw new Error("db down");
    const text = strings.join("?");
    if (text.includes('from "user"')) {
      const email = users[values[0] as string];
      return email === undefined ? [] : [{ email }];
    }
    if (text.includes("insert into vela_admin_pins")) {
      const [email, userId] = values as [string, string];
      if (!pins.has(email)) pins.set(email, userId);
      return [];
    }
    if (text.includes("from vela_admin_pins")) {
      const userId = pins.get(values[0] as string);
      return userId ? [{ user_id: userId }] : [];
    }
    throw new Error(`unexpected SQL: ${text}`);
  }) as unknown as Sql;
  return { sql, pins, queries: () => queries };
}

describe("isAdminUser", () => {
  it("denies everyone when nothing is configured", async () => {
    const db = fakeDb({ u1: "op@example.com" });
    assert.equal(await isAdminUser(db.sql, "u1", {}), false);
  });

  it("lets the existing operator in by e-mail (case-insensitive) and pins the account", async () => {
    const db = fakeDb({ u1: "Op@Example.com" });
    const env = { ADMIN_EMAILS: " other@example.com, OP@example.com " };
    assert.equal(await isAdminUser(db.sql, "u1", env), true);
    assert.equal(db.pins.get("op@example.com"), "u1");
    assert.equal(await isAdminUser(db.sql, "u1", env), true);
  });

  it("keeps out a new account that re-registered a pinned address", async () => {
    const db = fakeDb({ u2: "op@example.com" }, new Map([["op@example.com", "u1"]]));
    assert.equal(await isAdminUser(db.sql, "u2", { ADMIN_EMAILS: "op@example.com" }), false);
    assert.equal(db.pins.get("op@example.com"), "u1");
  });

  it("denies other e-mails and unknown accounts", async () => {
    const db = fakeDb({ u3: "someone@example.com" });
    const env = { ADMIN_EMAILS: "op@example.com" };
    assert.equal(await isAdminUser(db.sql, "u3", env), false);
    assert.equal(await isAdminUser(db.sql, "missing", env), false);
    assert.equal(await isAdminUser(db.sql, "", env), false);
    assert.equal(db.pins.size, 0);
  });

  it("ADMIN_USER_IDS wins over e-mails and needs no database", async () => {
    const db = fakeDb({ u1: "op@example.com", u2: "op@example.com" }, new Map([["op@example.com", "u1"]]));
    const env = { ADMIN_EMAILS: "op@example.com", ADMIN_USER_IDS: "u2, u9" };
    assert.equal(await isAdminUser(db.sql, "u2", env), true);
    assert.equal(await isAdminUser(db.sql, "u1", env), false);
    assert.equal(db.queries(), 0);
  });

  it("fails closed when the database errors", async () => {
    const db = fakeDb({ u1: "op@example.com" }, new Map(), true);
    assert.equal(await isAdminUser(db.sql, "u1", { ADMIN_EMAILS: "op@example.com" }), false);
  });
});
