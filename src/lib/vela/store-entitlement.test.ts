import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  entitlementFromSubscriber,
  eventUserIds,
  storeRowActive,
  webhookAuthorized,
  webhookSignatureValid,
} from "./store-entitlement.ts";

const NOW = Date.parse("2026-11-24T19:00:00Z");

function subscriber(entitlement: Record<string, unknown>, store = "app_store") {
  return {
    subscriber: {
      entitlements: { plus: { product_identifier: "vela_plus_monthly", ...entitlement } },
      subscriptions: { vela_plus_monthly: { store } },
    },
  };
}

describe("webhookAuthorized", () => {
  it("accepts only the configured Authorization value", () => {
    assert.equal(webhookAuthorized("Bearer abc123", "Bearer abc123"), true);
    assert.equal(webhookAuthorized("Bearer abc123", "abc123"), true);
    assert.equal(webhookAuthorized("abc123", "abc123"), true);
    assert.equal(webhookAuthorized("Bearer abc124", "abc123"), false);
    assert.equal(webhookAuthorized("", "abc123"), false);
    assert.equal(webhookAuthorized(null, "abc123"), false);
  });

  it("refuses everything while nothing is configured", () => {
    assert.equal(webhookAuthorized("Bearer ", ""), false);
    assert.equal(webhookAuthorized("anything", undefined), false);
  });
});

describe("webhookSignatureValid", () => {
  const secret = "test-signing-secret";
  const body = '{"event":{"type":"RENEWAL"}}';
  const sign = (t: number, payload = body) =>
    `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;

  it("accepts a fresh signature over the exact body", () => {
    assert.equal(webhookSignatureValid(body, sign(1000), secret, 300, 1100), true);
  });

  it("rejects a changed body, wrong secret, old timestamp or missing header", () => {
    assert.equal(webhookSignatureValid(`${body} `, sign(1000), secret, 300, 1100), false);
    assert.equal(webhookSignatureValid(body, sign(1000), "other", 300, 1100), false);
    assert.equal(webhookSignatureValid(body, sign(1000), secret, 300, 2000), false);
    assert.equal(webhookSignatureValid(body, null, secret, 300, 1100), false);
    assert.equal(webhookSignatureValid(body, "t=1000", secret, 300, 1100), false);
  });
});

describe("eventUserIds", () => {
  it("collects purchaser, aliases and both sides of a transfer, without anonymous ids", () => {
    assert.deepEqual(
      eventUserIds({
        app_user_id: "userA",
        original_app_user_id: "$RCAnonymousID:abc",
        aliases: ["userA", "$RCAnonymousID:abc"],
        transferred_from: ["userB"],
        transferred_to: ["userC"],
      }),
      ["userA", "userB", "userC"],
    );
  });

  it("ignores junk and caps the number of accounts", () => {
    assert.deepEqual(eventUserIds(null), []);
    assert.deepEqual(eventUserIds({ app_user_id: 42, aliases: "x" }), []);
    assert.deepEqual(eventUserIds({ app_user_id: "a'; drop table x;--" }), []);
    const many = Array.from({ length: 50 }, (_, i) => `user${i}`);
    assert.equal(eventUserIds({ aliases: many }).length, 10);
  });
});

describe("entitlementFromSubscriber", () => {
  it("is active until the entitlement expires", () => {
    const state = entitlementFromSubscriber(subscriber({ expires_date: "2026-12-24T19:00:00Z" }), "plus", NOW);
    assert.deepEqual(state, {
      store: "app_store",
      productId: "vela_plus_monthly",
      expiresAt: Date.parse("2026-12-24T19:00:00Z"),
      active: true,
    });
    const ended = entitlementFromSubscriber(subscriber({ expires_date: "2026-11-01T00:00:00Z" }), "plus", NOW);
    assert.equal(ended.active, false);
  });

  it("keeps Plus during the store's billing grace period", () => {
    const state = entitlementFromSubscriber(
      subscriber(
        { expires_date: "2026-11-20T00:00:00Z", grace_period_expires_date: "2026-11-30T00:00:00Z" },
        "play_store",
      ),
      "plus",
      NOW,
    );
    assert.equal(state.active, true);
    assert.equal(state.store, "play_store");
  });

  it("treats a missing expiry as a non-expiring purchase", () => {
    assert.equal(entitlementFromSubscriber(subscriber({ expires_date: null }), "plus", NOW).active, true);
  });

  it("does not grant Plus for other entitlements, other stores or empty answers", () => {
    assert.equal(entitlementFromSubscriber(subscriber({ expires_date: null }), "gold", NOW).active, false);
    assert.equal(entitlementFromSubscriber(subscriber({ expires_date: null }, "stripe"), "plus", NOW).active, false);
    assert.equal(entitlementFromSubscriber(subscriber({ expires_date: null }, "promotional"), "plus", NOW).active, false);
    assert.equal(entitlementFromSubscriber({}, "plus", NOW).active, false);
    assert.equal(entitlementFromSubscriber(null, "plus", NOW).active, false);
  });
});

describe("storeRowActive", () => {
  it("needs an active row that has not run out", () => {
    assert.equal(storeRowActive(undefined, NOW), false);
    assert.equal(storeRowActive({ active: true, expires_at: "2026-12-01T00:00:00Z" }, NOW), true);
    assert.equal(storeRowActive({ active: "t", expires_at: null }, NOW), true);
    assert.equal(storeRowActive({ active: true, expires_at: "2026-11-01T00:00:00Z" }, NOW), false);
    assert.equal(storeRowActive({ active: false, expires_at: null }, NOW), false);
  });
});
