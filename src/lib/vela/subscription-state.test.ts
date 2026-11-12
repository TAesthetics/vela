import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { subscriptionUpdate } from "./subscription-state.ts";

describe("subscriptionUpdate", () => {
  it("stores Stripe's current state for the same subscription, in any event order", () => {
    const current = { stripe_subscription_id: "sub_1", status: "canceled" };
    assert.equal(subscriptionUpdate(current, { id: "sub_1", status: "canceled" }, false), "save");
    assert.equal(
      subscriptionUpdate(
        { ...current, status: "active" },
        { id: "sub_1", status: "canceled" },
        false,
      ),
      "save",
    );
  });

  it("does not re-create a deleted account's row for an ended subscription", () => {
    assert.equal(subscriptionUpdate(undefined, { id: "sub_1", status: "canceled" }, false), "skip");
    assert.equal(subscriptionUpdate(undefined, { id: "sub_1", status: "active" }, false), "save");
    assert.equal(subscriptionUpdate(undefined, { id: "sub_1", status: "active" }, true), "save");
  });

  it("never lets an older ended subscription overwrite a newer active one", () => {
    const current = { stripe_subscription_id: "sub_new", status: "active" };
    assert.equal(subscriptionUpdate(current, { id: "sub_old", status: "canceled" }, false), "skip");
    assert.equal(subscriptionUpdate(current, { id: "sub_old", status: "canceled" }, true), "skip");
    assert.equal(subscriptionUpdate(current, { id: "sub_new", status: "past_due" }, false), "save");
  });
});
