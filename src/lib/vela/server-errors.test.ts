// Server error monitoring: what gets recorded, scrubbing, grouping, and that it never throws.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWriteBudget, recordServerError, serverErrorRow } from "./server-errors.server.ts";
import { normalizeClientError } from "./client-errors.server.ts";
import { userFacingError } from "./user-facing-error.ts";
import type { Sql } from "@/lib/db";

describe("serverErrorRow", () => {
  it("records unexpected errors as platform server with their source", () => {
    const row = serverErrorRow("fn:sendMessage", new TypeError("x is undefined"), "abc1234");
    assert.ok(row);
    assert.equal(row.platform, "server");
    assert.equal(row.path, "fn:sendMessage");
    assert.equal(row.release, "abc1234");
    assert.equal(row.message, "TypeError: x is undefined");
  });

  it("skips messages meant for the person, auth rejections and non-errors", () => {
    assert.equal(serverErrorRow("fn:exportMyData", userFacingError("Zu oft exportiert.")), null);
    const unauthorized = new Error("Unauthorized");
    unauthorized.name = "UnauthorizedError";
    assert.equal(serverErrorRow("fn:loadVela", unauthorized), null);
    const crossSite = new Error("nope");
    crossSite.name = "CrossSiteRequestError";
    assert.equal(serverErrorRow("fn:loadVela", crossSite), null);
    assert.equal(serverErrorRow("fn:loadVela", { status: 302 }), null);
    assert.equal(serverErrorRow("fn:loadVela", undefined), null);
  });

  it("scrubs emails and tokens and keeps sources clean", () => {
    const err = new Error("No such customer for anna@example.com token abcdefghijklmnopqrstuvwxyz0123456789");
    const row = serverErrorRow("webhook:stripe:invoice.payment_failed <script>", err);
    assert.ok(row);
    assert.ok(!row.message.includes("anna@example.com"));
    assert.ok(!row.message.includes("abcdefghijklmnopqrstuvwxyz0123456789"));
    assert.equal(row.path, "webhook:stripe:invoice.payment_failedscript");
  });

  it("groups the same error per source", () => {
    const err = new Error("boom");
    const a = serverErrorRow("fn:swipe", err);
    const b = serverErrorRow("fn:swipe", err);
    const c = serverErrorRow("fn:sendMessage", err);
    assert.equal(a?.fingerprint, b?.fingerprint);
    assert.notEqual(a?.fingerprint, c?.fingerprint);
  });

  it("app reports cannot pretend to come from the server", () => {
    assert.equal(normalizeClientError({ message: "x", platform: "server" })?.platform, "web");
    assert.equal(normalizeClientError({ message: "x", platform: "ios" })?.platform, "ios");
  });
});

describe("createWriteBudget", () => {
  it("allows a few writes per minute, then again after the window", () => {
    const take = createWriteBudget(2, 60_000);
    assert.equal(take(0), true);
    assert.equal(take(1), true);
    assert.equal(take(2), false);
    assert.equal(take(60_001), true);
  });
});

describe("recordServerError", () => {
  const quiet = async (fn: () => Promise<void>) => {
    const original = console.error;
    console.error = () => {};
    try {
      await fn();
    } finally {
      console.error = original;
    }
  };

  it("writes one row through the given connection", async () => {
    const queries: string[] = [];
    const sql = (async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      queries.push(text);
      if (text.includes("count(*)")) return [{ n: 0 }];
      return [];
    }) as unknown as Sql;
    await quiet(() => recordServerError("fn:swipe", new Error("db down"), sql));
    assert.ok(queries.some((q) => q.includes("insert into vela_client_errors")));
  });

  it("never throws, even when the database fails", async () => {
    const sql = (async () => {
      throw new Error("connection refused");
    }) as unknown as Sql;
    await quiet(() => recordServerError("fn:swipe", new Error("boom"), sql));
  });

  it("is wired into every server function after auth", () => {
    for (const file of ["./api.ts", "./admin-api.ts"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      const fns = src.split("createServerFn(").length - 1;
      assert.equal(src.split(".middleware([authMiddleware, errorMonitor])").length - 1, fns, file);
      assert.ok(!src.includes(".middleware([authMiddleware])"), file);
    }
  });
});
