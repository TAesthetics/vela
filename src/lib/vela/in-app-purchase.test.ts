import assert from "node:assert/strict";
import test from "node:test";
import { isPurchaseCancelled, periodText, pickPlusPackage, publicSdkKeys, purchaseErrorText, sdkKeyFor } from "./in-app-purchase.ts";

test("only public RevenueCat keys reach the app, never a secret key", () => {
  assert.equal(publicSdkKeys({}), null);
  assert.equal(publicSdkKeys({ REVENUECAT_IOS_KEY: "  ", REVENUECAT_ANDROID_KEY: "" }), null);
  // Secret REST key pasted into the wrong variable: dropped.
  assert.equal(publicSdkKeys({ REVENUECAT_IOS_KEY: "sk_abcdefgh12345678" }), null);
  assert.equal(publicSdkKeys({ REVENUECAT_ANDROID_KEY: "sk_abcdefgh12345678" }), null);
  // Keys swapped between platforms: dropped too.
  assert.equal(publicSdkKeys({ REVENUECAT_IOS_KEY: "goog_abcdefgh1234", REVENUECAT_ANDROID_KEY: "appl_abcdefgh1234" }), null);
  assert.deepEqual(publicSdkKeys({ REVENUECAT_IOS_KEY: " appl_abcdefgh1234 " }), { ios: "appl_abcdefgh1234", android: null });
  assert.deepEqual(publicSdkKeys({ REVENUECAT_IOS_KEY: "appl_abcdefgh1234", REVENUECAT_ANDROID_KEY: "goog_XYZxyz98765" }), {
    ios: "appl_abcdefgh1234",
    android: "goog_XYZxyz98765",
  });
});

test("the key matches the platform the app runs on", () => {
  const sdk = { ios: "appl_abcdefgh1234", android: null, appUserId: "u1" };
  assert.equal(sdkKeyFor(sdk, "ios"), "appl_abcdefgh1234");
  assert.equal(sdkKeyFor(sdk, "android"), null);
  assert.equal(sdkKeyFor(sdk, "web"), null);
  assert.equal(sdkKeyFor(null, "ios"), null);
});

test("VELA+ sells the monthly package", () => {
  const monthly = { identifier: "$rc_monthly", product: { subscriptionPeriod: "P1M" } };
  const yearly = { identifier: "$rc_annual", product: { subscriptionPeriod: "P1Y" } };
  const custom = { identifier: "plus", product: { subscriptionPeriod: "P1M" } };
  assert.equal(pickPlusPackage(null), null);
  assert.equal(pickPlusPackage({ monthly: null, availablePackages: [] }), null);
  assert.equal(pickPlusPackage({ monthly, availablePackages: [yearly, monthly] }), monthly);
  assert.equal(pickPlusPackage({ monthly: null, availablePackages: [yearly, custom] }), custom);
  assert.equal(pickPlusPackage({ monthly: null, availablePackages: [yearly] }), yearly);
});

test("store periods read as German words", () => {
  assert.equal(periodText("P1M"), "Monat");
  assert.equal(periodText("P1Y"), "Jahr");
  assert.equal(periodText("P1W"), "Woche");
  assert.equal(periodText("P3M"), "3 Monate");
  assert.equal(periodText(null), null);
  assert.equal(periodText("monthly"), null);
});

test("closing the store sheet is not an error, other failures have a cause", () => {
  assert.equal(isPurchaseCancelled({ code: "1" }), true);
  assert.equal(isPurchaseCancelled({ code: "0", userCancelled: true }), true);
  assert.equal(isPurchaseCancelled(new Error("x")), false);
  assert.equal(purchaseErrorText({ code: "1" }), null);
  assert.match(purchaseErrorText({ code: "20" }) ?? "", /wartet/);
  assert.match(purchaseErrorText({ code: "10" }) ?? "", /Keine Verbindung/);
  assert.match(purchaseErrorText({ code: "35" }) ?? "", /Keine Verbindung/);
  assert.match(purchaseErrorText({ code: "6" }) ?? "", /wiederherstellen/);
  assert.match(purchaseErrorText({ code: "40" }) ?? "", /anderen VELA-Konto/);
  assert.match(purchaseErrorText(new Error("boom")) ?? "", /nicht geklappt/);
  assert.match(purchaseErrorText(null) ?? "", /nicht geklappt/);
});
